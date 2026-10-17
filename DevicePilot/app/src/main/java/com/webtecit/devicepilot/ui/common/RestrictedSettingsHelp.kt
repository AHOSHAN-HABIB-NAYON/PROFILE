package com.webtecit.devicepilot.ui.common

import android.os.Build
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.LockOpen
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.webtecit.devicepilot.R
import com.webtecit.devicepilot.system.SystemSettings

/**
 * Android 13+ greys out Usage Access (and similar) for apps installed from outside an app store
 * ("Restricted setting"). The user must allow it from DevicePilot's App info ⋮ menu first.
 */
@Composable
fun RestrictedSettingsHelp(modifier: Modifier = Modifier, startExpanded: Boolean = false) {
    if (Build.VERSION.SDK_INT < 33) return
    val context = LocalContext.current
    var open by rememberSaveable { mutableStateOf(startExpanded) }
    DpCard(modifier, onClick = { open = !open }, color = levelColor(Level.WARN).copy(alpha = 0.08f)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.LockOpen, null, tint = levelColor(Level.WARN))
            Spacer(Modifier.width(10.dp))
            Text(stringResource(R.string.restricted_title), style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
            Icon(if (open) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore, null)
        }
        AnimatedVisibility(open) {
            Column {
                Spacer(Modifier.height(6.dp))
                Text(stringResource(R.string.restricted_text), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(6.dp))
                listOf(R.string.restricted_1, R.string.restricted_2, R.string.restricted_3, R.string.restricted_4)
                    .forEachIndexed { i, s ->
                        Text("${i + 1}. ${stringResource(s)}", style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.fillMaxWidth())
                    }
                Spacer(Modifier.height(10.dp))
                Button(onClick = { SystemSettings.appDetails(context, context.packageName) }, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.restricted_open))
                }
            }
        }
    }
}
