package com.webtecit.nayon.feature.history

import android.text.format.DateFormat
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.outlined.DeleteSweep
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.SearchOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.webtecit.nayon.NayonViewModelFactory
import com.webtecit.nayon.R
import com.webtecit.nayon.core.browser.UrlResolver
import com.webtecit.nayon.core.designsystem.component.ConfirmDialog
import com.webtecit.nayon.core.designsystem.component.GroupDivider
import com.webtecit.nayon.core.designsystem.component.MessageState
import com.webtecit.nayon.core.designsystem.component.ScreenScaffold
import com.webtecit.nayon.core.designsystem.component.SearchField
import com.webtecit.nayon.core.designsystem.component.SectionHeader
import com.webtecit.nayon.core.designsystem.component.SettingsGroup
import com.webtecit.nayon.core.designsystem.component.SiteIcon
import com.webtecit.nayon.core.designsystem.theme.Spacing
import com.webtecit.nayon.data.browser.BrowsingRepository
import com.webtecit.nayon.data.browser.HistoryEntry
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.Calendar
import java.util.Date

@OptIn(ExperimentalCoroutinesApi::class)
class HistoryViewModel(private val repo: BrowsingRepository) : ViewModel() {
    val query = MutableStateFlow("")
    val entries: StateFlow<List<HistoryEntry>?> = query
        .flatMapLatest { q -> if (q.isBlank()) repo.recentHistory() else repo.searchHistory(q.trim()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    fun delete(id: Long) = viewModelScope.launch { repo.deleteHistory(id) }
    fun clearAll() = viewModelScope.launch { repo.clearHistory() }
}

/** Day bucket for grouping: 0 = today, 1 = yesterday, otherwise the day's start time. */
fun dayKey(time: Long, now: Long = System.currentTimeMillis()): Long {
    fun startOfDay(t: Long) = Calendar.getInstance().apply {
        timeInMillis = t; set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
    }.timeInMillis
    val today = startOfDay(now)
    val day = startOfDay(time)
    return when {
        day >= today -> 0L
        day >= startOfDay(today - 1) -> 1L
        else -> day
    }
}

@Composable
fun HistoryScreen(
    onBack: () -> Unit,
    onOpen: (String) -> Unit,
    viewModel: HistoryViewModel = viewModel(factory = NayonViewModelFactory.Factory),
) {
    val context = LocalContext.current
    val query by viewModel.query.collectAsStateWithLifecycle()
    val entries by viewModel.entries.collectAsStateWithLifecycle()
    var confirmClear by remember { mutableStateOf(false) }
    val timeFormat = remember { DateFormat.getTimeFormat(context) }
    val dateFormat = remember { DateFormat.getMediumDateFormat(context) }

    ScreenScaffold(
        title = stringResource(R.string.history_title),
        onBack = onBack,
        actions = {
            if (!entries.isNullOrEmpty() && query.isBlank()) {
                IconButton(onClick = { confirmClear = true }) {
                    Icon(Icons.Outlined.DeleteSweep, stringResource(R.string.history_clear))
                }
            }
        },
    ) {
        item { SearchField(query, { viewModel.query.value = it }, stringResource(R.string.history_search)) }
        val list = entries
        when {
            list == null -> Unit
            list.isEmpty() && query.isBlank() -> item {
                MessageState(Icons.Outlined.History, stringResource(R.string.history_empty_title), stringResource(R.string.history_empty_body))
            }
            list.isEmpty() -> item { MessageState(Icons.Outlined.SearchOff, stringResource(R.string.history_no_results), "") }
            else -> list.groupBy { dayKey(it.visitedAt) }.forEach { (key, group) ->
                item(key = "h$key") {
                    SectionHeader(
                        when (key) {
                            0L -> stringResource(R.string.history_today)
                            1L -> stringResource(R.string.history_yesterday)
                            else -> dateFormat.format(Date(key))
                        },
                    )
                }
                item(key = "g$key") {
                    SettingsGroup {
                        group.forEachIndexed { i, e ->
                            if (i > 0) GroupDivider()
                            HistoryRow(e, timeFormat.format(Date(e.visitedAt)), onOpen = { onOpen(e.url) }, onDelete = { viewModel.delete(e.id) })
                        }
                    }
                }
            }
        }
    }

    if (confirmClear) {
        ConfirmDialog(
            title = stringResource(R.string.history_clear_title),
            body = stringResource(R.string.history_clear_body),
            confirmLabel = stringResource(R.string.history_clear),
            dismissLabel = stringResource(R.string.action_cancel),
            destructive = true,
            onConfirm = { confirmClear = false; viewModel.clearAll() },
            onDismiss = { confirmClear = false },
        )
    }
}

@Composable
private fun HistoryRow(entry: HistoryEntry, time: String, onOpen: () -> Unit, onDelete: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onOpen).padding(start = Spacing.lg, top = Spacing.sm, bottom = Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SiteIcon(entry.url, entry.title, size = 40.dp)
        Spacer(Modifier.width(Spacing.md))
        Column(Modifier.weight(1f)) {
            Text(entry.title.ifBlank { UrlResolver.displayHost(entry.url) }, style = MaterialTheme.typography.titleSmall,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("$time · ${UrlResolver.displayHost(entry.url)}", style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        IconButton(onClick = onDelete) {
            Icon(Icons.Filled.Close, stringResource(R.string.action_delete), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
