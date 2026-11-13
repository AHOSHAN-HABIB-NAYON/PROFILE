package com.webtecit.filepilot.core.operations

import com.webtecit.filepilot.core.storage.FileItem
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class ClipMode { COPY, CUT }

data class FileClip(val items: List<FileItem>, val mode: ClipMode, val sourceDirId: String)

/** Items waiting to be pasted. Shared by every folder screen. */
@Singleton
class FileClipboard @Inject constructor() {
    private val _clip = MutableStateFlow<FileClip?>(null)
    val clip: StateFlow<FileClip?> = _clip.asStateFlow()

    fun set(items: List<FileItem>, mode: ClipMode, sourceDirId: String) {
        _clip.value = if (items.isEmpty()) null else FileClip(items, mode, sourceDirId)
    }

    /**
     * Adds items to the clipboard. Copying more items in the same mode (from any folder) adds to
     * what is already there, so files from several folders can be pasted together.
     * Returns the number of items now on the clipboard.
     */
    fun add(items: List<FileItem>, mode: ClipMode, sourceDirId: String): Int {
        val current = _clip.value
        val merged = if (current != null && current.mode == mode) (current.items + items).distinctBy { it.id } else items
        _clip.value = if (merged.isEmpty()) null else FileClip(merged, mode, current?.sourceDirId?.takeIf { it == sourceDirId } ?: sourceDirId)
        return merged.size
    }

    fun remove(id: String) {
        val current = _clip.value ?: return
        val left = current.items.filterNot { it.id == id }
        _clip.value = if (left.isEmpty()) null else current.copy(items = left)
    }

    fun clear() {
        _clip.value = null
    }
}
