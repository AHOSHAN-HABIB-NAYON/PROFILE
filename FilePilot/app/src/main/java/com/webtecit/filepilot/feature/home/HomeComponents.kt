package com.webtecit.filepilot.feature.home

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.PhoneAndroid
import androidx.compose.material.icons.rounded.SdCard
import androidx.compose.material.icons.rounded.Usb
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.webtecit.filepilot.core.common.Formatters
import com.webtecit.filepilot.core.designsystem.AppCard
import com.webtecit.filepilot.core.designsystem.IconTile
import com.webtecit.filepilot.core.designsystem.UsageBar
import com.webtecit.filepilot.core.storage.StorageVolumeInfo
import com.webtecit.filepilot.core.storage.VolumeType

@Composable
fun StorageCard(volume: StorageVolumeInfo, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val icon = when (volume.type) {
        VolumeType.INTERNAL -> Icons.Rounded.PhoneAndroid
        VolumeType.SD_CARD -> Icons.Rounded.SdCard
        VolumeType.USB -> Icons.Rounded.Usb
    }
    val tint = if (volume.type == VolumeType.INTERNAL) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.tertiary
    AppCard(onClick = onClick, modifier = modifier.fillMaxWidth().testTag("storage_card")) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconTile(icon, tint)
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(volume.label, style = MaterialTheme.typography.titleMedium)
                Text(
                    "${Formatters.size(volume.freeBytes)} free of ${Formatters.size(volume.totalBytes)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                Formatters.percent(volume.usedFraction),
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.height(14.dp))
        UsageBar(volume.usedFraction, color = tint)
        Spacer(Modifier.height(8.dp))
        Text(
            "${Formatters.size(volume.usedBytes)} used",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
