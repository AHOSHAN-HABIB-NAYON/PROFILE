@file:OptIn(ExperimentalMaterial3Api::class)

package com.appfix.studio.ui.projects

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Android
import androidx.compose.material.icons.outlined.CloudDownload
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material.icons.outlined.FolderZip
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.Science
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.SearchOff
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.appfix.studio.data.db.ProjectKind
import com.appfix.studio.ui.LocalImportActions
import com.appfix.studio.ui.appContainer
import com.appfix.studio.ui.components.EmptyState
import com.appfix.studio.ui.components.ProjectCard

private enum class KindFilter(val label: String) { ALL("All"), APK("APKs"), SOURCE("Source") }

@Composable
fun ProjectsScreen(onOpenProject: (String) -> Unit) {
    val container = appContainer()
    val actions = LocalImportActions.current
    val projects by container.projects.projects.collectAsStateWithLifecycle(initialValue = null)
    var query by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableStateOf(KindFilter.ALL) }
    var showSheet by rememberSaveable { mutableStateOf(false) }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Projects") }) },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { showSheet = true },
                icon = { Icon(Icons.Outlined.Add, contentDescription = null) },
                text = { Text("Import") },
            )
        },
    ) { padding ->
        val all = projects
        if (all == null) return@Scaffold
        if (all.isEmpty()) {
            EmptyState(
                icon = Icons.Outlined.Inventory2,
                title = "No projects yet",
                body = "Import an APK or a source project. Everything stays on this device until you export it.",
                modifier = Modifier.padding(padding),
                actionLabel = "Import a project",
                onAction = { showSheet = true },
                secondaryLabel = "Try the sample project",
                onSecondary = actions.importSample,
            )
        } else {
            val visible = all.filter { p ->
                (filter == KindFilter.ALL || (filter == KindFilter.APK) == (p.kind == ProjectKind.APK)) &&
                    (query.isBlank() || listOfNotNull(p.name, p.packageName, p.origin, p.framework).any { it.contains(query.trim(), ignoreCase = true) })
            }
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 96.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                item {
                    OutlinedTextField(
                        value = query,
                        onValueChange = { query = it },
                        leadingIcon = { Icon(Icons.Outlined.Search, contentDescription = null) },
                        placeholder = { Text("Search by name or package") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        KindFilter.entries.forEach { f ->
                            FilterChip(selected = filter == f, onClick = { filter = f }, label = { Text(f.label) })
                        }
                    }
                }
                if (visible.isEmpty()) {
                    item {
                        EmptyState(Icons.Outlined.SearchOff, "No matches", "No project matches \"$query\".", actionLabel = "Clear search", onAction = { query = ""; filter = KindFilter.ALL })
                    }
                }
                items(visible, key = { it.id }) { p -> ProjectCard(p, onClick = { onOpenProject(p.id) }) }
            }
        }
    }

    if (showSheet) {
        ModalBottomSheet(onDismissRequest = { showSheet = false }) {
            Column(Modifier.navigationBarsPadding().padding(bottom = 16.dp)) {
                Text("Import", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp))
                fun pick(action: () -> Unit) { showSheet = false; action() }
                SheetItem(Icons.Outlined.Android, "APK file", "Inspect metadata, signatures and resources") { pick(actions.pickApk) }
                SheetItem(Icons.Outlined.FolderZip, "ZIP archive", "Android Studio, Flutter or React Native project") { pick(actions.pickZip) }
                SheetItem(Icons.Outlined.CloudDownload, "GitHub repository", "Download a branch, tag or commit") { pick(actions.openGitHub) }
                SheetItem(Icons.Outlined.FolderOpen, "Folder on this device", "Copy a project folder into AppFix Studio") { pick(actions.pickFolder) }
                SheetItem(Icons.Outlined.Science, "Sample project", "A small Kotlin app for trying features") { pick(actions.importSample) }
            }
        }
    }
}

@Composable
private fun SheetItem(icon: ImageVector, title: String, subtitle: String, onClick: () -> Unit) {
    ListItem(
        headlineContent = { Text(title) },
        supportingContent = { Text(subtitle) },
        leadingContent = { Icon(icon, contentDescription = null) },
        modifier = Modifier.clickable(onClick = onClick).padding(horizontal = 8.dp),
    )
    Spacer(Modifier.width(0.dp))
}
