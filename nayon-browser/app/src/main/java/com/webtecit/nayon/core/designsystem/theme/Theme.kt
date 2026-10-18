package com.webtecit.nayon.core.designsystem.theme

import android.content.Context
import android.os.Build
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalContext

/** Whether Material You wallpaper colours are available on this device. */
val supportsDeviceColors: Boolean get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S

/** Families the user can pick on this device. */
fun availableThemeFamilies(): List<ThemeFamily> =
    ThemeFamily.entries.filter { it != ThemeFamily.DEVICE || supportsDeviceColors }

/**
 * Builds the colour scheme for a family and brightness.
 * [context] is only needed for [ThemeFamily.DEVICE]; without it (or below Android 12) Aurora is used.
 */
fun colorSchemeFor(family: ThemeFamily, brightness: Brightness, context: Context? = null): ColorScheme {
    val dark = brightness != Brightness.LIGHT
    val base: ColorScheme =
        if (family == ThemeFamily.DEVICE && context != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        } else if (dark) {
            Palettes.dark(family).toDarkScheme(inverse = Palettes.light(family))
        } else {
            Palettes.light(family).toLightScheme(inverse = Palettes.dark(family))
        }
    return if (brightness == Brightness.AMOLED) base.toAmoled() else base
}

/** The brightness currently applied, readable by any component (e.g. for system-bar decisions). */
val LocalBrightness = staticCompositionLocalOf { Brightness.LIGHT }

@Composable
fun NayonTheme(
    family: ThemeFamily = ThemeFamily.AURORA,
    brightness: Brightness = Brightness.LIGHT,
    content: @Composable () -> Unit,
) {
    val context = LocalContext.current
    val scheme = colorSchemeFor(family, brightness, context)
    CompositionLocalProvider(LocalBrightness provides brightness) {
        MaterialTheme(
            colorScheme = scheme,
            typography = NayonTypography,
            shapes = NayonShapes,
            content = content,
        )
    }
}
