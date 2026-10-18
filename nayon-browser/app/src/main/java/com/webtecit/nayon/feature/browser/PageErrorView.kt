package com.webtecit.nayon.feature.browser

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.GppBad
import androidx.compose.material.icons.outlined.HourglassEmpty
import androidx.compose.material.icons.outlined.SearchOff
import androidx.compose.material.icons.outlined.WifiOff
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.webtecit.nayon.R
import com.webtecit.nayon.core.designsystem.component.MessageState
import com.webtecit.nayon.core.designsystem.theme.Layout

@Composable
fun PageErrorView(error: PageError, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    val (icon, title, body) = when (error.kind) {
        PageError.Kind.OFFLINE -> Triple(Icons.Outlined.WifiOff, R.string.error_offline_title, R.string.error_offline_body)
        PageError.Kind.NOT_FOUND -> Triple(Icons.Outlined.SearchOff, R.string.error_not_found_title, R.string.error_not_found_body)
        PageError.Kind.TIMEOUT -> Triple(Icons.Outlined.HourglassEmpty, R.string.error_timeout_title, R.string.error_timeout_body)
        PageError.Kind.NOT_SECURE -> Triple(Icons.Outlined.GppBad, R.string.error_not_secure_title, R.string.error_not_secure_body)
        PageError.Kind.CRASHED -> Triple(Icons.Outlined.ErrorOutline, R.string.error_crashed_title, R.string.error_crashed_body)
        PageError.Kind.GENERIC -> Triple(Icons.Outlined.CloudOff, R.string.error_generic_title, R.string.error_generic_body)
    }
    Box(modifier.fillMaxSize().background(MaterialTheme.colorScheme.surface), contentAlignment = Alignment.Center) {
        MessageState(
            icon = icon,
            title = stringResource(title),
            body = stringResource(body),
            actionLabel = stringResource(R.string.action_retry),
            onAction = onRetry,
            isError = error.kind == PageError.Kind.NOT_SECURE,
            modifier = Modifier.widthIn(max = Layout.maxContentWidth),
        )
    }
}
