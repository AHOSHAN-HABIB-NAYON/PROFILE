package com.webtecit.nayon.feature.browser

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.webtecit.nayon.R
import com.webtecit.nayon.core.browser.UrlResolver
import com.webtecit.nayon.core.designsystem.theme.Spacing

/**
 * Top bar with the address/search field. Shows the site name when idle and the full
 * address (selected) while editing.
 */
@Composable
fun AddressBar(
    tab: TabState?,
    focusRequester: FocusRequester,
    voiceAvailable: Boolean,
    onFocusChange: (Boolean) -> Unit,
    onTextChange: (String) -> Unit,
    onSubmit: (String) -> Unit,
    onVoice: () -> Unit,
    onReload: () -> Unit,
    onStop: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    var focused by remember { mutableStateOf(false) }
    var field by remember { mutableStateOf(TextFieldValue("")) }
    val isPrivate = tab?.isPrivate == true
    val pageUrl = tab?.url?.takeIf { tab.isWebPage }

    // When editing starts, show the full address selected so typing replaces it.
    LaunchedEffect(focused) {
        if (focused) {
            val text = pageUrl.orEmpty()
            field = TextFieldValue(text, TextRange(0, text.length))
            onTextChange(text)
        }
    }

    Surface(color = if (isPrivate) scheme.surfaceContainerHigh else scheme.surface, modifier = modifier) {
        Box {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = Spacing.md, vertical = Spacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    Modifier
                        .weight(1f)
                        .height(48.dp)
                        .background(if (isPrivate) scheme.surfaceContainerHighest else scheme.surfaceContainerHigh, CircleShape)
                        .padding(start = Spacing.md, end = Spacing.xxs),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    LeadingIcon(tab, focused)
                    Spacer(Modifier.width(Spacing.sm))
                    Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                        BasicTextField(
                            value = if (focused) field else TextFieldValue(UrlResolver.displayHost(pageUrl)),
                            onValueChange = { if (focused) { field = it; onTextChange(it.text) } },
                            singleLine = true,
                            textStyle = MaterialTheme.typography.bodyLarge.copy(color = scheme.onSurface),
                            cursorBrush = SolidColor(scheme.primary),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Go, autoCorrectEnabled = false),
                            keyboardActions = KeyboardActions(onGo = { onSubmit(field.text) }),
                            modifier = Modifier
                                .fillMaxWidth()
                                .focusRequester(focusRequester)
                                .onFocusChanged { state ->
                                    if (state.isFocused != focused) { focused = state.isFocused; onFocusChange(state.isFocused) }
                                }
                                .semantics { contentDescription = "Address bar" },
                        )
                        val showHint = if (focused) field.text.isEmpty() else pageUrl == null
                        if (showHint) {
                            Text(
                                stringResource(if (isPrivate) R.string.address_hint_private else R.string.address_hint),
                                style = MaterialTheme.typography.bodyLarge,
                                color = scheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                    TrailingAction(
                        focused = focused,
                        hasText = field.text.isNotEmpty(),
                        tab = tab,
                        voiceAvailable = voiceAvailable,
                        onClear = { field = TextFieldValue(""); onTextChange("") },
                        onVoice = onVoice,
                        onReload = onReload,
                        onStop = onStop,
                    )
                }
            }
            AnimatedVisibility(
                visible = tab?.isLoading == true && tab.isWebPage,
                enter = fadeIn(), exit = fadeOut(),
                modifier = Modifier.align(Alignment.BottomCenter),
            ) {
                LinearProgressIndicator(
                    progress = { (tab?.progress ?: 0) / 100f },
                    modifier = Modifier.fillMaxWidth().height(2.dp),
                    color = scheme.primary,
                    trackColor = scheme.surface.copy(alpha = 0f),
                    drawStopIndicator = {},
                )
            }
        }
    }
}

@Composable
private fun LeadingIcon(tab: TabState?, focused: Boolean) {
    val scheme = MaterialTheme.colorScheme
    when {
        focused || tab?.isWebPage != true ->
            if (tab?.isPrivate == true) {
                Icon(Icons.Outlined.VisibilityOff, stringResource(R.string.private_tab), tint = scheme.tertiary, modifier = Modifier.size(20.dp))
            } else {
                Icon(Icons.Outlined.Search, null, tint = scheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
            }
        tab.isSecure -> Icon(Icons.Filled.Lock, stringResource(R.string.secure_connection), tint = scheme.primary, modifier = Modifier.size(18.dp))
        else -> Icon(Icons.Outlined.Info, stringResource(R.string.not_secure), tint = scheme.error, modifier = Modifier.size(20.dp))
    }
}

@Composable
private fun TrailingAction(
    focused: Boolean,
    hasText: Boolean,
    tab: TabState?,
    voiceAvailable: Boolean,
    onClear: () -> Unit,
    onVoice: () -> Unit,
    onReload: () -> Unit,
    onStop: () -> Unit,
) {
    when {
        focused && hasText -> IconButton(onClick = onClear) { Icon(Icons.Filled.Close, stringResource(R.string.action_clear)) }
        focused && voiceAvailable -> IconButton(onClick = onVoice) { Icon(Icons.Outlined.Mic, stringResource(R.string.action_voice_search)) }
        !focused && tab?.isWebPage == true && tab.isLoading ->
            IconButton(onClick = onStop) { Icon(Icons.Filled.Close, stringResource(R.string.action_stop)) }
        !focused && tab?.isWebPage == true ->
            IconButton(onClick = onReload) { Icon(Icons.Outlined.Refresh, stringResource(R.string.action_reload)) }
        !focused && voiceAvailable -> IconButton(onClick = onVoice) { Icon(Icons.Outlined.Mic, stringResource(R.string.action_voice_search)) }
        else -> Spacer(Modifier.width(Spacing.md))
    }
}
