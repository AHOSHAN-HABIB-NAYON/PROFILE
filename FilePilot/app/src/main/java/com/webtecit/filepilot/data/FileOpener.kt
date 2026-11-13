package com.webtecit.filepilot.data

import com.webtecit.filepilot.core.common.UiEvent
import com.webtecit.filepilot.core.storage.FileItem
import com.webtecit.filepilot.core.storage.FileSystems
import com.webtecit.filepilot.core.storage.userMessage
import javax.inject.Inject
import javax.inject.Singleton

/** Turns an item or a saved id into the right action: open the folder, or open the file in another app. */
@Singleton
class FileOpener @Inject constructor(
    private val fileSystems: FileSystems,
    private val library: LibraryRepository,
) {
    suspend fun openId(id: String): UiEvent {
        val item = try {
            fileSystems.of(id).stat(id)
        } catch (e: Exception) {
            return UiEvent.Message(e.userMessage())
        } ?: return UiEvent.Message("This item no longer exists. It may have been moved or deleted.")
        return if (item.isDirectory) UiEvent.OpenFolder(item.id) else openFile(item, chooser = false)
    }

    suspend fun openFile(item: FileItem, chooser: Boolean): UiEvent = try {
        val uri = fileSystems.contentUri(item.id)
        library.addRecent(item)
        UiEvent.OpenFile(uri, item.mimeType, chooser)
    } catch (e: Exception) {
        UiEvent.Message(e.userMessage())
    }

    fun share(items: List<FileItem>): UiEvent {
        val files = items.filter { !it.isDirectory }
        if (files.isEmpty()) return UiEvent.Message("Folders can't be shared directly. Select files instead.")
        return try {
            UiEvent.Share(files.map { fileSystems.contentUri(it.id) }, files.map { it.mimeType })
        } catch (e: Exception) {
            UiEvent.Message(e.userMessage())
        }
    }
}
