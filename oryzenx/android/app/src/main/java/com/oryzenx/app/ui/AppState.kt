package com.oryzenx.app.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.serialization.json.JsonObject

/** Process-wide UI state: the signed-in user, public config and appearance. */
object AppState {
    var user by mutableStateOf<JsonObject?>(null)
    var config by mutableStateOf<JsonObject?>(null)
    var theme by mutableStateOf("light")
    var unread by mutableStateOf(0)
    var pendingDeepLink by mutableStateOf<String?>(null)
}
