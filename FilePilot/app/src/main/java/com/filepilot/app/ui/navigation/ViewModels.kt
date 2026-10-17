package com.filepilot.app.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider.AndroidViewModelFactory.Companion.APPLICATION_KEY
import androidx.lifecycle.createSavedStateHandle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.filepilot.app.AppContainer
import com.filepilot.app.FilePilotApp
import com.filepilot.app.core.model.FileItem

/** Creates a ViewModel with access to the app container and its saved state. */
@Composable
inline fun <reified VM : ViewModel> appViewModel(
    key: String? = null,
    crossinline create: (AppContainer, SavedStateHandle) -> VM,
): VM = viewModel(
    key = key,
    factory = viewModelFactory {
        initializer {
            val app = this[APPLICATION_KEY] as FilePilotApp
            create(app.container, createSavedStateHandle())
        }
    },
)

/** Multi-selection by item id, observable from Compose. */
class Selection {
    var ids by mutableStateOf<Set<String>>(emptySet())
        private set

    val active: Boolean get() = ids.isNotEmpty()
    val count: Int get() = ids.size

    fun toggle(item: FileItem) {
        ids = if (item.id in ids) ids - item.id else ids + item.id
    }

    fun selectAll(items: List<FileItem>) {
        ids = items.mapTo(HashSet()) { it.id }
    }

    fun clear() {
        ids = emptySet()
    }

    fun retain(items: List<FileItem>) {
        val valid = items.mapTo(HashSet()) { it.id }
        if (!valid.containsAll(ids)) ids = ids intersect valid
    }

    fun selectedFrom(items: List<FileItem>): List<FileItem> = items.filter { it.id in ids }
}
