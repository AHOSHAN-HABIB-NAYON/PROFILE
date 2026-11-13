package com.webtecit.filepilot.core.preferences

import android.content.Context
import androidx.appcompat.app.AppCompatDelegate

/**
 * Keeps a synchronous copy of the theme so the window background and the system splash screen
 * match the chosen theme from the very first frame (DataStore can only be read asynchronously).
 */
object ThemeMirror {
    private const val FILE = "theme_mirror"
    private const val KEY = "mode"

    fun applyStored(context: Context) {
        val stored = context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString(KEY, null)
        val mode = stored?.let { runCatching { ThemeMode.valueOf(it) }.getOrNull() } ?: ThemeMode.LIGHT
        AppCompatDelegate.setDefaultNightMode(nightModeOf(mode))
    }

    fun update(context: Context, mode: ThemeMode) {
        val prefs = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
        if (prefs.getString(KEY, null) != mode.name) prefs.edit().putString(KEY, mode.name).apply()
        val night = nightModeOf(mode)
        if (AppCompatDelegate.getDefaultNightMode() != night) AppCompatDelegate.setDefaultNightMode(night)
    }

    private fun nightModeOf(mode: ThemeMode): Int = when (mode) {
        ThemeMode.LIGHT -> AppCompatDelegate.MODE_NIGHT_NO
        ThemeMode.DARK -> AppCompatDelegate.MODE_NIGHT_YES
        ThemeMode.SYSTEM -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
    }
}
