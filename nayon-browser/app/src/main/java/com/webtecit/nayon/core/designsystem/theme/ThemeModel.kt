package com.webtecit.nayon.core.designsystem.theme

/** How the app decides between light and dark surfaces. */
enum class ThemeMode { SYSTEM, LIGHT, DARK, AMOLED, SCHEDULED }

/** Accent colour families. Each one has a light and a dark palette. */
enum class ThemeFamily { AURORA, OBSIDIAN, EMERALD, CYBER_NEON, WARM_MINIMAL, DEVICE }

/** The brightness actually rendered right now, after resolving [ThemeMode]. */
enum class Brightness { LIGHT, DARK, AMOLED }

data class AppearanceSettings(
    val mode: ThemeMode = ThemeMode.SYSTEM,
    val family: ThemeFamily = ThemeFamily.AURORA,
    /** Minute of day (0..1439) when the scheduled dark period starts. */
    val darkStartMinute: Int = 19 * 60,
    /** Minute of day (0..1439) when the scheduled dark period ends. */
    val darkEndMinute: Int = 7 * 60,
    /** Use AMOLED black instead of regular dark during the scheduled dark period. */
    val scheduleUsesAmoled: Boolean = false,
)

const val MINUTES_PER_DAY = 24 * 60

/**
 * True when [minuteOfDay] falls inside the dark period [start, end).
 * Periods may wrap past midnight (e.g. 19:00 -> 07:00). Equal start and end means no dark period.
 */
fun isInDarkPeriod(minuteOfDay: Int, start: Int, end: Int): Boolean = when {
    start == end -> false
    start < end -> minuteOfDay in start until end
    else -> minuteOfDay >= start || minuteOfDay < end
}

fun resolveBrightness(settings: AppearanceSettings, systemDark: Boolean, minuteOfDay: Int): Brightness =
    when (settings.mode) {
        ThemeMode.SYSTEM -> if (systemDark) Brightness.DARK else Brightness.LIGHT
        ThemeMode.LIGHT -> Brightness.LIGHT
        ThemeMode.DARK -> Brightness.DARK
        ThemeMode.AMOLED -> Brightness.AMOLED
        ThemeMode.SCHEDULED ->
            if (isInDarkPeriod(minuteOfDay, settings.darkStartMinute, settings.darkEndMinute)) {
                if (settings.scheduleUsesAmoled) Brightness.AMOLED else Brightness.DARK
            } else {
                Brightness.LIGHT
            }
    }
