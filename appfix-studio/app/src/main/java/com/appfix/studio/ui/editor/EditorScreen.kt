@file:OptIn(ExperimentalMaterial3Api::class)

package com.appfix.studio.ui.editor

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.appfix.studio.data.db.ProjectKind
import com.appfix.studio.data.settings.AppSettings
import com.appfix.studio.ui.appContainer
import com.appfix.studio.ui.components.EmptyState
import com.appfix.studio.ui.components.FileTree
import com.appfix.studio.ui.components.WorkspaceTreeSource

/** Project explorer. Tapping a file opens it; full editing is added in the next phase. */
@Composable
fun EditorScreen(onOpenProjects: () -> Unit) {
    val container = appContainer()
    val settings by container.settings.settings.collectAsStateWithLifecycle(initialValue = AppSettings())
    val projects by container.projects.projects.collectAsStateWithLifecycle(initialValue = emptyList())
    val project = projects.firstOrNull { it.id == settings.currentProjectId && it.kind == ProjectKind.SOURCE }
    var openPath by rememberSaveable { mutableStateOf<String?>(null) }

    val path = openPath
    if (project != null && path != null) {
        FileViewerScreen(project.id, path, null, onBack = { openPath = null })
        return
    }
    Scaffold(
        topBar = {
            TopAppBar(title = {
                Column {
                    Text("Editor")
                    if (project != null) Text(project.name, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            })
        },
    ) { padding ->
        if (project == null) {
            EmptyState(
                Icons.Outlined.Code,
                "No source project open",
                "Open a source project (ZIP, GitHub, folder or the sample) from Projects. APK files are browsed from their project page.",
                modifier = Modifier.padding(padding),
                actionLabel = "Choose a project",
                onAction = onOpenProjects,
            )
        } else {
            val source = remember(project.id) { WorkspaceTreeSource(container.storage.workspace(project.id)) }
            FileTree(
                source,
                onOpenFile = { openPath = it.path },
                modifier = Modifier.padding(padding),
                refreshKey = project.updatedAt,
                header = {
                    Text(
                        "Browse files. Tap a file to view it with line numbers.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    )
                },
            )
        }
    }
}
