package com.webtecit.nayon.core.designsystem.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color

/**
 * Hand-tuned colour roles for one brightness of a [ThemeFamily].
 * Every on-colour pair is checked for WCAG AA contrast (>= 4.5:1) in ThemeContrastTest.
 */
internal data class Palette(
    val primary: Long, val onPrimary: Long,
    val primaryContainer: Long, val onPrimaryContainer: Long,
    val secondary: Long, val onSecondary: Long,
    val secondaryContainer: Long, val onSecondaryContainer: Long,
    val tertiary: Long, val onTertiary: Long,
    val tertiaryContainer: Long, val onTertiaryContainer: Long,
    val surface: Long, val onSurface: Long, val onSurfaceVariant: Long,
    val outline: Long, val outlineVariant: Long,
    val containerLowest: Long, val containerLow: Long, val container: Long,
    val containerHigh: Long, val containerHighest: Long,
)

internal fun Palette.toLightScheme(inverse: Palette): ColorScheme = lightColorScheme(
    primary = Color(primary), onPrimary = Color(onPrimary),
    primaryContainer = Color(primaryContainer), onPrimaryContainer = Color(onPrimaryContainer),
    secondary = Color(secondary), onSecondary = Color(onSecondary),
    secondaryContainer = Color(secondaryContainer), onSecondaryContainer = Color(onSecondaryContainer),
    tertiary = Color(tertiary), onTertiary = Color(onTertiary),
    tertiaryContainer = Color(tertiaryContainer), onTertiaryContainer = Color(onTertiaryContainer),
    background = Color(surface), onBackground = Color(onSurface),
    surface = Color(surface), onSurface = Color(onSurface),
    surfaceVariant = Color(containerHighest), onSurfaceVariant = Color(onSurfaceVariant),
    surfaceTint = Color(primary),
    inverseSurface = Color(inverse.container), inverseOnSurface = Color(inverse.onSurface),
    inversePrimary = Color(inverse.primary),
    error = Color(0xFFBA1A1A), onError = Color(0xFFFFFFFF),
    errorContainer = Color(0xFFFFDAD6), onErrorContainer = Color(0xFF410002),
    outline = Color(outline), outlineVariant = Color(outlineVariant),
    scrim = Color(0xFF000000),
    surfaceBright = Color(containerLowest), surfaceDim = Color(containerHighest),
    surfaceContainerLowest = Color(containerLowest), surfaceContainerLow = Color(containerLow),
    surfaceContainer = Color(container), surfaceContainerHigh = Color(containerHigh),
    surfaceContainerHighest = Color(containerHighest),
)

internal fun Palette.toDarkScheme(inverse: Palette): ColorScheme = darkColorScheme(
    primary = Color(primary), onPrimary = Color(onPrimary),
    primaryContainer = Color(primaryContainer), onPrimaryContainer = Color(onPrimaryContainer),
    secondary = Color(secondary), onSecondary = Color(onSecondary),
    secondaryContainer = Color(secondaryContainer), onSecondaryContainer = Color(onSecondaryContainer),
    tertiary = Color(tertiary), onTertiary = Color(onTertiary),
    tertiaryContainer = Color(tertiaryContainer), onTertiaryContainer = Color(onTertiaryContainer),
    background = Color(surface), onBackground = Color(onSurface),
    surface = Color(surface), onSurface = Color(onSurface),
    surfaceVariant = Color(containerHighest), onSurfaceVariant = Color(onSurfaceVariant),
    surfaceTint = Color(primary),
    inverseSurface = Color(inverse.container), inverseOnSurface = Color(inverse.onSurface),
    inversePrimary = Color(inverse.primary),
    error = Color(0xFFFFB4AB), onError = Color(0xFF690005),
    errorContainer = Color(0xFF93000A), onErrorContainer = Color(0xFFFFDAD6),
    outline = Color(outline), outlineVariant = Color(outlineVariant),
    scrim = Color(0xFF000000),
    surfaceBright = Color(containerHighest), surfaceDim = Color(containerLowest),
    surfaceContainerLowest = Color(containerLowest), surfaceContainerLow = Color(containerLow),
    surfaceContainer = Color(container), surfaceContainerHigh = Color(containerHigh),
    surfaceContainerHighest = Color(containerHighest),
)

/** Converts any dark scheme into a true-black AMOLED variant, keeping its accents. */
fun ColorScheme.toAmoled(): ColorScheme = copy(
    background = Color.Black,
    surface = Color.Black,
    surfaceDim = Color.Black,
    surfaceBright = Color(0xFF26262B),
    surfaceContainerLowest = Color.Black,
    surfaceContainerLow = Color(0xFF0A0A0C),
    surfaceContainer = Color(0xFF111114),
    surfaceContainerHigh = Color(0xFF18181C),
    surfaceContainerHighest = Color(0xFF202025),
    surfaceVariant = Color(0xFF202025),
)

internal object Palettes {
    val auroraLight = Palette(
        primary = 0xFF6D28D9, onPrimary = 0xFFFFFFFF, primaryContainer = 0xFFEDE9FE, onPrimaryContainer = 0xFF2E1065,
        secondary = 0xFF2563EB, onSecondary = 0xFFFFFFFF, secondaryContainer = 0xFFDBEAFE, onSecondaryContainer = 0xFF172554,
        tertiary = 0xFFBE185D, onTertiary = 0xFFFFFFFF, tertiaryContainer = 0xFFFCE7F3, onTertiaryContainer = 0xFF500724,
        surface = 0xFFFAF9FE, onSurface = 0xFF1A1726, onSurfaceVariant = 0xFF4A4560,
        outline = 0xFF7A7590, outlineVariant = 0xFFCBC6DB,
        containerLowest = 0xFFFFFFFF, containerLow = 0xFFF5F3FB, container = 0xFFEFEDF7,
        containerHigh = 0xFFE9E6F2, containerHighest = 0xFFE3E0EE,
    )
    val auroraDark = Palette(
        primary = 0xFFC4B5FD, onPrimary = 0xFF2E1065, primaryContainer = 0xFF4C1D95, onPrimaryContainer = 0xFFEDE9FE,
        secondary = 0xFF93C5FD, onSecondary = 0xFF172554, secondaryContainer = 0xFF1E3A8A, onSecondaryContainer = 0xFFDBEAFE,
        tertiary = 0xFFF9A8D4, onTertiary = 0xFF500724, tertiaryContainer = 0xFF831843, onTertiaryContainer = 0xFFFCE7F3,
        surface = 0xFF13111C, onSurface = 0xFFE8E4F3, onSurfaceVariant = 0xFFC9C3DA,
        outline = 0xFF938DA6, outlineVariant = 0xFF48435A,
        containerLowest = 0xFF0E0C15, containerLow = 0xFF1A1724, container = 0xFF1F1C2A,
        containerHigh = 0xFF292535, containerHighest = 0xFF343040,
    )
    val obsidianLight = Palette(
        primary = 0xFF0E7490, onPrimary = 0xFFFFFFFF, primaryContainer = 0xFFCFFAFE, onPrimaryContainer = 0xFF083344,
        secondary = 0xFF1E40AF, onSecondary = 0xFFFFFFFF, secondaryContainer = 0xFFDBEAFE, onSecondaryContainer = 0xFF172554,
        tertiary = 0xFF0F766E, onTertiary = 0xFFFFFFFF, tertiaryContainer = 0xFFCCFBF1, onTertiaryContainer = 0xFF042F2E,
        surface = 0xFFF7FAFC, onSurface = 0xFF0F172A, onSurfaceVariant = 0xFF475569,
        outline = 0xFF64748B, outlineVariant = 0xFFCBD5E1,
        containerLowest = 0xFFFFFFFF, containerLow = 0xFFF1F5F9, container = 0xFFEBF0F5,
        containerHigh = 0xFFE2E8F0, containerHighest = 0xFFDCE3EB,
    )
    val obsidianDark = Palette(
        primary = 0xFF22D3EE, onPrimary = 0xFF083344, primaryContainer = 0xFF155E75, onPrimaryContainer = 0xFFCFFAFE,
        secondary = 0xFF93C5FD, onSecondary = 0xFF172554, secondaryContainer = 0xFF1E3A8A, onSecondaryContainer = 0xFFDBEAFE,
        tertiary = 0xFF5EEAD4, onTertiary = 0xFF042F2E, tertiaryContainer = 0xFF115E59, onTertiaryContainer = 0xFFCCFBF1,
        surface = 0xFF0B1120, onSurface = 0xFFE2E8F0, onSurfaceVariant = 0xFFA8B3C7,
        outline = 0xFF7B879C, outlineVariant = 0xFF334155,
        containerLowest = 0xFF070C18, containerLow = 0xFF0F172A, container = 0xFF131C31,
        containerHigh = 0xFF1A253D, containerHighest = 0xFF233049,
    )
    val emeraldLight = Palette(
        primary = 0xFF047857, onPrimary = 0xFFFFFFFF, primaryContainer = 0xFFD1FAE5, onPrimaryContainer = 0xFF022C22,
        secondary = 0xFF0F766E, onSecondary = 0xFFFFFFFF, secondaryContainer = 0xFFCCFBF1, onSecondaryContainer = 0xFF042F2E,
        tertiary = 0xFF4D7C0F, onTertiary = 0xFFFFFFFF, tertiaryContainer = 0xFFECFCCB, onTertiaryContainer = 0xFF1A2E05,
        surface = 0xFFF7FAF8, onSurface = 0xFF111A16, onSurfaceVariant = 0xFF46534D,
        outline = 0xFF6F7C76, outlineVariant = 0xFFC5D0CA,
        containerLowest = 0xFFFFFFFF, containerLow = 0xFFF1F5F3, container = 0xFFEBF0ED,
        containerHigh = 0xFFE4EAE7, containerHighest = 0xFFDEE5E1,
    )
    val emeraldDark = Palette(
        primary = 0xFF34D399, onPrimary = 0xFF022C22, primaryContainer = 0xFF065F46, onPrimaryContainer = 0xFFD1FAE5,
        secondary = 0xFF5EEAD4, onSecondary = 0xFF042F2E, secondaryContainer = 0xFF115E59, onSecondaryContainer = 0xFFCCFBF1,
        tertiary = 0xFFBEF264, onTertiary = 0xFF1A2E05, tertiaryContainer = 0xFF3F6212, onTertiaryContainer = 0xFFECFCCB,
        surface = 0xFF0C1411, onSurface = 0xFFE1EBE6, onSurfaceVariant = 0xFFAFC0B8,
        outline = 0xFF82938B, outlineVariant = 0xFF34433C,
        containerLowest = 0xFF08100D, containerLow = 0xFF121C18, container = 0xFF16211D,
        containerHigh = 0xFF1D2A25, containerHighest = 0xFF26342E,
    )
    val cyberNeonLight = Palette(
        primary = 0xFF7C3AED, onPrimary = 0xFFFFFFFF, primaryContainer = 0xFFEDE9FE, onPrimaryContainer = 0xFF2E1065,
        secondary = 0xFF0369A1, onSecondary = 0xFFFFFFFF, secondaryContainer = 0xFFE0F2FE, onSecondaryContainer = 0xFF082F49,
        tertiary = 0xFFA21CAF, onTertiary = 0xFFFFFFFF, tertiaryContainer = 0xFFFAE8FF, onTertiaryContainer = 0xFF4A044E,
        surface = 0xFFFAF8FF, onSurface = 0xFF1B1530, onSurfaceVariant = 0xFF4B4566,
        outline = 0xFF7B7596, outlineVariant = 0xFFCDC7E0,
        containerLowest = 0xFFFFFFFF, containerLow = 0xFFF4F1FC, container = 0xFFEEEBF8,
        containerHigh = 0xFFE9E5F5, containerHighest = 0xFFE4DFF2,
    )
    val cyberNeonDark = Palette(
        primary = 0xFFA78BFA, onPrimary = 0xFF1E0A4A, primaryContainer = 0xFF5B21B6, onPrimaryContainer = 0xFFEDE9FE,
        secondary = 0xFF38BDF8, onSecondary = 0xFF082F49, secondaryContainer = 0xFF075985, onSecondaryContainer = 0xFFE0F2FE,
        tertiary = 0xFFF0ABFC, onTertiary = 0xFF4A044E, tertiaryContainer = 0xFF86198F, onTertiaryContainer = 0xFFFAE8FF,
        surface = 0xFF0D0A1A, onSurface = 0xFFEDE9FE, onSurfaceVariant = 0xFFC4BEDF,
        outline = 0xFF948DB2, outlineVariant = 0xFF3D3657,
        containerLowest = 0xFF080612, containerLow = 0xFF151125, container = 0xFF1B162E,
        containerHigh = 0xFF241E3A, containerHighest = 0xFF2F2945,
    )
    val warmMinimalLight = Palette(
        primary = 0xFF8B5E34, onPrimary = 0xFFFFFFFF, primaryContainer = 0xFFF3E3D3, onPrimaryContainer = 0xFF3B2412,
        secondary = 0xFF5F6450, onSecondary = 0xFFFFFFFF, secondaryContainer = 0xFFE6E7DC, onSecondaryContainer = 0xFF2E3124,
        tertiary = 0xFF9A3412, onTertiary = 0xFFFFFFFF, tertiaryContainer = 0xFFFFEDD5, onTertiaryContainer = 0xFF431407,
        surface = 0xFFFBF8F3, onSurface = 0xFF2A2420, onSurfaceVariant = 0xFF5C534B,
        outline = 0xFF8A8077, outlineVariant = 0xFFDDD4CA,
        containerLowest = 0xFFFFFFFF, containerLow = 0xFFF6F1EA, container = 0xFFF1EBE3,
        containerHigh = 0xFFEBE4DB, containerHighest = 0xFFE5DDD3,
    )
    val warmMinimalDark = Palette(
        primary = 0xFFE0B892, onPrimary = 0xFF3B2412, primaryContainer = 0xFF6B4527, onPrimaryContainer = 0xFFF3E3D3,
        secondary = 0xFFC5C8B4, onSecondary = 0xFF2E3124, secondaryContainer = 0xFF474B3A, onSecondaryContainer = 0xFFE6E7DC,
        tertiary = 0xFFFDBA74, onTertiary = 0xFF431407, tertiaryContainer = 0xFF7C2D12, onTertiaryContainer = 0xFFFFEDD5,
        surface = 0xFF171412, onSurface = 0xFFEDE5DC, onSurfaceVariant = 0xFFCFC4B8,
        outline = 0xFF9A8F84, outlineVariant = 0xFF4A423B,
        containerLowest = 0xFF120F0D, containerLow = 0xFF1E1A17, container = 0xFF231F1B,
        containerHigh = 0xFF2D2824, containerHighest = 0xFF38322D,
    )

    fun light(family: ThemeFamily): Palette = when (family) {
        ThemeFamily.AURORA, ThemeFamily.DEVICE -> auroraLight
        ThemeFamily.OBSIDIAN -> obsidianLight
        ThemeFamily.EMERALD -> emeraldLight
        ThemeFamily.CYBER_NEON -> cyberNeonLight
        ThemeFamily.WARM_MINIMAL -> warmMinimalLight
    }

    fun dark(family: ThemeFamily): Palette = when (family) {
        ThemeFamily.AURORA, ThemeFamily.DEVICE -> auroraDark
        ThemeFamily.OBSIDIAN -> obsidianDark
        ThemeFamily.EMERALD -> emeraldDark
        ThemeFamily.CYBER_NEON -> cyberNeonDark
        ThemeFamily.WARM_MINIMAL -> warmMinimalDark
    }
}
