package com.appfix.studio.ui.components

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Android
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.appfix.core.util.formatBytes
import com.appfix.studio.data.db.ProjectEntity
import com.appfix.studio.data.db.ProjectKind
import com.appfix.studio.ui.appContainer
import com.appfix.studio.ui.theme.LocalStatusColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Composable
fun ProjectIcon(project: ProjectEntity, size: Int = 44) {
    val container = appContainer()
    val bitmap by produceState<ImageBitmap?>(null, project.id, project.updatedAt) {
        value = if (project.kind == ProjectKind.APK) withContext(Dispatchers.IO) {
            runCatching {
                val f = container.storage.iconFile(project.id)
                if (f.isFile) BitmapFactory.decodeFile(f.path)?.asImageBitmap() else null
            }.getOrNull()
        } else null
    }
    val b = bitmap
    if (b != null) {
        Image(b, contentDescription = null, modifier = Modifier.size(size.dp).clip(RoundedCornerShape(12.dp)))
    } else if (project.kind == ProjectKind.APK) {
        IconBadge(Icons.Outlined.Android, MaterialTheme.colorScheme.secondaryContainer, MaterialTheme.colorScheme.onSecondaryContainer, size)
    } else {
        IconBadge(Icons.Outlined.Code, MaterialTheme.colorScheme.primaryContainer, MaterialTheme.colorScheme.onPrimaryContainer, size)
    }
}

@Composable
fun ProjectCard(project: ProjectEntity, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val status = LocalStatusColors.current
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest),
        border = CardDefaults.outlinedCardBorder(),
    ) {
        Row(Modifier.clickable(onClickLabel = "Open ${project.name}", onClick = onClick).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            ProjectIcon(project)
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(project.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    listOfNotNull(project.packageName, project.versionName?.let { "v$it" }).joinToString(" · ").ifEmpty { project.origin },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    StatusPill(if (project.kind == ProjectKind.APK) "APK" else "Source", MaterialTheme.colorScheme.surfaceContainerHigh, MaterialTheme.colorScheme.onSurfaceVariant)
                    StatusPill(project.framework.substringBefore(" ("), MaterialTheme.colorScheme.surfaceContainer, MaterialTheme.colorScheme.onSurfaceVariant)
                    val errors = project.lastErrorCount
                    when {
                        errors == null -> Unit
                        errors > 0 -> StatusPill("$errors error${if (errors == 1) "" else "s"}", MaterialTheme.colorScheme.errorContainer, MaterialTheme.colorScheme.onErrorContainer)
                        else -> StatusPill("No errors", status.successContainer, status.success)
                    }
                }
            }
            Spacer(Modifier.width(8.dp))
            Column(horizontalAlignment = Alignment.End) {
                Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(formatBytes(project.sizeBytes), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
