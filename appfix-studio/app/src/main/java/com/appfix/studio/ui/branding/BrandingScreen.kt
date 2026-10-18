@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package com.appfix.studio.ui.branding

import android.graphics.Bitmap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PrimaryScrollableTabRow
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.appfix.core.branding.BrandingEditor
import com.appfix.core.patch.ChangeSet
import com.appfix.core.patch.Diff
import com.appfix.studio.AppContainer
import com.appfix.studio.data.settings.AppSettings
import com.appfix.studio.ui.appContainer
import com.appfix.studio.ui.components.BulletList
import com.appfix.studio.ui.components.ErrorCard
import com.appfix.studio.ui.components.FileDiffView
import com.appfix.studio.ui.components.InfoRow
import com.appfix.studio.ui.components.SectionCard
import com.appfix.studio.ui.resources.parseColor
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Shared state: builds a ChangeSet on a background thread and shows it for review. */
private class BrandingFlow(private val container: AppContainer, val projectId: String, private val scope: CoroutineScope) {
    var review by mutableStateOf<ChangeSet?>(null)
    var error by mutableStateOf<String?>(null)
    var working by mutableStateOf(false)
    var revision by mutableIntStateOf(0)

    suspend fun editor(): BrandingEditor = withContext(Dispatchers.IO) {
        BrandingEditor(container.storage.workspace(projectId), container.projects.refreshProjectInfo(projectId))
    }

    fun prepare(block: suspend (BrandingEditor) -> ChangeSet) {
        working = true
        error = null
        scope.launch {
            try {
                val e = editor()
                review = withContext(Dispatchers.Default) { block(e) }.takeIf { it.changes.isNotEmpty() } ?: run { error = "Nothing would change."; null }
            } catch (t: Exception) {
                error = t.message ?: t.javaClass.simpleName
            } finally {
                working = false
            }
        }
    }

    fun apply(set: ChangeSet, backup: Boolean, onDone: (String) -> Unit) {
        working = true
        scope.launch {
            try {
                container.projects.applyChange(projectId, set, backup)
                review = null
                revision++
                onDone("Applied \"${set.title}\". Undo it from the project's History tab.")
            } catch (t: Exception) {
                error = "Could not apply: ${t.message}"
            } finally {
                working = false
            }
        }
    }
}

@Composable
fun BrandingScreen(projectId: String, onBack: () -> Unit) {
    val container = appContainer()
    val settings by container.settings.settings.collectAsStateWithLifecycle(initialValue = AppSettings())
    val scope = rememberCoroutineScope()
    val flow = remember(projectId) { BrandingFlow(container, projectId, scope) }
    val snackbar = remember { SnackbarHostState() }
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var message by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(message) { message?.let { snackbar.showSnackbar(it); message = null } }
    val tabs = listOf("Icon", "Name", "Colours", "Splash", "Motion", "Font")

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Branding studio") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back") } },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            PrimaryScrollableTabRow(selectedTabIndex = tab, edgePadding = 8.dp) {
                tabs.forEachIndexed { i, t -> Tab(selected = tab == i, onClick = { tab = i }, text = { Text(t) }) }
            }
            if (flow.working) LinearProgressIndicator(Modifier.fillMaxWidth())
            flow.error?.let { ErrorCard(it, Modifier.padding(16.dp)) }
            when (tab) {
                0 -> IconTab(flow)
                1 -> NameTab(flow)
                2 -> ColorsTab(flow)
                3 -> SplashTab(flow)
                4 -> MotionTab(flow)
                5 -> FontTab(flow)
            }
        }
    }

    flow.review?.let { set ->
        val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(onDismissRequest = { flow.review = null }, sheetState = sheet) {
            LazyColumn(Modifier.navigationBarsPadding(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                item { Text(set.title, style = MaterialTheme.typography.titleLarge) }
                item { Text("${set.changes.size} file(s) change. Nothing is written until you apply.", style = MaterialTheme.typography.bodySmall) }
                items(set.changes, key = { it.path }) { FileDiffView(Diff.structured(it)) }
                if (set.followUps.isNotEmpty()) item { BulletList(set.followUps) }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { flow.apply(set, settings.autoBackupBeforeChanges) { message = it } }, enabled = !flow.working) { Text("Apply changes") }
                        OutlinedButton(onClick = { flow.review = null }) { Text("Discard") }
                    }
                }
            }
        }
    }
}

@Composable
private fun TabColumn(content: androidx.compose.foundation.lazy.LazyListScope.() -> Unit) {
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp), content = content)
}

@Composable
private fun IconTab(flow: BrandingFlow) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var source by remember { mutableStateOf<Bitmap?>(null) }
    var background by rememberSaveable { mutableStateOf("#FFFFFFFF") }
    var scale by rememberSaveable { mutableStateOf(0.8f) }
    var decodeError by remember { mutableStateOf<String?>(null) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) scope.launch {
            val bmp = withContext(Dispatchers.IO) { runCatching { IconRenderer.decode(context, uri) }.getOrNull() }
            if (bmp == null) decodeError = "That file could not be read as an image." else { source = bmp; decodeError = null }
        }
    }
    val bg = parseColor(background)
    TabColumn {
        item {
            SectionCard("Launcher icon", subtitle = "Generates PNG icons for every screen density, a round icon and an adaptive icon (Android 8+) with a themed-icon layer (Android 13+).") {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { picker.launch(arrayOf("image/png", "image/jpeg", "image/webp")) }) { Text(if (source == null) "Choose image" else "Choose another") }
                }
                decodeError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                Text("Use a square PNG with a transparent background, at least 512 × 512 px.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        val src = source
        if (src != null) {
            item {
                SectionCard("Preview") {
                    val previews = remember(src, background, scale) {
                        val color = (bg ?: Color.White).toArgb()
                        listOf(
                            com.appfix.core.branding.IconOutput("legacy", 192, com.appfix.core.branding.IconOutput.Kind.LEGACY),
                            com.appfix.core.branding.IconOutput("round", 192, com.appfix.core.branding.IconOutput.Kind.ROUND),
                        ).map { IconRenderer.render(src, it, color, scale).asImageBitmap() }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Image(previews[0], contentDescription = "Square icon preview", modifier = Modifier.size(72.dp))
                        Image(previews[1], contentDescription = "Round icon preview", modifier = Modifier.size(72.dp))
                        Box(Modifier.size(72.dp).clip(CircleShape).background(bg ?: Color.White), contentAlignment = Alignment.Center) {
                            Image(src.asImageBitmap(), contentDescription = "Adaptive icon preview", modifier = Modifier.size((72 * scale * 0.61f).dp))
                        }
                    }
                    Text("Square, round and adaptive (masked by the launcher).", style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(value = background, onValueChange = { background = it }, label = { Text("Background colour") }, singleLine = true, isError = bg == null)
                    Text("Image size: ${(scale * 100).toInt()}%", style = MaterialTheme.typography.bodyMedium)
                    Slider(value = scale, onValueChange = { scale = it }, valueRange = 0.4f..1f)
                    Button(onClick = {
                        flow.prepare { e ->
                            val color = (parseColor(background) ?: Color.White).toArgb()
                            val pngs = e.iconOutputs().associate { o -> o.path to IconRenderer.png(IconRenderer.render(src, o, color, scale)) }
                            e.iconChange(pngs, background.trim())
                        }
                    }, enabled = bg != null && !flow.working) { Text("Generate icons") }
                }
            }
        }
    }
}

@Composable
private fun NameTab(flow: BrandingFlow) {
    var current by remember { mutableStateOf<Pair<String, String?>?>(null) }
    var name by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(flow.revision) {
        current = runCatching { flow.editor().appName() }.getOrNull()
        current?.let { if (name.isEmpty()) name = it.first }
    }
    TabColumn {
        item {
            SectionCard("App name", subtitle = "Shown under the launcher icon and in system settings") {
                current?.let { (value, key) -> InfoRow("Current", value.ifEmpty { "(not set)" }); InfoRow("Stored in", key?.let { "@string/$it" } ?: "manifest android:label (will move to strings.xml)") }
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("New name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                Button(onClick = { flow.prepare { it.appNameChange(name.trim()) } }, enabled = name.isNotBlank() && !flow.working) { Text("Preview change") }
                Text("Translations in other values-xx folders keep their own names.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

private val commonThemeColors = listOf("colorPrimary", "colorOnPrimary", "colorSecondary", "colorOnSecondary", "colorAccent", "colorPrimaryDark", "android:statusBarColor", "android:navigationBarColor", "android:windowBackground")

@Composable
private fun ColorsTab(flow: BrandingFlow) {
    var colors by remember { mutableStateOf<List<Triple<String, String, String?>>?>(null) }
    var themeName by remember { mutableStateOf<String?>(null) }
    var editing by remember { mutableStateOf<Pair<String, String>?>(null) }
    var adding by remember { mutableStateOf(false) }
    LaunchedEffect(flow.revision) {
        val e = runCatching { flow.editor() }.getOrNull()
        themeName = e?.appTheme()?.styleName
        colors = e?.themeColors()
    }
    TabColumn {
        item {
            SectionCard("Theme colours", subtitle = themeName?.let { "From @style/$it" } ?: "The app theme was not found in res/values") {
                Text("Changing a @color resource updates every place that uses it.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(8.dp))
                colors.orEmpty().forEach { (item, raw, resolved) ->
                    Row(Modifier.fillMaxWidth().selectable(selected = false, role = Role.Button) { editing = item to (resolved ?: "") }.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(32.dp).background(resolved?.let(::parseColor) ?: Color.Transparent, RoundedCornerShape(8.dp)).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(8.dp)))
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(item, style = MaterialTheme.typography.titleSmall)
                            Text(if (resolved != null && resolved != raw) "$raw = $resolved" else raw, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
                if (themeName != null) TextButton(onClick = { adding = true }) { Text("Add a colour attribute") }
            }
        }
    }
    editing?.let { (item, value) ->
        ColorDialog("Edit $item", item, value, onDismiss = { editing = null }) { v -> editing = null; flow.prepare { it.themeColorChange(item, v) } }
    }
    if (adding) {
        val existing = colors.orEmpty().map { it.first }.toSet()
        var item by remember { mutableStateOf(commonThemeColors.firstOrNull { it !in existing } ?: "colorPrimary") }
        var open by remember { mutableStateOf(false) }
        AlertDialog(
            onDismissRequest = { adding = false },
            title = { Text("Add theme colour") },
            text = {
                Box {
                    OutlinedButton(onClick = { open = true }) { Text(item) }
                    DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                        commonThemeColors.filter { it !in existing }.forEach { c -> DropdownMenuItem(text = { Text(c) }, onClick = { item = c; open = false }) }
                    }
                }
            },
            confirmButton = { Button(onClick = { adding = false; editing = item to "#FF2753E0" }) { Text("Next") } },
            dismissButton = { TextButton(onClick = { adding = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun ColorDialog(title: String, label: String, initial: String, onDismiss: () -> Unit, onSave: (String) -> Unit) {
    var value by remember { mutableStateOf(initial.ifEmpty { "#FF2753E0" }) }
    val c = parseColor(value)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(value = value, onValueChange = { value = it.trim() }, label = { Text(label) }, singleLine = true, isError = c == null)
                Box(Modifier.fillMaxWidth().height(40.dp).background(c ?: Color.Transparent, RoundedCornerShape(8.dp)).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(8.dp)))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("#FF2753E0", "#FF6750A4", "#FF00897B", "#FFE53935", "#FFFB8C00", "#FF212121", "#FFFFFFFF").forEach { hex ->
                        Box(Modifier.size(32.dp).clip(CircleShape).background(parseColor(hex)!!).border(1.dp, MaterialTheme.colorScheme.outlineVariant, CircleShape)
                            .selectable(selected = value == hex, role = Role.Button) { value = hex })
                    }
                }
            }
        },
        confirmButton = { Button(onClick = { onSave(value) }, enabled = c != null) { Text("Preview change") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun SplashTab(flow: BrandingFlow) {
    var background by rememberSaveable { mutableStateOf("#FFFFFFFF") }
    var icon by rememberSaveable { mutableStateOf("") }
    var drawables by remember { mutableStateOf<List<String>>(emptyList()) }
    var open by remember { mutableStateOf(false) }
    LaunchedEffect(flow.revision) {
        drawables = runCatching { flow.editor().let { e -> withContext(Dispatchers.IO) { e.drawableResources() } } }.getOrDefault(emptyList())
    }
    val c = parseColor(background)
    TabColumn {
        item {
            SectionCard("Splash screen", subtitle = "The system splash shown while the app starts (Android 12+)") {
                OutlinedTextField(value = background, onValueChange = { background = it.trim() }, label = { Text("Background colour") }, singleLine = true, isError = c == null)
                Spacer(Modifier.height(8.dp))
                Box {
                    OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth()) { Text("Icon: ${icon.ifEmpty { "app icon (default)" }}") }
                    DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                        DropdownMenuItem(text = { Text("App icon (default)") }, onClick = { icon = ""; open = false })
                        drawables.forEach { d -> DropdownMenuItem(text = { Text(d) }, onClick = { icon = d; open = false }) }
                    }
                }
                Spacer(Modifier.height(8.dp))
                Box(Modifier.fillMaxWidth().height(120.dp).background(c ?: Color.White, RoundedCornerShape(12.dp)).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
                    Box(Modifier.size(56.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary))
                }
                Spacer(Modifier.height(8.dp))
                Button(onClick = { flow.prepare { it.splashChange(background, icon.ifEmpty { null }) } }, enabled = c != null && !flow.working) { Text("Preview change") }
            }
        }
    }
}

@Composable
private fun MotionTab(flow: BrandingFlow) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var kind by rememberSaveable { mutableStateOf(BrandingEditor.Transition.FADE) }
    var duration by rememberSaveable { mutableStateOf(250f) }
    var lottieName by rememberSaveable { mutableStateOf("intro_animation") }
    var lottieJson by remember { mutableStateOf<String?>(null) }
    var lottieFile by remember { mutableStateOf<String?>(null) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) scope.launch {
            lottieJson = withContext(Dispatchers.IO) { runCatching { context.contentResolver.openInputStream(uri)?.use { it.readBytes().decodeToString() } }.getOrNull() }
            lottieFile = uri.lastPathSegment?.substringAfterLast('/')
        }
    }
    TabColumn {
        item {
            SectionCard("Screen transitions", subtitle = "Animation used when activities open and close") {
                BrandingEditor.Transition.entries.forEach { t ->
                    Row(Modifier.fillMaxWidth().selectable(selected = kind == t, role = Role.RadioButton) { kind = t }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(selected = kind == t, onClick = null)
                        Text(t.displayName, modifier = Modifier.padding(start = 8.dp))
                    }
                }
                Text("Duration: ${duration.toInt()} ms", style = MaterialTheme.typography.bodyMedium)
                Slider(value = duration, onValueChange = { duration = it }, valueRange = 100f..600f, steps = 9)
                Button(onClick = { flow.prepare { it.transitionChange(kind, duration.toInt()) } }, enabled = !flow.working) { Text("Preview change") }
            }
        }
        item {
            SectionCard("Lottie animation", subtitle = "Adds a JSON animation to res/raw and the Lottie library (${BrandingEditor.LOTTIE_VERSION})") {
                OutlinedButton(onClick = { picker.launch(arrayOf("application/json", "text/plain", "application/octet-stream")) }) { Text(lottieFile ?: "Choose animation (.json)") }
                OutlinedTextField(value = lottieName, onValueChange = { lottieName = it.lowercase().filter { c -> c.isLetterOrDigit() || c == '_' } }, label = { Text("Resource name") }, singleLine = true)
                Spacer(Modifier.height(8.dp))
                Button(onClick = { val json = lottieJson ?: return@Button; flow.prepare { it.lottieChange(lottieName, json) } }, enabled = lottieJson != null && lottieName.isNotBlank() && !flow.working) { Text("Preview change") }
                Text("Then place it on a screen with the visual editor's \"Lottie animation\" component.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        item {
            SectionCard("Button feedback & loading", subtitle = "Available in the visual editor") {
                BulletList(listOf("Select a view and enable \"Touch ripple\" for click feedback.", "Add the \"Loading indicator\" component where work is in progress."))
            }
        }
    }
}

@Composable
private fun FontTab(flow: BrandingFlow) {
    val families = listOf("sans-serif" to "Default sans", "sans-serif-medium" to "Sans medium", "sans-serif-light" to "Sans light", "sans-serif-condensed" to "Condensed", "serif" to "Serif", "monospace" to "Monospace", "casual" to "Casual", "cursive" to "Cursive")
    var family by rememberSaveable { mutableStateOf("sans-serif") }
    TabColumn {
        item {
            SectionCard("App font", subtitle = "Sets android:fontFamily in the app theme (system fonts, no download)") {
                families.forEach { (id, label) ->
                    Row(Modifier.fillMaxWidth().selectable(selected = family == id, role = Role.RadioButton) { family = id }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(selected = family == id, onClick = null)
                        Text(label, modifier = Modifier.padding(start = 8.dp), fontFamily = when (id) {
                            "serif" -> androidx.compose.ui.text.font.FontFamily.Serif
                            "monospace" -> androidx.compose.ui.text.font.FontFamily.Monospace
                            "cursive", "casual" -> androidx.compose.ui.text.font.FontFamily.Cursive
                            else -> androidx.compose.ui.text.font.FontFamily.SansSerif
                        })
                    }
                }
                Button(onClick = { flow.prepare { it.fontChange(family) } }, enabled = !flow.working) { Text("Preview change") }
            }
        }
    }
}
