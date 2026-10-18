package com.appfix.studio.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Android
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.CloudDownload
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material.icons.outlined.FolderZip
import androidx.compose.material.icons.outlined.HourglassEmpty
import androidx.compose.material.icons.outlined.Science
import androidx.compose.material.icons.outlined.RemoveCircleOutline
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.appfix.studio.data.settings.AppSettings
import com.appfix.studio.ui.LocalImportActions
import com.appfix.studio.ui.appContainer
import com.appfix.studio.ui.components.IconBadge
import com.appfix.studio.ui.components.ProjectCard
import com.appfix.studio.ui.theme.LocalStatusColors

@Composable
fun HomeScreen(onOpenProject: (String) -> Unit, onSeeAllProjects: () -> Unit, onOpenLimitations: () -> Unit) {
    val container = appContainer()
    val actions = LocalImportActions.current
    val projects by container.projects.projects.collectAsStateWithLifecycle(initialValue = emptyList())
    val settings by container.settings.settings.collectAsStateWithLifecycle(initialValue = AppSettings())
    val current = projects.firstOrNull { it.id == settings.currentProjectId }

    LazyColumn(
        modifier = Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal)),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            Column(Modifier.padding(top = 8.dp)) {
                Text("AppFix Studio", style = MaterialTheme.typography.headlineSmall)
                Text("Inspect, repair and customise Android apps you own", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        item { HeroCard(onImportApk = actions.pickApk, onImportProject = actions.pickZip) }
        item {
            Text("Start a project", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(10.dp))
            val tiles = listOf(
                Tile("APK file", "Inspect an installed-app package", Icons.Outlined.Android, actions.pickApk),
                Tile("ZIP project", "Android Studio, Flutter, RN…", Icons.Outlined.FolderZip, actions.pickZip),
                Tile("GitHub", "Download a repository", Icons.Outlined.CloudDownload, actions.openGitHub),
                Tile("Folder", "Copy a project folder", Icons.Outlined.FolderOpen, actions.pickFolder),
                Tile("Sample app", "Try every feature safely", Icons.Outlined.Science, actions.importSample),
            )
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                tiles.chunked(2).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        row.forEach { ActionTile(it, Modifier.weight(1f)) }
                        if (row.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            }
        }
        if (current != null) {
            item {
                Text("Continue", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(10.dp))
                ProjectCard(current, onClick = { onOpenProject(current.id) })
            }
        }
        val recent = projects.filter { it.id != current?.id }.take(3)
        if (recent.isNotEmpty()) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Recent projects", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                    TextButton(onClick = onSeeAllProjects) { Text("See all") }
                }
            }
            items(recent, key = { it.id }) { p -> ProjectCard(p, onClick = { onOpenProject(p.id) }) }
        }
        item { CapabilityCard(onOpenLimitations) }
    }
}

private data class Tile(val title: String, val subtitle: String, val icon: ImageVector, val onClick: () -> Unit)

@Composable
private fun ActionTile(tile: Tile, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier.heightIn(min = 112.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest),
        border = CardDefaults.outlinedCardBorder(),
    ) {
        Column(Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = tile.onClick).padding(14.dp)) {
            IconBadge(tile.icon, MaterialTheme.colorScheme.primaryContainer, MaterialTheme.colorScheme.onPrimaryContainer, size = 36)
            Spacer(Modifier.height(10.dp))
            Text(tile.title, style = MaterialTheme.typography.titleSmall)
            Text(tile.subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun HeroCard(onImportApk: () -> Unit, onImportProject: () -> Unit) {
    val primary = MaterialTheme.colorScheme.primary
    val brush = Brush.linearGradient(listOf(primary, Color(0xFF5B3FD9)))
    Column(
        Modifier
            .fillMaxWidth()
            .background(brush, RoundedCornerShape(24.dp))
            .padding(20.dp),
    ) {
        Text("Fix it. Customise it. Rebuild it.", style = MaterialTheme.typography.titleLarge, color = Color.White)
        Spacer(Modifier.height(6.dp))
        Text(
            "Import an APK to see exactly what's inside, or import source code to find build problems and apply safe, reviewable fixes.",
            style = MaterialTheme.typography.bodyMedium,
            color = Color.White.copy(alpha = 0.9f),
        )
        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Button(onClick = onImportApk, colors = ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = primary)) { Text("Import APK") }
            OutlinedButton(onClick = onImportProject, colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White)) { Text("Import source") }
        }
    }
}

private enum class Cap { READY, LIMITED, PLANNED }

@Composable
private fun CapabilityCard(onOpenLimitations: () -> Unit) {
    val status = LocalStatusColors.current
    val rows = listOf(
        "APK inspection & signature verification" to Cap.READY,
        "Safe ZIP, GitHub and folder import" to Cap.READY,
        "Project analysis & reviewable auto-fixes" to Cap.READY,
        "Crash-log and build-log analysis" to Cap.READY,
        "Backups, undo and change history" to Cap.READY,
        "Code editor, project search and resource editor" to Cap.READY,
        "Visual layout editor & feature generators" to Cap.PLANNED,
        "Cloud builds and APK re-signing" to Cap.PLANNED,
        "On-device Gradle builds" to Cap.LIMITED,
    )
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow)) {
        Column(Modifier.padding(16.dp)) {
            Text("What works in this version", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(8.dp))
            rows.forEach { (label, cap) ->
                Row(Modifier.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    val (icon, tint, text) = when (cap) {
                        Cap.READY -> Triple(Icons.Outlined.CheckCircle, status.success, "Ready")
                        Cap.PLANNED -> Triple(Icons.Outlined.HourglassEmpty, status.warning, "Next phase")
                        Cap.LIMITED -> Triple(Icons.Outlined.RemoveCircleOutline, MaterialTheme.colorScheme.onSurfaceVariant, "Not on phones")
                    }
                    Icon(icon, contentDescription = text, tint = tint)
                    Spacer(Modifier.width(10.dp))
                    Text(label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                    Text(text, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            TextButton(onClick = onOpenLimitations) { Text("Read the limitations") }
        }
    }
}
