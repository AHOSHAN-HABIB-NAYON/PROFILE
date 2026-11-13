package com.webtecit.filepilot.core.common

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context

/** Copies plain text to the system clipboard. */
fun copyText(context: Context, label: String, text: String) {
    context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText(label, text))
}
