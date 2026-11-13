package com.webtecit.devicepilot.data

import android.content.Context
import android.provider.Settings

/**
 * Lowers screen brightness for Cool down and restores it afterwards. Needs the user to allow
 * "Modify system settings" for DevicePilot; nothing happens without it.
 */
class BrightnessControl(private val context: Context) {
    private val prefs = context.getSharedPreferences("brightness_restore", Context.MODE_PRIVATE)
    private val resolver get() = context.contentResolver

    fun canWrite(): Boolean = Settings.System.canWrite(context)

    fun hasSaved(): Boolean = prefs.contains("level")

    /** Sets manual brightness to about 30 % (never raises it). Returns true if applied. */
    fun lower(): Boolean = runCatching {
        if (!canWrite()) return false
        val level = Settings.System.getInt(resolver, Settings.System.SCREEN_BRIGHTNESS, 128)
        val mode = Settings.System.getInt(resolver, Settings.System.SCREEN_BRIGHTNESS_MODE, Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL)
        if (!hasSaved()) prefs.edit().putInt("level", level).putInt("mode", mode).apply()
        Settings.System.putInt(resolver, Settings.System.SCREEN_BRIGHTNESS_MODE, Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL)
        Settings.System.putInt(resolver, Settings.System.SCREEN_BRIGHTNESS, minOf(level, 77))
        true
    }.getOrDefault(false)

    fun restore(): Boolean = runCatching {
        if (!canWrite() || !hasSaved()) return false
        Settings.System.putInt(resolver, Settings.System.SCREEN_BRIGHTNESS_MODE, prefs.getInt("mode", Settings.System.SCREEN_BRIGHTNESS_MODE_AUTOMATIC))
        Settings.System.putInt(resolver, Settings.System.SCREEN_BRIGHTNESS, prefs.getInt("level", 128))
        prefs.edit().clear().apply()
        true
    }.getOrDefault(false)
}
