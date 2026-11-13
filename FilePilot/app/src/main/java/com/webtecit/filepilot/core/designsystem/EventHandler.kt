package com.webtecit.filepilot.core.designsystem

import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import com.webtecit.filepilot.core.common.UiEvent
import com.webtecit.filepilot.core.storage.FileIntents
import kotlinx.coroutines.flow.Flow

/** Handles a view model's one-off events: messages, opening files and folders, sharing. */
@Composable
fun EventHandler(
    events: Flow<UiEvent>,
    snackbar: SnackbarHostState,
    onOpenFolder: (String) -> Unit = {},
) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val openFolder by rememberUpdatedState(onOpenFolder)
    LaunchedEffect(events, lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            events.collect { event ->
                when (event) {
                    is UiEvent.Message -> snackbar.showSnackbar(event.text)
                    is UiEvent.OpenFolder -> openFolder(event.id)
                    is UiEvent.OpenFile ->
                        FileIntents.open(context, event.uri, event.mimeType, event.chooser)?.let { snackbar.showSnackbar(it) }
                    is UiEvent.Share ->
                        FileIntents.share(context, event.uris, event.mimeTypes)?.let { snackbar.showSnackbar(it) }
                }
            }
        }
    }
}
