package com.webtecit.devicepilot.ui.install

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.webtecit.devicepilot.R
import com.webtecit.devicepilot.data.install.ApkDetails
import com.webtecit.devicepilot.data.install.InstallFailure
import com.webtecit.devicepilot.data.install.InstallState
import com.webtecit.devicepilot.data.install.InvalidReason
import com.webtecit.devicepilot.domain.Formatters
import com.webtecit.devicepilot.ui.common.DpCard
import com.webtecit.devicepilot.ui.common.InfoRow
import com.webtecit.devicepilot.ui.common.Level
import com.webtecit.devicepilot.ui.common.StatusPill
import com.webtecit.devicepilot.ui.common.levelColor

fun failureRes(f: InstallFailure) = when (f) {
    InstallFailure.ABORTED -> R.string.install_fail_aborted
    InstallFailure.BLOCKED -> R.string.install_fail_blocked
    InstallFailure.CONFLICT -> R.string.install_fail_conflict
    InstallFailure.INCOMPATIBLE -> R.string.install_fail_incompatible
    InstallFailure.INVALID -> R.string.install_fail_invalid
    InstallFailure.STORAGE -> R.string.install_fail_storage
    InstallFailure.TIMEOUT -> R.string.install_fail_timeout
    InstallFailure.OTHER -> R.string.install_fail_other
}

fun invalidRes(r: InvalidReason) = when (r) {
    InvalidReason.UNREADABLE -> R.string.apk_invalid_unreadable
    InvalidReason.NOT_AN_APK -> R.string.apk_invalid_not_apk
    InvalidReason.SPLIT_OR_BUNDLE -> R.string.apk_invalid_split
}

@Composable
fun InstallStatusCard(state: InstallState, onDismiss: () -> Unit) {
    if (state is InstallState.Idle) return
    DpCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            when (state) {
                is InstallState.Copying, is InstallState.WaitingForUser ->
                    CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.5.dp)
                else -> Unit
            }
            if (state is InstallState.Copying || state is InstallState.WaitingForUser) Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                val (text, level) = when (state) {
                    is InstallState.Copying -> stringResource(R.string.install_state_copying) to Level.INFO
                    is InstallState.WaitingForUser -> stringResource(R.string.install_state_waiting) to Level.INFO
                    is InstallState.Installed -> stringResource(R.string.install_state_installed, state.packageName) to Level.GOOD
                    is InstallState.Failed -> stringResource(failureRes(state.reason)) to
                        (if (state.reason == InstallFailure.ABORTED) Level.NEUTRAL else Level.BAD)
                    InstallState.Idle -> "" to Level.NEUTRAL
                }
                Text(text, style = MaterialTheme.typography.bodyMedium, color = levelColor(level))
                if (state is InstallState.Failed && !state.message.isNullOrBlank() && state.reason != InstallFailure.ABORTED) {
                    Text(state.message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            if (state is InstallState.Installed || state is InstallState.Failed) {
                TextButton(onClick = onDismiss) { Text(stringResource(R.string.action_dismiss)) }
            }
        }
    }
}

@Composable
fun ApkDetailsCard(d: ApkDetails, showSigner: Boolean = true) {
    DpCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            d.icon?.let {
                Image(it.asImageBitmap(), null, Modifier.size(52.dp).clip(RoundedCornerShape(12.dp)))
                Spacer(Modifier.width(12.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(d.label, style = MaterialTheme.typography.titleMedium)
                Text(d.packageName, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Spacer(Modifier.height(8.dp))
        Row {
            when {
                d.incompatibleSdk -> StatusPill(stringResource(R.string.apk_incompatible, d.minSdk ?: 0), Level.BAD)
                d.signatureMismatch -> StatusPill(stringResource(R.string.apk_signature_mismatch), Level.BAD)
                d.isDowngrade -> StatusPill(stringResource(R.string.apk_downgrade), Level.WARN)
                d.isUpdate -> StatusPill(stringResource(R.string.apk_update), Level.INFO)
                else -> StatusPill(stringResource(R.string.apk_new_install), Level.GOOD)
            }
        }
        Spacer(Modifier.height(4.dp))
        InfoRow(stringResource(R.string.apk_file), d.fileName)
        d.sizeBytes?.let { InfoRow(stringResource(R.string.apk_size), Formatters.bytes(it)) }
        d.location?.let { InfoRow(stringResource(R.string.apk_location), it) }
        InfoRow(stringResource(R.string.details_version), "${d.versionName ?: "—"} (${d.versionCode})")
        d.installedVersionCode?.let { InfoRow(stringResource(R.string.apk_installed_version), it.toString()) }
        d.minSdk?.let { InfoRow(stringResource(R.string.details_min_sdk), it.toString()) }
        d.targetSdk?.let { InfoRow(stringResource(R.string.details_target_sdk), it.toString()) }
        if (showSigner) {
            InfoRow(stringResource(R.string.apk_signer), d.signerSha256?.let { it.take(23) + "…" } ?: stringResource(R.string.unavailable))
        }
        if (d.signatureMismatch) Text(stringResource(R.string.apk_signature_mismatch_text), style = MaterialTheme.typography.bodySmall,
            color = levelColor(Level.BAD), modifier = Modifier.fillMaxWidth())
    }
}
