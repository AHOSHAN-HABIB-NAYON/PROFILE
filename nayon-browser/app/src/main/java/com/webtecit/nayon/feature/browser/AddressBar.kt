package com.webtecit.nayon.feature.browser

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.webtecit.nayon.R
import com.webtecit.nayon.core.browser.UrlResolver
import com.webtecit.nayon.core.designsystem.theme.Spacing

/**
 * Compact top toolbar. In [compact] (top-only) layout it also holds Home, New tab, Tabs and
 * Menu, like Chrome. While editing, the address field takes the whole width.
 */
@Composable
fun TopToolbar(
    tab: TabState?,
    tabCount: Int,
    compact: Boolean,
    focusRequester: FocusRequester,
    voiceAvailable: Boolean,
    fillRequest: String?,
    onFillConsumed: () -> Unit,
    onFocusChange: (Boolean) -> Unit,
    onTextChange: (String) -> Unit,
    onSubmit: (String) -> Unit,
    onVoice: () -> Unit,
    onLens: () -> Unit,
    onReload: () -> Unit,
    onStop: () -> Unit,
    onHome: () -> Unit,
    onNewTab: () -> Unit,
    onTabs: () -> Unit,
    onMenu: () -> Unit,
    onSiteInfo: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    var focused by remember { mutableStateOf(false) }
    var field by remember { mutableStateOf(TextFieldValue("")) }
    val isPrivate = tab?.isPrivate == true
    val pageUrl = tab?.url?.takeIf { tab.isWebPage }

    LaunchedEffect(focused) {
        if (focused) {
            val text = pageUrl.orEmpty()
            field = TextFieldValue(text, TextRange(0, text.length))
            onTextChange(text)
        }
    }

    // Text chosen in the search panel (a recent search, or "edit" on the current page).
    LaunchedEffect(fillRequest) {
        val text = fillRequest ?: return@LaunchedEffect
        field = TextFieldValue(text, TextRange(text.length))
        onTextChange(text)
        onFillConsumed()
        focusRequester.requestFocus()
    }

    Box(modifier.background(if (isPrivate) scheme.surfaceContainerHigh else scheme.surface)) {
        Row(
            Modifier.fillMaxWidth().height(56.dp).padding(horizontal = Spacing.xs).animateContentSize(tween(180)),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SideButtons(visible = compact && !focused) {
                IconButton(onClick = onHome) { Icon(Icons.Outlined.Home, stringResource(R.string.action_home)) }
            }
            if (!(compact && !focused)) Spacer(Modifier.width(Spacing.sm))

            // The address pill
            Row(
                Modifier
                    .weight(1f)
                    .height(44.dp)
                    .clip(CircleShape)
                    .background(if (isPrivate) scheme.surfaceContainerHighest else scheme.surfaceContainerHigh)
                    .then(if (focused) Modifier.border(1.5.dp, scheme.primary, CircleShape) else Modifier),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                SiteButton(tab, focused, onSiteInfo)
                Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                    BasicTextField(
                        value = if (focused) field else TextFieldValue(UrlResolver.displayHost(pageUrl)),
                        onValueChange = { if (focused) { field = it; onTextChange(it.text) } },
                        singleLine = true,
                        textStyle = MaterialTheme.typography.bodyLarge.copy(color = scheme.onSurface, fontSize = 16.sp),
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
                PillTrailing(
                    focused = focused,
                    hasText = field.text.isNotEmpty(),
                    tab = tab,
                    showReload = !compact,
                    voiceAvailable = voiceAvailable,
                    onClear = { field = TextFieldValue(""); onTextChange("") },
                    onVoice = onVoice,
                    onLens = onLens,
                    onReload = onReload,
                    onStop = onStop,
                )
            }

            SideButtons(visible = compact && !focused) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onNewTab) { Icon(Icons.Outlined.Add, stringResource(R.string.action_new_tab)) }
                    TabsCountButton(tabCount, onTabs)
                    IconButton(onClick = onMenu) { Icon(Icons.Filled.MoreVert, stringResource(R.string.action_menu)) }
                }
            }
            if (!(compact && !focused)) Spacer(Modifier.width(Spacing.sm))
        }

        if (tab?.isLoading == true && tab.isWebPage) {
            LinearProgressIndicator(
                progress = { tab.progress / 100f },
                modifier = Modifier.fillMaxWidth().height(2.dp).align(Alignment.BottomCenter),
                color = scheme.primary,
                trackColor = scheme.surface.copy(alpha = 0f),
                drawStopIndicator = {},
            )
        }
    }
}

@Composable
private fun SideButtons(visible: Boolean, content: @Composable () -> Unit) {
    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(tween(160)) + expandHorizontally(tween(180)),
        exit = fadeOut(tween(120)) + shrinkHorizontally(tween(180)),
    ) { content() }
}

/** Leading icon in the pill. On a web page it opens the site-information sheet, like Chrome. */
@Composable
private fun SiteButton(tab: TabState?, focused: Boolean, onSiteInfo: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    val onPage = tab?.isWebPage == true && !focused
    Box(
        Modifier
            .padding(start = 4.dp)
            .size(36.dp)
            .clip(CircleShape)
            .then(if (onPage) Modifier.clickable(role = Role.Button, onClick = onSiteInfo) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        when {
            !onPage && tab?.isPrivate == true ->
                Icon(Icons.Outlined.VisibilityOff, stringResource(R.string.private_tab), tint = scheme.tertiary, modifier = Modifier.size(20.dp))
            !onPage -> Icon(Icons.Outlined.Search, null, tint = scheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
            tab?.isSecure == true ->
                Icon(Icons.Outlined.Tune, stringResource(R.string.action_site_info), tint = scheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
            else ->
                Icon(Icons.Outlined.ErrorOutline, stringResource(R.string.not_secure), tint = scheme.error, modifier = Modifier.size(20.dp))
        }
    }
}

@Composable
private fun PillTrailing(
    focused: Boolean,
    hasText: Boolean,
    tab: TabState?,
    showReload: Boolean,
    voiceAvailable: Boolean,
    onClear: () -> Unit,
    onVoice: () -> Unit,
    onLens: () -> Unit,
    onReload: () -> Unit,
    onStop: () -> Unit,
) {
    val onPage = tab?.isWebPage == true
    when {
        focused && hasText -> IconButton(onClick = onClear) { Icon(Icons.Filled.Close, stringResource(R.string.action_clear)) }
        focused -> Row(verticalAlignment = Alignment.CenterVertically) {
            if (voiceAvailable) {
                IconButton(onClick = onVoice) { Icon(Icons.Outlined.Mic, stringResource(R.string.action_voice_search), modifier = Modifier.size(22.dp)) }
            }
            IconButton(onClick = onLens) {
                Icon(painterResource(R.drawable.ic_google_lens), stringResource(R.string.action_lens), tint = Color.Unspecified, modifier = Modifier.size(22.dp))
            }
        }
        !focused && onPage && tab?.isLoading == true ->
            IconButton(onClick = onStop) { Icon(Icons.Filled.Close, stringResource(R.string.action_stop), modifier = Modifier.size(20.dp)) }
        !focused && onPage && showReload ->
            IconButton(onClick = onReload) { Icon(Icons.Outlined.Refresh, stringResource(R.string.action_reload), modifier = Modifier.size(22.dp)) }
        !focused && !onPage && voiceAvailable ->
            IconButton(onClick = onVoice) { Icon(Icons.Outlined.Mic, stringResource(R.string.action_voice_search), modifier = Modifier.size(22.dp)) }
        else -> Spacer(Modifier.width(Spacing.md))
    }
}

/** Rounded-square tab counter, as in Chrome. */
@Composable
fun TabsCountButton(count: Int, onClick: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    val label = stringResource(R.string.action_tabs, count)
    IconButton(onClick = onClick, modifier = Modifier.semantics { contentDescription = label }) {
        Box(
            Modifier.size(22.dp).border(2.dp, scheme.onSurface, RoundedCornerShape(6.dp)).clearAndSetSemantics { },
            contentAlignment = Alignment.Center,
        ) {
            Text(
                if (count > 99) "∞" else count.toString(),
                fontSize = if (count > 9) 10.sp else 12.sp,
                fontWeight = FontWeight.Bold,
                color = scheme.onSurface,
            )
        }
    }
}
