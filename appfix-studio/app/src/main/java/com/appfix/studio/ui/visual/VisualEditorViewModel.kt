package com.appfix.studio.ui.visual

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.appfix.core.layout.ClickActions
import com.appfix.core.layout.ClickSpec
import com.appfix.core.layout.ComponentKind
import com.appfix.core.layout.HostActivity
import com.appfix.core.layout.LayoutCapabilities
import com.appfix.core.layout.LayoutEditor
import com.appfix.core.layout.LayoutNode
import com.appfix.core.patch.ChangeSet
import com.appfix.core.patch.FileChange
import com.appfix.core.project.ModuleType
import com.appfix.core.project.ProjectInfo
import com.appfix.core.resources.ValuesEditor
import com.appfix.studio.AppContainer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

data class LayoutFile(val path: String, val name: String, val qualifier: String)

/** Resolved resources for the preview. */
data class PreviewResources(val strings: Map<String, String>, val colors: Map<String, String>, val drawables: Set<String>)

data class VisualState(
    val layouts: List<LayoutFile> = emptyList(),
    val file: LayoutFile? = null,
    val text: String = "",
    val tree: LayoutNode? = null,
    val parseError: String? = null,
    val selected: List<Int>? = null,
    val canUndo: Boolean = false,
    val canRedo: Boolean = false,
    val dirty: Boolean = false,
    val resources: PreviewResources = PreviewResources(emptyMap(), emptyMap(), emptySet()),
    val host: HostActivity? = null,
    val history: List<String> = emptyList(),
    /** Names of the JSON files in res/raw (Lottie animations). */
    val rawAnimations: List<String> = emptyList(),
)

class VisualEditorViewModel(private val container: AppContainer, val projectId: String) : ViewModel() {
    private val repo = container.projects
    private val ws = container.storage.workspace(projectId)
    val state = MutableStateFlow(VisualState())
    val message = MutableStateFlow<String?>(null)
    val review = MutableStateFlow<ChangeSet?>(null)

    private var info: ProjectInfo? = null
    private var resDir: String? = null
    private var sourceRoots: List<File> = emptyList()
    private var caps = LayoutCapabilities(false, false, false)
    private var original = ""
    private val undo = ArrayDeque<String>()
    private val redo = ArrayDeque<String>()
    /** string name -> value, added to values/strings.xml on save. */
    private val newStrings = LinkedHashMap<String, String>()
    /** Changed values of existing strings. */
    private val changedStrings = LinkedHashMap<String, String>()
    /** Extra files (e.g. rounded-corner drawables): path -> content. */
    private val newFiles = LinkedHashMap<String, String>()
    private var hostSource: Pair<String, String>? = null
    private val historyLabels = mutableListOf<String>()

    init {
        viewModelScope.launch {
            val loaded = withContext(Dispatchers.IO) {
                val i = repo.refreshProjectInfo(projectId)
                val module = i.modules.firstOrNull { it.type == ModuleType.APPLICATION && it.resDir != null } ?: i.modules.firstOrNull { it.resDir != null }
                val res = module?.resDir?.let { if (i.root.isEmpty()) it else "${i.root}/$it" }
                val layouts = res?.let { r ->
                    File(ws, r).listFiles().orEmpty().filter { it.isDirectory && it.name.startsWith("layout") }.flatMap { d ->
                        d.listFiles().orEmpty().filter { it.extension == "xml" }.map { LayoutFile(it.relativeTo(ws).invariantSeparatorsPath, it.nameWithoutExtension, d.name.removePrefix("layout").removePrefix("-")) }
                    }.sortedWith(compareBy({ it.qualifier }, { it.name }))
                }.orEmpty()
                val buildText = module?.buildFile?.let { File(File(ws, i.root), it).takeIf(File::isFile)?.readText() }.orEmpty()
                val toml = File(File(ws, i.root), "${i.androidDir?.let { if (it.isEmpty()) "" else "$it/" } ?: ""}gradle/libs.versions.toml").takeIf { it.isFile }?.readText().orEmpty()
                val deps = buildText + toml
                caps = LayoutCapabilities(deps.contains("com.google.android.material") || deps.contains("libs.material"), deps.contains("appcompat"), deps.contains("recyclerview"))
                sourceRoots = module?.let { m -> listOf("src/main/java", "src/main/kotlin").map { File(File(ws, i.root), if (m.dir.isEmpty()) it else "${m.dir}/$it") }.filter { it.isDirectory } }.orEmpty()
                info = i
                resDir = res
                layouts
            }
            state.value = state.value.copy(layouts = loaded)
            loaded.firstOrNull { it.name == "activity_main" && it.qualifier.isEmpty() }?.let(::openLayout) ?: loaded.firstOrNull()?.let(::openLayout)
        }
    }

    fun openLayout(file: LayoutFile) {
        if (state.value.dirty) { message.value = "Save or discard your changes before opening another layout"; return }
        viewModelScope.launch {
            val text = withContext(Dispatchers.IO) { File(ws, file.path).readText() }
            val host = withContext(Dispatchers.IO) { ClickActions.findHost(sourceRoots, ws, file.name) }
            original = text
            undo.clear(); redo.clear(); newStrings.clear(); changedStrings.clear(); newFiles.clear(); hostSource = null; historyLabels.clear()
            state.value = state.value.copy(file = file, host = host, selected = emptyList())
            updateText(text, record = false)
            reloadResources()
        }
    }

    private suspend fun reloadResources() {
        val res = resDir ?: return
        val r = withContext(Dispatchers.IO) {
            fun values(name: String, type: String) = File(ws, "$res/values/$name").takeIf { it.isFile }?.let { f ->
                runCatching { ValuesEditor.read(f.readText()).filter { it.type == type }.associate { it.name to it.value } }.getOrDefault(emptyMap())
            }.orEmpty()
            val drawables = File(ws, res).listFiles().orEmpty().filter { it.isDirectory && (it.name.startsWith("drawable") || it.name.startsWith("mipmap")) }
                .flatMap { d -> d.listFiles().orEmpty().map { "@${d.name.substringBefore('-')}/${it.name.substringBefore('.')}" } }.toSortedSet()
            PreviewResources(values("strings.xml", "string"), values("colors.xml", "color"), drawables) to
                File(ws, "$res/raw").listFiles().orEmpty().filter { it.extension == "json" }.map { it.nameWithoutExtension }.sorted()
        }
        state.value = state.value.copy(resources = r.first.copy(strings = r.first.strings + changedStrings + newStrings), rawAnimations = r.second)
    }

    private fun updateText(text: String, record: Boolean = true, label: String? = null) {
        if (record) {
            undo.addLast(state.value.text)
            if (undo.size > 100) undo.removeFirst()
            redo.clear()
            label?.let { historyLabels += it }
        }
        val parsed = runCatching { LayoutEditor.parse(text) }
        state.value = state.value.copy(
            text = text,
            tree = parsed.getOrNull() ?: state.value.tree,
            parseError = parsed.exceptionOrNull()?.message,
            canUndo = undo.isNotEmpty(),
            canRedo = redo.isNotEmpty(),
            dirty = text != original || newStrings.isNotEmpty() || changedStrings.isNotEmpty() || newFiles.isNotEmpty() || hostSource != null,
            history = historyLabels.toList(),
        )
    }

    fun undo() {
        val prev = undo.removeLastOrNull() ?: return
        redo.addLast(state.value.text)
        historyLabels.removeLastOrNull()
        updateText(prev, record = false)
        state.value = state.value.copy(canUndo = undo.isNotEmpty(), canRedo = true, selected = state.value.selected?.takeIf { state.value.tree?.find(it) != null } ?: emptyList())
    }

    fun redo() {
        val next = redo.removeLastOrNull() ?: return
        undo.addLast(state.value.text)
        updateText(next, record = false)
        state.value = state.value.copy(canUndo = true, canRedo = redo.isNotEmpty())
    }

    fun select(path: List<Int>?) { state.value = state.value.copy(selected = path) }

    private inline fun edit(label: String, block: (String) -> String) {
        try {
            updateText(block(state.value.text), label = label)
        } catch (e: Exception) {
            message.value = e.message ?: "Edit failed"
        }
    }

    fun setAttribute(name: String, value: String?) {
        val path = state.value.selected ?: return
        edit("Set ${name.substringAfter(':')}") { LayoutEditor.setAttribute(it, path, name, value?.trim()) }
    }

    /** Edits visible text through a string resource rather than hard-coding it. */
    fun setText(attribute: String, value: String) {
        val node = selectedNode() ?: return
        val current = node.attributes[attribute]
        if (current != null && current.startsWith("@string/")) {
            val key = current.removePrefix("@string/")
            if (key in newStrings) newStrings[key] = value else changedStrings[key] = value
            state.value = state.value.copy(resources = state.value.resources.copy(strings = state.value.resources.strings + (key to value)))
            updateText(state.value.text, record = false)
            historyLabels += "Change text of ${node.label}"
            state.value = state.value.copy(dirty = true, history = historyLabels.toList())
        } else {
            val base = (node.id ?: node.simpleTag.lowercase()) + "_" + attribute.substringAfter(':').lowercase()
            var key = base
            var i = 2
            while (key in state.value.resources.strings || key in newStrings) key = "${base}_${i++}"
            newStrings[key] = value
            state.value = state.value.copy(resources = state.value.resources.copy(strings = state.value.resources.strings + (key to value)))
            setAttribute(attribute, "@string/$key")
        }
    }

    /** Applies a corner radius by creating a shape drawable used as the background. */
    fun setCornerRadius(radiusDp: Int, colorHex: String) {
        val node = selectedNode() ?: return
        val res = resDir ?: return
        val id = node.id ?: run { message.value = "Give the element an id first (only elements with an id can get rounded corners)"; return }
        if (ValuesEditor.validate("color", "c", colorHex) != null) { message.value = "Enter a colour like #FFE3F2FD"; return }
        val name = "bg_${id}_rounded"
        newFiles["$res/drawable/$name.xml"] = """
            |<?xml version="1.0" encoding="utf-8"?>
            |<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
            |    <solid android:color="$colorHex" />
            |    <corners android:radius="${radiusDp}dp" />
            |</shape>
            |""".trimMargin()
        state.value = state.value.copy(resources = state.value.resources.copy(drawables = state.value.resources.drawables + "@drawable/$name"))
        setAttribute("android:background", "@drawable/$name")
    }

    /** Adds or removes ripple touch feedback on the selected view (one undo step). */
    fun setRipple(enabled: Boolean) {
        val path = state.value.selected ?: return
        edit(if (enabled) "Add touch ripple" else "Remove touch ripple") { t ->
            var out = LayoutEditor.setAttribute(t, path, "android:foreground", if (enabled) "?android:attr/selectableItemBackground" else null)
            out = LayoutEditor.setAttribute(out, path, "android:clickable", if (enabled) "true" else null)
            LayoutEditor.setAttribute(out, path, "android:focusable", if (enabled) "true" else null)
        }
    }

    fun insert(kind: ComponentKind, label: String? = null) {
        val tree = state.value.tree ?: return
        val sel = state.value.selected ?: emptyList()
        val node = tree.find(sel) ?: tree
        val (parentPath, index) = if (node.isContainer && !(node.simpleTag in setOf("ScrollView", "NestedScrollView", "HorizontalScrollView") && node.children.isNotEmpty())) {
            sel to null
        } else if (node.isContainer && node.children.isNotEmpty()) {
            (sel + 0) to null
        } else {
            sel.dropLast(1) to (sel.lastOrNull()?.plus(1))
        }
        try {
            val ids = LayoutEditor.declaredIds(state.value.text) + allProjectIds()
            val r = LayoutEditor.insert(state.value.text, parentPath, index, kind, caps, ids, label)
            newStrings.putAll(r.strings)
            state.value = state.value.copy(resources = state.value.resources.copy(strings = state.value.resources.strings + r.strings))
            updateText(r.layoutText, label = "Add ${kind.displayName.lowercase()}")
            val newTree = state.value.tree
            val newPath = newTree?.flatten()?.firstOrNull { it.id == r.newId }?.path
            state.value = state.value.copy(selected = newPath)
        } catch (e: Exception) {
            message.value = e.message
        }
    }

    private fun allProjectIds(): Set<String> = resDir?.let { r ->
        File(ws, r).listFiles().orEmpty().filter { it.isDirectory && it.name.startsWith("layout") }.flatMap { d -> d.listFiles().orEmpty().flatMap { LayoutEditor.declaredIds(it.readText()) } }.toSet()
    }.orEmpty()

    fun removeSelected() {
        val path = state.value.selected ?: return
        if (path.isEmpty()) { message.value = "The root layout cannot be removed"; return }
        edit("Remove element") { LayoutEditor.remove(it, path) }
        state.value = state.value.copy(selected = path.dropLast(1))
    }

    fun move(delta: Int) {
        val path = state.value.selected ?: return
        try {
            val (text, newPath) = LayoutEditor.move(state.value.text, path, delta)
            if (text != state.value.text) {
                updateText(text, label = if (delta < 0) "Move up" else "Move down")
                state.value = state.value.copy(selected = newPath)
            }
        } catch (e: Exception) {
            message.value = e.message
        }
    }

    fun addClickAction(spec: ClickSpec) {
        val node = selectedNode() ?: return
        val id = node.id ?: run { message.value = "Only elements with an android:id can get a click action"; return }
        val host = state.value.host ?: run { message.value = "No activity using this layout was found (Fragments and Compose hosts are not supported yet)"; return }
        viewModelScope.launch {
            try {
                val base = hostSource?.second ?: withContext(Dispatchers.IO) { File(ws, host.path).readText() }
                val original = hostSource?.first ?: base
                val h = ClickActions.addHandler(base, host, id, spec)
                hostSource = original to h.source
                newStrings.putAll(h.strings)
                historyLabels += "${spec.action.displayName} on #$id"
                state.value = state.value.copy(dirty = true, history = historyLabels.toList(), resources = state.value.resources.copy(strings = state.value.resources.strings + h.strings))
                message.value = "Click action added to ${host.path.substringAfterLast('/')} (saved with the layout)"
            } catch (e: Exception) {
                message.value = e.message
            }
        }
    }

    fun selectedNode(): LayoutNode? = state.value.selected?.let { state.value.tree?.find(it) }

    /** Builds the reviewable change for everything edited in this session. */
    fun prepareSave() {
        val file = state.value.file ?: return
        val res = resDir
        viewModelScope.launch {
            try {
                val changes = withContext(Dispatchers.IO) {
                    val list = mutableListOf<FileChange>()
                    val disk = File(ws, file.path).readText()
                    if (disk != original) throw IllegalStateException("${file.name}.xml changed on disk since it was opened. Reopen it to continue.")
                    if (state.value.text != original) list += FileChange(file.path, original, state.value.text)
                    if (res != null && (newStrings.isNotEmpty() || changedStrings.isNotEmpty())) {
                        val path = "$res/values/strings.xml"
                        val before = File(ws, path).takeIf { it.isFile }?.readText()
                        var t = before
                        for ((k, v) in changedStrings) t = ValuesEditor.setValue(t!!, "string", k, v)
                        for ((k, v) in newStrings) t = if (t == null) ValuesEditor.newFile("string", k, v) else ValuesEditor.add(t, "string", k, v)
                        list += FileChange(path, before, t)
                    }
                    for ((path, content) in newFiles) {
                        val before = File(ws, path).takeIf { it.isFile }?.readText()
                        list += FileChange(path, before, content)
                    }
                    hostSource?.let { (before, after) -> list += FileChange(state.value.host!!.path, before, after) }
                    list
                }
                if (changes.isEmpty()) { message.value = "Nothing to save"; return@launch }
                review.value = ChangeSet(title = "Edit ${file.name}.xml", description = historyLabels.joinToString("\n"), source = "visual-editor", changes = changes,
                    followUps = listOf("The preview is approximate. Rebuild and run the app to see the real result."))
            } catch (e: Exception) {
                message.value = e.message
            }
        }
    }

    fun applyReview() {
        val set = review.value ?: return
        viewModelScope.launch {
            try {
                repo.applyChange(projectId, set, container.settings.settings.first().autoBackupBeforeChanges)
                review.value = null
                val file = state.value.file
                state.value = state.value.copy(dirty = false)
                newStrings.clear(); changedStrings.clear(); newFiles.clear(); hostSource = null
                if (file != null) openLayout(file)
                message.value = "Saved. Undo it from the project's History tab."
            } catch (e: Exception) {
                message.value = "Could not save: ${e.message}"
            }
        }
    }

    fun discard() {
        val file = state.value.file ?: return
        state.value = state.value.copy(dirty = false)
        openLayout(file)
    }

    fun consumeMessage() { message.value = null }
}
