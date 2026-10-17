package com.webtecit.devicepilot.ui.install

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.outlined.FileOpen
import androidx.compose.material.icons.outlined.InstallMobile
import androidx.compose.material.icons.outlined.Shop
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.webtecit.devicepilot.AppContainer
import com.webtecit.devicepilot.R
import com.webtecit.devicepilot.data.install.ApkInspection
import com.webtecit.devicepilot.data.install.InstallEvents
import com.webtecit.devicepilot.system.SystemSettings
import com.webtecit.devicepilot.ui.Routes
import com.webtecit.devicepilot.ui.common.DpCard
import com.webtecit.devicepilot.ui.common.HeroCard
import com.webtecit.devicepilot.ui.common.Level
import com.webtecit.devicepilot.ui.common.LocalContainer
import com.webtecit.devicepilot.ui.common.PermissionCard
import com.webtecit.devicepilot.ui.common.ScreenList
import com.webtecit.devicepilot.ui.common.SectionTitle
import com.webtecit.devicepilot.ui.common.ShortcutButton
import com.webtecit.devicepilot.ui.common.levelColor
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class InstallViewModel(private val c: AppContainer) : ViewModel() {
    private val _inspection = MutableStateFlow<ApkInspection?>(null)
    val inspection = _inspection.asStateFlow()
    private val _busy = MutableStateFlow(false)
    val busy = _busy.asStateFlow()

    fun select(uri: Uri) = viewModelScope.launch {
        _busy.value = true
        InstallEvents.reset()
        _inspection.value = c.apkInspector.inspect(uri)
        _busy.value = false
    }

    fun install() {
        val d = (_inspection.value as? ApkInspection.Valid)?.details ?: return
        viewModelScope.launch { c.installer.install(d.uri, d.packageName, d.sizeBytes) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun InstallScreen(navigate: (String) -> Unit) {
    val c = LocalContainer.current
    val context = LocalContext.current
    val vm: InstallViewModel = viewModel { InstallViewModel(c) }
    val inspection by vm.inspection.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val installState by InstallEvents.state.collectAsStateWithLifecycle()
    var canInstall by remember { mutableStateOf(c.installer.canRequestInstalls()) }
    var showPerms by remember { mutableStateOf(false) }
    var link by remember { mutableStateOf("") }

    LifecycleResumeEffect(Unit) {
        canInstall = c.installer.canRequestInstalls()
        onPauseOrDispose { }
    }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) vm.select(uri)
    }

    ScreenList {
        item { HeroCard(R.drawable.ill_apps, stringResource(R.string.install_hero_title), stringResource(R.string.install_hero_text)) }
        item {
            DpCard(color = levelColor(Level.WARN).copy(alpha = 0.08f)) {
                Row(verticalAlignment = Alignment.Top) {
                    Icon(Icons.Outlined.WarningAmber, null, tint = levelColor(Level.WARN))
                    Spacer(Modifier.width(10.dp))
                    Text(stringResource(R.string.install_warning), style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        item {
            Button(onClick = { picker.launch(arrayOf("application/vnd.android.package-archive", "application/octet-stream")) },
                modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Outlined.FileOpen, null)
                Spacer(Modifier.width(8.dp))
                Text(stringResource(R.string.install_select_apk))
            }
        }
        if (busy) item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                Spacer(Modifier.width(10.dp))
                Text(stringResource(R.string.install_inspecting))
            }
        }
        item { InstallStatusCard(installState) { InstallEvents.reset() } }
        when (val i = inspection) {
            is ApkInspection.Invalid -> item {
                DpCard {
                    Text(i.fileName, style = MaterialTheme.typography.titleSmall)
                    Text(stringResource(invalidRes(i.reason)), style = MaterialTheme.typography.bodySmall, color = levelColor(Level.BAD))
                }
            }
            is ApkInspection.Valid -> {
                val d = i.details
                item { ApkDetailsCard(d) }
                item {
                    DpCard(onClick = { showPerms = !showPerms }) {
                        Text(stringResource(R.string.details_permissions, d.permissions.size), style = MaterialTheme.typography.titleSmall)
                        AnimatedVisibility(showPerms) {
                            Column {
                                d.permissions.forEach {
                                    Text(it.removePrefix("android.permission."), style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }
                if (!canInstall) item {
                    PermissionCard(stringResource(R.string.perm_install_title), stringResource(R.string.perm_install_text),
                        stringResource(R.string.perm_grant_in_settings), onClick = { SystemSettings.unknownSources(context) })
                } else item {
                    Button(
                        onClick = { vm.install() },
                        enabled = !d.incompatibleSdk && !d.signatureMismatch,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(Icons.Outlined.InstallMobile, null)
                        Spacer(Modifier.width(8.dp))
                        Text(stringResource(if (d.isUpdate) R.string.install_update else R.string.install_install))
                    }
                    Text(stringResource(R.string.install_system_confirm_note), style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            null -> Unit
        }
        item { SectionTitle(stringResource(R.string.install_other_sources)) }
        item {
            DpCard {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    ShortcutButton(stringResource(R.string.install_open_play), Icons.Outlined.Shop) { SystemSettings.playStore(context) }
                    ShortcutButton(stringResource(R.string.apps_apk_files), Icons.Outlined.FileOpen) { navigate(Routes.APKS) }
                }
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(link, { link = it }, Modifier.fillMaxWidth(), singleLine = true,
                    label = { Text(stringResource(R.string.install_store_link)) },
                    supportingText = { Text(stringResource(R.string.install_store_link_hint)) },
                    shape = MaterialTheme.shapes.small)
                val valid = link.trim().let { it.startsWith("market://") || it.startsWith("https://") }
                FilledTonalButton(enabled = valid, onClick = { SystemSettings.url(context, link.trim()) }) {
                    Icon(Icons.AutoMirrored.Outlined.OpenInNew, null, Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(stringResource(R.string.install_open_link))
                }
            }
        }
        item {
            DpCard {
                Text(stringResource(R.string.install_troubleshoot_title), style = MaterialTheme.typography.titleSmall)
                Spacer(Modifier.height(4.dp))
                Text(stringResource(R.string.install_troubleshoot_text), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
