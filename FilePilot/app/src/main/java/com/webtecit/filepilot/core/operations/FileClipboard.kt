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

    fun clear() {
        _clip.value = null
    }
}
