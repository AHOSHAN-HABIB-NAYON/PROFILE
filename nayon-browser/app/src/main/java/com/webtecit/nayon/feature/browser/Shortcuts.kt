package com.webtecit.nayon.feature.browser

import androidx.compose.ui.graphics.Color

/** A home-page shortcut. Colours are used for the letter tile (no icons are downloaded). */
data class Shortcut(val label: String, val url: String, val color: Color)

val DefaultShortcuts = listOf(
    Shortcut("Google", "https://www.google.com", Color(0xFF1A73E8)),
    Shortcut("YouTube", "https://m.youtube.com", Color(0xFFD32F2F)),
    Shortcut("Facebook", "https://m.facebook.com", Color(0xFF1665D8)),
    Shortcut("Wikipedia", "https://www.wikipedia.org", Color(0xFF4B5563)),
    Shortcut("WebTecIT", "https://webtecit.com", Color(0xFF6D28D9)),
    Shortcut("GitHub", "https://github.com", Color(0xFF24292F)),
    Shortcut("Gmail", "https://mail.google.com", Color(0xFFC5221F)),
    Shortcut("X", "https://x.com", Color(0xFF111111)),
)
