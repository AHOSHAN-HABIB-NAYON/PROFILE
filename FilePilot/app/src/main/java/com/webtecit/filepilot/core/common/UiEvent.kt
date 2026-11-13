package com.webtecit.filepilot.core.common

import android.net.Uri

/** One-off instructions from a view model to its screen. */
sealed interface UiEvent {
    data class Message(val text: String) : UiEvent
    data class OpenFolder(val id: String) : UiEvent
    data class OpenFile(val uri: Uri, val mimeType: String, val chooser: Boolean) : UiEvent
    data class Share(val uris: List<Uri>, val mimeTypes: List<String>) : UiEvent
}
