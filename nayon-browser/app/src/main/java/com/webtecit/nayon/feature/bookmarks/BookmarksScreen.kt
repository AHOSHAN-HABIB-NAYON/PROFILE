package com.webtecit.nayon.feature.bookmarks

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.OpenInNew
import androidx.compose.material.icons.outlined.SearchOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
import com.webtecit.nayon.core.designsystem.component.GroupDivider
import com.webtecit.nayon.core.designsystem.component.MessageState
import com.webtecit.nayon.core.designsystem.component.ScreenScaffold
import com.webtecit.nayon.core.designsystem.component.SearchField
import com.webtecit.nayon.core.designsystem.component.SettingsGroup
import com.webtecit.nayon.core.designsystem.component.SiteIcon
import com.webtecit.nayon.core.designsystem.theme.Spacing
import com.webtecit.nayon.data.browser.Bookmark
import com.webtecit.nayon.data.browser.BrowsingRepository
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@OptIn(ExperimentalCoroutinesApi::class)
class BookmarksViewModel(private val repo: BrowsingRepository) : ViewModel() {
    val query = MutableStateFlow("")
    val bookmarks: StateFlow<List<Bookmark>?> = query
        .flatMapLatest { q -> if (q.isBlank()) repo.bookmarks() else repo.searchBookmarks(q.trim()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    fun delete(id: Long) = viewModelScope.launch { repo.deleteBookmark(id) }
    fun rename(id: Long, title: String) = viewModelScope.launch { repo.renameBookmark(id, title.trim()) }
}

@Composable
fun BookmarksScreen(
    onBack: () -> Unit,
    onOpen: (String) -> Unit,
    onOpenInNewTab: (String) -> Unit,
    viewModel: BookmarksViewModel = viewModel(factory = NayonViewModelFactory.Factory),
) {
    val query by viewModel.query.collectAsStateWithLifecycle()
    val bookmarks by viewModel.bookmarks.collectAsStateWithLifecycle()
    var renaming by remember { mutableStateOf<Bookmark?>(null) }

    ScreenScaffold(title = stringResource(R.string.bookmarks_title), onBack = onBack) {
        item { SearchField(query, { viewModel.query.value = it }, stringResource(R.string.bookmarks_search)) }
        val list = bookmarks
        when {
            list == null -> Unit
            list.isEmpty() && query.isBlank() -> item {
                MessageState(Icons.Outlined.BookmarkBorder, stringResource(R.string.bookmarks_empty_title),
                    stringResource(R.string.bookmarks_empty_body))
            }
            list.isEmpty() -> item {
                MessageState(Icons.Outlined.SearchOff, stringResource(R.string.bookmarks_no_results), "")
            }
            else -> item {
                SettingsGroup {
                    list.forEachIndexed { i, b ->
                        if (i > 0) GroupDivider()
                        BookmarkRow(
                            bookmark = b,
                            onOpen = { onOpen(b.url) },
                            onOpenInNewTab = { onOpenInNewTab(b.url) },
                            onRename = { renaming = b },
                            onDelete = { viewModel.delete(b.id) },
                        )
                    }
                }
            }
        }
    }

    renaming?.let { b ->
        RenameDialog(b.title, onDismiss = { renaming = null }, onSave = { viewModel.rename(b.id, it); renaming = null })
    }
}

@Composable
private fun BookmarkRow(bookmark: Bookmark, onOpen: () -> Unit, onOpenInNewTab: () -> Unit, onRename: () -> Unit, onDelete: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    Row(
        Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onOpen).padding(start = Spacing.lg, top = Spacing.sm, bottom = Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SiteIcon(bookmark.url, bookmark.title, size = 40.dp)
        Spacer(Modifier.width(Spacing.md))
        Column(Modifier.weight(1f)) {
            Text(bookmark.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(UrlResolver.displayHost(bookmark.url), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
        }
        Box {
            IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, stringResource(R.string.action_menu)) }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                DropdownMenuItem(text = { Text(stringResource(R.string.action_new_tab)) },
                    leadingIcon = { Icon(Icons.Outlined.OpenInNew, null) }, onClick = { menu = false; onOpenInNewTab() })
                DropdownMenuItem(text = { Text(stringResource(R.string.action_rename)) },
                    leadingIcon = { Icon(Icons.Outlined.Edit, null) }, onClick = { menu = false; onRename() })
                DropdownMenuItem(text = { Text(stringResource(R.string.action_delete)) },
                    leadingIcon = { Icon(Icons.Outlined.Delete, null) }, onClick = { menu = false; onDelete() })
            }
        }
    }
}

@Composable
private fun RenameDialog(initial: String, onDismiss: () -> Unit, onSave: (String) -> Unit) {
    var text by rememberSaveable { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.bookmark_rename_title)) },
        text = {
            OutlinedTextField(text, { text = it }, label = { Text(stringResource(R.string.bookmark_name)) }, singleLine = true)
        },
        confirmButton = { TextButton(onClick = { onSave(text) }, enabled = text.isNotBlank()) { Text(stringResource(R.string.action_save)) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.action_cancel)) } },
    )
}
