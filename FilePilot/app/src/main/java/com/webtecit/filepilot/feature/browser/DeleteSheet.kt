@file:OptIn(ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.browser

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.DeleteForever
import androidx.compose.material.icons.rounded.RestoreFromTrash
import androidx.compose.material.icons.rounded.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.webtecit.filepilot.core.common.Formatters
import com.webtecit.filepilot.core.designsystem.FileThumb
import com.webtecit.filepilot.core.storage.FileItem

private val DangerRed = Color(0xFFE0455A)

/**
 * Delete confirmation as a bottom panel: shows what will be removed and how much space it frees.
 * When the Recycle Bin can take the items, a switch chooses between the bin and a permanent delete.
 */
@Composable
fun DeleteSheet(
    items: List<FileItem>,
    canUseRecycleBin: Boolean,
    onDelete: (permanently: Boolean) -> Unit,
    onDismiss: () -> Unit,
) {
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var permanent by remember { mutableStateOf(!canUseRecycleBin) }
    val fileBytes = items.filter { !it.isDirectory }.sumOf { it.size }
    val folders = items.count { it.isDirectory }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheet) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 18.dp).navigationBarsPadding().padding(bottom = 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(50.dp).clip(RoundedCornerShape(15.dp)).background(DangerRed.copy(alpha = 0.12f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(if (permanent) Icons.Rounded.DeleteForever else Icons.Rounded.Delete, null, tint = DangerRed, modifier = Modifier.size(28.dp))
                }
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        if (items.size == 1) "Delete \"${items[0].name}\"?" else "Delete ${items.size} items?",
                        style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold,
                        maxLines = 2, overflow = TextOverflow.Ellipsis,
                    )
                    val freed = when {
                        fileBytes > 0 && folders > 0 -> "${Formatters.size(fileBytes)} + ${Formatters.count(folders, "folder")}"
                        fileBytes > 0 -> "${Formatters.size(fileBytes)} will be freed"
                        else -> "${Formatters.count(folders, "folder")} and everything inside"
                    }
                    Text(freed, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Spacer(Modifier.height(14.dp))
            Surface(
                shape = RoundedCornerShape(18.dp),
                color = MaterialTheme.colorScheme.surfaceContainerLowest,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
            ) {
                Column {
                    items.take(4).forEachIndexed { i, item ->
                        if (i > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))
                        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            FileThumb(item, size = 36.dp)
                            Spacer(Modifier.width(12.dp))
                            Text(item.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                            Spacer(Modifier.width(8.dp))
                            Text(
                                if (item.isDirectory) "Folder" else Formatters.size(item.size),
                                style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    if (items.size > 4) {
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))
                        Text(
                            "+ ${items.size - 4} more", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                        )
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
            if (canUseRecycleBin) {
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = if (permanent) DangerRed.copy(alpha = 0.07f) else MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f),
                    border = BorderStroke(1.dp, if (permanent) DangerRed.copy(alpha = 0.3f) else MaterialTheme.colorScheme.primary.copy(alpha = 0.2f)),
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp))
                        .clickable(role = Role.Switch) { permanent = !permanent }.testTag("delete_permanently"),
                ) {
                    Row(Modifier.padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            if (permanent) Icons.Rounded.Warning else Icons.Rounded.RestoreFromTrash, null,
                            tint = if (permanent) DangerRed else MaterialTheme.colorScheme.primary,
                        )
                        Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) {
                            Text("Delete permanently", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = if (permanent) DangerRed else MaterialTheme.colorScheme.onSurface)
                            Text(
                                if (permanent) "Can't be restored" else "Off: goes to the Recycle Bin for 30 days",
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Switch(checked = permanent, onCheckedChange = null)
                    }
                }
            } else {
                Surface(shape = RoundedCornerShape(16.dp), color = DangerRed.copy(alpha = 0.07f), border = BorderStroke(1.dp, DangerRed.copy(alpha = 0.3f))) {
                    Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Rounded.Warning, null, tint = DangerRed)
                        Spacer(Modifier.width(10.dp))
                        Text(
                            buildString {
                                append("These items will be deleted permanently and can't be restored.")
                                if (folders > 0) append(" Everything inside the folders is deleted too.")
                            },
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(
                    onClick = onDismiss,
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh, contentColor = MaterialTheme.colorScheme.onSurface),
                    modifier = Modifier.weight(1f).height(52.dp),
                ) { Text("Cancel", fontWeight = FontWeight.SemiBold) }
                Button(
                    onClick = { onDelete(permanent) },
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = DangerRed, contentColor = Color.White),
                    modifier = Modifier.weight(1f).height(52.dp).testTag("confirm_delete"),
                ) {
                    Icon(Icons.Rounded.Delete, null, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(if (permanent) "Delete" else "Move to bin", fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}
