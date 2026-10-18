package com.webtecit.nayon.feature.browser

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.webtecit.nayon.R
import com.webtecit.nayon.core.designsystem.theme.Spacing

/** Chrome-style "Find in page" bar: query, match counter, previous/next and close. */
@Composable
fun FindBar(
    state: FindState,
    onQuery: (String) -> Unit,
    onNext: () -> Unit,
    onPrevious: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    Row(
        modifier.background(scheme.surface).height(56.dp).padding(horizontal = Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            Modifier.weight(1f).height(44.dp).clip(CircleShape).background(scheme.surfaceContainerHigh)
                .padding(horizontal = Spacing.lg),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                BasicTextField(
                    value = state.query,
                    onValueChange = onQuery,
                    singleLine = true,
                    textStyle = MaterialTheme.typography.bodyLarge.copy(color = scheme.onSurface),
                    cursorBrush = SolidColor(scheme.primary),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = { onNext() }),
                    modifier = Modifier.fillMaxWidth().focusRequester(focus),
                )
                if (state.query.isEmpty()) {
                    Text(stringResource(R.string.find_hint), style = MaterialTheme.typography.bodyLarge, color = scheme.onSurfaceVariant)
                }
            }
            if (state.query.isNotEmpty()) {
                Spacer(Modifier.width(Spacing.sm))
                Text("${state.current}/${state.total}", style = MaterialTheme.typography.labelLarge,
                    color = if (state.total == 0) scheme.error else scheme.onSurfaceVariant)
            }
        }
        IconButton(onClick = onPrevious, enabled = state.total > 0) { Icon(Icons.Filled.KeyboardArrowUp, stringResource(R.string.find_previous)) }
        IconButton(onClick = onNext, enabled = state.total > 0) { Icon(Icons.Filled.KeyboardArrowDown, stringResource(R.string.find_next)) }
        IconButton(onClick = onClose) { Icon(Icons.Filled.Close, stringResource(R.string.action_close)) }
    }
}
