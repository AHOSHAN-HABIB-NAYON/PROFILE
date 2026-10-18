@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package com.appfix.studio.ui.visual

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.Redo
import androidx.compose.material.icons.automirrored.outlined.Undo
import androidx.compose.material.icons.outlined.ArrowDownward
import androidx.compose.material.icons.outlined.ArrowDropDown
import androidx.compose.material.icons.outlined.ArrowUpward
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.TouchApp
import androidx.compose.material.icons.outlined.ViewQuilt
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.appfix.core.layout.ClickAction
import com.appfix.core.layout.ClickSpec
import com.appfix.core.layout.ComponentKind
import com.appfix.core.layout.LayoutNode
import com.appfix.core.patch.Diff
import com.appfix.studio.ui.appViewModel
import com.appfix.studio.ui.components.BulletList
import com.appfix.studio.ui.components.ConfirmDialog
import com.appfix.studio.ui.components.EmptyState
import com.appfix.studio.ui.components.ErrorCard
import com.appfix.studio.ui.components.FileDiffView
import com.appfix.studio.ui.resources.parseColor
import com.appfix.studio.ui.theme.CodeTextStyle

@Composable
fun VisualEditorScreen(projectId: String, onBack: () -> Unit, onOpenSource: (String) -> Unit) {
    val vm = appViewModel(key = "visual-$projectId") { VisualEditorViewModel(it, projectId) }
    val state by vm.state.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val review by vm.review.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    var tab by rememberSaveable { mutableStateOf(0) }
    var pickLayout by remember { mutableStateOf(false) }
    var confirmLeave by remember { mutableStateOf(false) }
    var clickDialog by remember { mutableStateOf(false) }
    LaunchedEffect(message) { message?.let { snackbar.showSnackbar(it); vm.consumeMessage() } }

    Scaffold(
        topBar = {
            TopAppBar(
                navigationIcon = { IconButton(onClick = { if (state.dirty) confirmLeave = true else onBack() }) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back") } },
                title = {
                    Box {
                        Row(Modifier.clickable(role = Role.Button) { pickLayout = true }, verticalAlignment = Alignment.CenterVertically) {
                            Column {
                                Text(state.file?.let { it.name + ".xml" } ?: "Layout editor", maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(if (state.dirty) "Unsaved changes" else "Visual editor", style = MaterialTheme.typography.labelSmall)
                            }
                            Icon(Icons.Outlined.ArrowDropDown, contentDescription = "Choose layout")
                        }
                        DropdownMenu(expanded = pickLayout, onDismissRequest = { pickLayout = false }) {
                            state.layouts.forEach { f ->
                                DropdownMenuItem(text = { Text(f.name + if (f.qualifier.isNotEmpty()) " (${f.qualifier})" else "") }, onClick = { pickLayout = false; vm.openLayout(f) })
                            }
                        }
                    }
                },
                actions = {
                    IconButton(onClick = vm::undo, enabled = state.canUndo) { Icon(Icons.AutoMirrored.Outlined.Undo, contentDescription = "Undo") }
                    IconButton(onClick = vm::redo, enabled = state.canRedo) { Icon(Icons.AutoMirrored.Outlined.Redo, contentDescription = "Redo") }
                    TextButton(onClick = vm::prepareSave, enabled = state.dirty) { Text("Save") }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).imePadding()) {
            if (state.layouts.isEmpty() && state.file == null) {
                EmptyState(Icons.Outlined.ViewQuilt, "No XML layouts", "This project has no res/layout files. Compose UIs are edited in the code editor.")
                return@Column
            }
            state.parseError?.let { ErrorCard("The layout XML is invalid: $it. Fix it in the code editor.", Modifier.padding(12.dp), actionLabel = "Open source", onAction = { state.file?.let { f -> onOpenSource(f.path) } }) }
            Text(
                "Approximate preview — not the compiled app. Tap an element to select it.",
                style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            )
            Box(Modifier.weight(0.45f).fillMaxWidth().padding(horizontal = 16.dp)) {
                Surface(
                    shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceContainerLowest,
                    modifier = Modifier.fillMaxSize().border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(16.dp)),
                ) {
                    Column(Modifier.verticalScroll(rememberScrollState()).padding(8.dp)) {
                        state.tree?.let { LayoutPreview(it, state.resources, state.selected, vm::select) }
                    }
                }
            }
            PrimaryTabRow(selectedTabIndex = tab) {
                listOf("Properties", "Add", "Tree", "Changes").forEachIndexed { i, t -> Tab(selected = tab == i, onClick = { tab = i }, text = { Text(t) }) }
            }
            Box(Modifier.weight(0.55f).fillMaxWidth()) {
                when (tab) {
                    0 -> PropertiesPanel(vm, state, onClickAction = { clickDialog = true }, onOpenSource = { state.file?.let { onOpenSource(it.path) } })
                    1 -> AddPanel(vm, state)
                    2 -> TreePanel(state, vm::select)
                    3 -> ChangesPanel(state)
                }
            }
        }
    }

    if (clickDialog) ClickActionDialog(onDismiss = { clickDialog = false }) { spec -> clickDialog = false; vm.addClickAction(spec) }
    if (confirmLeave) ConfirmDialog(
        title = "Discard layout changes?", text = "You have unsaved changes in the visual editor.",
        confirmLabel = "Discard changes", destructive = true,
        onConfirm = { confirmLeave = false; vm.discard(); onBack() }, onDismiss = { confirmLeave = false },
    )
    review?.let { set ->
        val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(onDismissRequest = { vm.review.value = null }, sheetState = sheet) {
            LazyColumn(Modifier.navigationBarsPadding(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                item { Text(set.title, style = MaterialTheme.typography.titleLarge) }
                if (set.description.isNotEmpty()) item { BulletList(set.description.lines()) }
                items(set.changes, key = { it.path }) { FileDiffView(Diff.structured(it)) }
                item { BulletList(set.followUps) }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = vm::applyReview) { Text("Apply changes") }
                        OutlinedButton(onClick = { vm.review.value = null }) { Text("Keep editing") }
                    }
                }
            }
        }
    }
}

@Composable
private fun PropertiesPanel(vm: VisualEditorViewModel, state: VisualState, onClickAction: () -> Unit, onOpenSource: () -> Unit) {
    val node = state.selected?.let { state.tree?.find(it) }
    if (node == null) {
        Text("Select an element in the preview or the Tree tab.", modifier = Modifier.padding(16.dp))
        return
    }
    val tag = node.simpleTag
    val hasText = tag.endsWith("TextView") || (tag.endsWith("Button") && tag != "ImageButton") || tag.contains("Switch") || tag == "CheckBox" || tag == "Chip"
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(node.label, style = MaterialTheme.typography.titleMedium)
                    Text("Line ${node.line} · ${node.tag}", style = CodeTextStyle, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                IconButton(onClick = { vm.move(-1) }, enabled = node.path.isNotEmpty() && node.path.last() > 0) { Icon(Icons.Outlined.ArrowUpward, contentDescription = "Move up") }
                IconButton(onClick = { vm.move(1) }, enabled = node.path.isNotEmpty()) { Icon(Icons.Outlined.ArrowDownward, contentDescription = "Move down") }
                IconButton(onClick = vm::removeSelected, enabled = node.path.isNotEmpty()) { Icon(Icons.Outlined.Delete, contentDescription = "Remove element") }
            }
        }
        item { PropertyField("ID", node.id.orEmpty(), hint = "e.g. title_text") { v -> vm.setAttribute("android:id", v.takeIf { it.isNotBlank() }?.let { "@+id/" + it.removePrefix("@+id/").removePrefix("@id/") }) } }
        if (hasText) item { PropertyField("Text", resolve(node.attributes["android:text"], state)) { vm.setText("android:text", it) } }
        if (tag.endsWith("EditText")) item { PropertyField("Hint", resolve(node.attributes["android:hint"], state)) { vm.setText("android:hint", it) } }
        if (hasText || tag.endsWith("EditText")) {
            item { PropertyField("Text size", node.attributes["android:textSize"].orEmpty(), hint = "e.g. 18sp", number = false) { vm.setAttribute("android:textSize", it.ifBlank { null }?.let(::withSp)) } }
            item {
                Choice("Text style", listOf("normal", "bold", "italic"), node.attributes["android:textStyle"] ?: "normal") { vm.setAttribute("android:textStyle", it.takeIf { s -> s != "normal" }) }
            }
            item { ColorField("Text colour", node.attributes["android:textColor"].orEmpty()) { vm.setAttribute("android:textColor", it.ifBlank { null }) } }
        }
        item { ColorField("Background", node.attributes["android:background"].orEmpty()) { vm.setAttribute("android:background", it.ifBlank { null }) } }
        item { Choice("Width", listOf("wrap_content", "match_parent"), node.attributes["android:layout_width"].orEmpty(), allowCustom = true) { vm.setAttribute("android:layout_width", it) } }
        item { Choice("Height", listOf("wrap_content", "match_parent"), node.attributes["android:layout_height"].orEmpty(), allowCustom = true) { vm.setAttribute("android:layout_height", it) } }
        item { PropertyField("Padding", node.attributes["android:padding"].orEmpty(), hint = "e.g. 16dp") { vm.setAttribute("android:padding", it.ifBlank { null }?.let(::withDp)) } }
        item { PropertyField("Margin", node.attributes["android:layout_margin"].orEmpty(), hint = "e.g. 8dp (all sides)") { vm.setAttribute("android:layout_margin", it.ifBlank { null }?.let(::withDp)) } }
        item {
            Choice("Gravity", listOf("start", "center", "end", "center_vertical"), node.attributes["android:gravity"].orEmpty()) { vm.setAttribute("android:gravity", it) }
        }
        item { Choice("Visibility", listOf("visible", "invisible", "gone"), node.attributes["android:visibility"] ?: "visible") { vm.setAttribute("android:visibility", it.takeIf { v -> v != "visible" }) } }
        item {
            val ripple = node.attributes["android:foreground"]?.contains("selectableItemBackground") == true
            Choice("Touch ripple", listOf("off", "on"), if (ripple) "on" else "off") { vm.setRipple(it == "on") }
        }
        item { CornerField { r, c -> vm.setCornerRadius(r, c) } }
        if (tag in setOf("ImageView", "ImageButton", "ShapeableImageView")) {
            item { DrawablePicker(state.resources.drawables.toList(), node.attributes["android:src"].orEmpty()) { vm.setAttribute("android:src", it) } }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onClickAction, enabled = node.id != null) {
                    Icon(Icons.Outlined.TouchApp, contentDescription = null); Spacer(Modifier.width(6.dp)); Text("Click action")
                }
                TextButton(onClick = onOpenSource) { Text("Edit XML source") }
            }
            if (node.id == null) Text("Set an ID to add a click action.", style = MaterialTheme.typography.bodySmall)
            if (state.host == null) Text("No activity inflates this layout, so click actions are unavailable.", style = MaterialTheme.typography.bodySmall)
        }
    }
}

private fun resolve(v: String?, state: VisualState) = v?.let { if (it.startsWith("@string/")) state.resources.strings[it.removePrefix("@string/")] ?: it else it }.orEmpty()
private fun withDp(v: String) = v.trim().let { if (it.toFloatOrNull() != null) "${it}dp" else it }
private fun withSp(v: String) = v.trim().let { if (it.toFloatOrNull() != null) "${it}sp" else it }

@Composable
private fun PropertyField(label: String, value: String, hint: String? = null, number: Boolean = false, onSet: (String) -> Unit) {
    var text by remember(value) { mutableStateOf(value) }
    OutlinedTextField(
        value = text, onValueChange = { text = it }, label = { Text(label) }, singleLine = true,
        placeholder = { if (hint != null) Text(hint) },
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done, keyboardType = if (number) KeyboardType.Number else KeyboardType.Text),
        trailingIcon = { IconButton(onClick = { onSet(text) }, enabled = text != value) { Icon(Icons.Outlined.Check, contentDescription = "Apply $label") } },
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun ColorField(label: String, value: String, onSet: (String) -> Unit) {
    var text by remember(value) { mutableStateOf(value) }
    val color = parseColor(text)
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(36.dp).background(color ?: MaterialTheme.colorScheme.surfaceContainer, RoundedCornerShape(8.dp)).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(8.dp)))
        Spacer(Modifier.width(10.dp))
        OutlinedTextField(
            value = text, onValueChange = { text = it }, label = { Text(label) }, singleLine = true, placeholder = { Text("#FF2753E0 or @color/name") },
            isError = text.isNotBlank() && color == null && !text.startsWith("@") && !text.startsWith("?"),
            trailingIcon = { IconButton(onClick = { onSet(text.trim()) }, enabled = text != value) { Icon(Icons.Outlined.Check, contentDescription = "Apply $label") } },
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun Choice(label: String, options: List<String>, current: String, allowCustom: Boolean = false, onPick: (String) -> Unit) {
    Column {
        Text(label, style = MaterialTheme.typography.labelLarge)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            options.forEach { o -> FilterChip(selected = current == o, onClick = { onPick(o) }, label = { Text(o.replace('_', ' ')) }) }
            if (allowCustom) {
                var custom by remember(current) { mutableStateOf(if (current !in options) current else "") }
                OutlinedTextField(
                    value = custom, onValueChange = { custom = it }, singleLine = true, placeholder = { Text("e.g. 120dp") },
                    trailingIcon = { IconButton(onClick = { if (custom.isNotBlank()) onPick(withDp(custom)) }) { Icon(Icons.Outlined.Check, contentDescription = "Apply custom $label") } },
                    modifier = Modifier.width(160.dp),
                )
            }
        }
    }
}

@Composable
private fun CornerField(onApply: (Int, String) -> Unit) {
    var radius by remember { mutableStateOf("12") }
    var color by remember { mutableStateOf("#FFE3E8FF") }
    Column {
        Text("Corner radius", style = MaterialTheme.typography.labelLarge)
        Text("Creates a rounded shape drawable and uses it as the background.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(value = radius, onValueChange = { radius = it.filter(Char::isDigit).take(3) }, label = { Text("dp") }, singleLine = true, modifier = Modifier.width(90.dp),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
            OutlinedTextField(value = color, onValueChange = { color = it }, label = { Text("Fill colour") }, singleLine = true, modifier = Modifier.weight(1f))
            OutlinedButton(onClick = { radius.toIntOrNull()?.let { onApply(it, color.trim()) } }) { Text("Apply") }
        }
    }
}

@Composable
private fun DrawablePicker(options: List<String>, current: String, onPick: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth()) {
            Text("Image: ${current.ifEmpty { "none" }}", modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            Icon(Icons.Outlined.ArrowDropDown, contentDescription = null)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            (options + listOf("@android:drawable/ic_menu_gallery", "@android:drawable/ic_menu_info_details")).distinct().forEach { d ->
                DropdownMenuItem(text = { Text(d) }, onClick = { open = false; onPick(d) })
            }
        }
    }
}

@Composable
private fun AddPanel(vm: VisualEditorViewModel, state: VisualState) {
    val target = state.selected?.let { state.tree?.find(it) } ?: state.tree
    var pickLottie by remember { mutableStateOf(false) }
    if (pickLottie) {
        AlertDialog(
            onDismissRequest = { pickLottie = false },
            title = { Text("Choose animation") },
            text = {
                Column {
                    if (state.rawAnimations.isEmpty()) Text("No animations in res/raw yet. Add one in the Branding studio (Motion tab).")
                    state.rawAnimations.forEach { n -> TextButton(onClick = { pickLottie = false; vm.insert(ComponentKind.LOTTIE, n) }) { Text("@raw/$n") } }
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { pickLottie = false }) { Text("Cancel") } },
        )
    }
    Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp)) {
        Text(
            if (target?.isContainer == true) "Adds inside ${target.label}" else "Adds after ${target?.label ?: "the selection"}",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(8.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            ComponentKind.entries.forEach { k -> AssistChip(onClick = { if (k == ComponentKind.LOTTIE) pickLottie = true else vm.insert(k) }, label = { Text(k.displayName) }) }
        }
        Spacer(Modifier.height(12.dp))
        Text("Text you enter is stored in strings.xml instead of being hard-coded.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun TreePanel(state: VisualState, onSelect: (List<Int>) -> Unit) {
    val nodes = state.tree?.flatten().orEmpty()
    LazyColumn(contentPadding = PaddingValues(vertical = 8.dp)) {
        items(nodes, key = { it.path.joinToString(".") + it.tag }) { n: LayoutNode ->
            val selected = state.selected == n.path
            Row(
                Modifier.fillMaxWidth().selectable(selected = selected, onClick = { onSelect(n.path) })
                    .background(if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface)
                    .padding(start = (16 + n.path.size * 16).dp, end = 16.dp, top = 10.dp, bottom = 10.dp),
            ) {
                Text(n.label, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

@Composable
private fun ChangesPanel(state: VisualState) {
    Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp)) {
        if (state.history.isEmpty()) Text("No changes yet.") else BulletList(state.history)
    }
}

@Composable
private fun ClickActionDialog(onDismiss: () -> Unit, onAdd: (ClickSpec) -> Unit) {
    var action by remember { mutableStateOf(ClickAction.TOAST) }
    var value by remember { mutableStateOf("") }
    var title by remember { mutableStateOf("") }
    val label = when (action) {
        ClickAction.TOAST -> "Message"
        ClickAction.OPEN_URL -> "Website address"
        ClickAction.SHARE_TEXT -> "Text to share"
        ClickAction.OPEN_SCREEN -> "Activity class (e.g. com.example.app.AboutActivity)"
        ClickAction.CONFIRM_DIALOG -> "Dialog message"
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Click action") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                ClickAction.entries.forEach { a ->
                    Row(Modifier.fillMaxWidth().selectable(selected = action == a, role = Role.RadioButton) { action = a }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(selected = action == a, onClick = null)
                        Text(a.displayName, modifier = Modifier.padding(start = 8.dp))
                    }
                }
                Spacer(Modifier.height(8.dp))
                if (action == ClickAction.CONFIRM_DIALOG) {
                    OutlinedTextField(value = title, onValueChange = { title = it }, label = { Text("Dialog title") }, singleLine = true)
                }
                OutlinedTextField(value = value, onValueChange = { value = it }, label = { Text(label) }, singleLine = action != ClickAction.TOAST && action != ClickAction.SHARE_TEXT && action != ClickAction.CONFIRM_DIALOG)
                Text("The code is added to the activity that shows this layout and saved together with it.", style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = { Button(onClick = { onAdd(ClickSpec(action, value, title)) }, enabled = value.isNotBlank()) { Text("Add action") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
