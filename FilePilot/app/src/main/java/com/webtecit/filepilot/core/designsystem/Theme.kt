package com.webtecit.filepilot.core.designsystem

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.webtecit.filepilot.core.preferences.AccentColor
import com.webtecit.filepilot.core.preferences.ThemeMode

/** False when the user turned animations off in Settings. */
val LocalAnimationsEnabled = staticCompositionLocalOf { true }

/** True when the active colour scheme is dark. */
val LocalDarkTheme = staticCompositionLocalOf { false }

private data class AccentPalette(
    val light: Color, val lightContainer: Color, val onLightContainer: Color,
    val dark: Color, val darkContainer: Color, val onDarkContainer: Color,
)

private fun AccentColor.palette(): AccentPalette = when (this) {
    AccentColor.ROYAL_BLUE -> AccentPalette(
        Color(0xFF2952E3), Color(0xFFDDE4FF), Color(0xFF0A1F6B),
        Color(0xFFB3C3FF), Color(0xFF1E3AA8), Color(0xFFDDE4FF),
    )
    AccentColor.TEAL -> AccentPalette(
        Color(0xFF0F7F76), Color(0xFFC9F1EC), Color(0xFF00332E),
        Color(0xFF6FD9CC), Color(0xFF00504A), Color(0xFFC9F1EC),
    )
    AccentColor.INDIGO -> AccentPalette(
        Color(0xFF4F46E5), Color(0xFFE2E0FF), Color(0xFF1E1A6B),
        Color(0xFFC1BDFF), Color(0xFF3730A3), Color(0xFFE2E0FF),
    )
    AccentColor.EMERALD -> AccentPalette(
        Color(0xFF157A3D), Color(0xFFCDEFD8), Color(0xFF05361A),
        Color(0xFF7FD69B), Color(0xFF14532D), Color(0xFFCDEFD8),
    )
    AccentColor.CRIMSON -> AccentPalette(
        Color(0xFFC2334D), Color(0xFFFFDDE2), Color(0xFF5C0B1C),
        Color(0xFFFFB3BF), Color(0xFF8C1D33), Color(0xFFFFDDE2),
    )
}

/** Swatch colour shown in Settings. */
fun AccentColor.swatch(): Color = palette().light

private fun lightScheme(accent: AccentColor): ColorScheme {
    val p = accent.palette()
    return lightColorScheme(
        primary = p.light,
        onPrimary = Color.White,
        primaryContainer = p.lightContainer,
        onPrimaryContainer = p.onLightContainer,
        secondary = Color(0xFF4A5A7D),
        onSecondary = Color.White,
        secondaryContainer = Color(0xFFE3E8F4),
        onSecondaryContainer = Color(0xFF1B2540),
        tertiary = Color(0xFF0D9488),
        onTertiary = Color.White,
        tertiaryContainer = Color(0xFFCCF5EF),
        onTertiaryContainer = Color(0xFF003A35),
        background = Color.White,
        onBackground = Color(0xFF111827),
        surface = Color.White,
        onSurface = Color(0xFF111827),
        surfaceVariant = Color(0xFFF1F4F9),
        onSurfaceVariant = Color(0xFF5B6475),
        surfaceTint = p.light,
        outline = Color(0xFFC5CCD8),
        outlineVariant = Color(0xFFE5E9F0),
        error = Color(0xFFD92D20),
        onError = Color.White,
        errorContainer = Color(0xFFFEE4E2),
        onErrorContainer = Color(0xFF7A271A),
        inverseSurface = Color(0xFF1F2430),
        inverseOnSurface = Color(0xFFF1F4F9),
        inversePrimary = p.dark,
        surfaceBright = Color.White,
        surfaceDim = Color(0xFFE2E6EE),
        surfaceContainerLowest = Color.White,
        surfaceContainerLow = Color(0xFFF7F9FC),
        surfaceContainer = Color(0xFFF2F5FA),
        surfaceContainerHigh = Color(0xFFECF0F6),
        surfaceContainerHighest = Color(0xFFE6EAF1),
        scrim = Color.Black,
    )
}

private fun darkScheme(accent: AccentColor): ColorScheme {
    val p = accent.palette()
    return darkColorScheme(
        primary = p.dark,
        onPrimary = Color(0xFF0B1437),
        primaryContainer = p.darkContainer,
        onPrimaryContainer = p.onDarkContainer,
        secondary = Color(0xFFB7C3E0),
        onSecondary = Color(0xFF1B2540),
        secondaryContainer = Color(0xFF2C3650),
        onSecondaryContainer = Color(0xFFDCE3F5),
        tertiary = Color(0xFF5EEAD4),
        onTertiary = Color(0xFF00332E),
        tertiaryContainer = Color(0xFF134E4A),
        onTertiaryContainer = Color(0xFFCCF5EF),
        background = Color(0xFF0F1218),
        onBackground = Color(0xFFE6E9EF),
        surface = Color(0xFF0F1218),
        onSurface = Color(0xFFE6E9EF),
        surfaceVariant = Color(0xFF1D222B),
        onSurfaceVariant = Color(0xFFA3ACBB),
        surfaceTint = p.dark,
        outline = Color(0xFF475063),
        outlineVariant = Color(0xFF2A303B),
        error = Color(0xFFFF8A80),
        onError = Color(0xFF5C1A14),
        errorContainer = Color(0xFF5C1A14),
        onErrorContainer = Color(0xFFFFDAD6),
        inverseSurface = Color(0xFFE6E9EF),
        inverseOnSurface = Color(0xFF1F2430),
        inversePrimary = p.light,
        surfaceBright = Color(0xFF2A303A),
        surfaceDim = Color(0xFF0F1218),
        surfaceContainerLowest = Color(0xFF0A0D12),
        surfaceContainerLow = Color(0xFF151920),
        surfaceContainer = Color(0xFF191E26),
        surfaceContainerHigh = Color(0xFF20252E),
        surfaceContainerHighest = Color(0xFF2A303A),
        scrim = Color.Black,
    )
}

/** Slightly compact type scale (about 8% smaller than Material defaults) for a denser, modern look. */
private fun TextStyle.compact(weight: FontWeight? = null): TextStyle = copy(
    fontSize = fontSize * 0.92f,
    lineHeight = lineHeight * 0.92f,
    fontWeight = weight ?: fontWeight,
)

private val AppTypography = Typography().let { t ->
    t.copy(
        displayLarge = t.displayLarge.compact(),
        displayMedium = t.displayMedium.compact(),
        displaySmall = t.displaySmall.compact(),
        headlineLarge = t.headlineLarge.compact(FontWeight.Bold),
        headlineMedium = t.headlineMedium.compact(FontWeight.Bold).copy(letterSpacing = (-0.25).sp),
        headlineSmall = t.headlineSmall.compact(FontWeight.SemiBold),
        titleLarge = t.titleLarge.compact(FontWeight.SemiBold),
        titleMedium = t.titleMedium.compact(FontWeight.SemiBold),
        titleSmall = t.titleSmall.compact(FontWeight.SemiBold),
        bodyLarge = t.bodyLarge.compact(),
        bodyMedium = t.bodyMedium.compact(),
        bodySmall = t.bodySmall.compact(),
        labelLarge = t.labelLarge.compact(FontWeight.Medium),
        labelMedium = t.labelMedium.compact(),
        labelSmall = t.labelSmall.compact(),
    )
}

/** Monospace style for paths and checksums. */
val MonoStyle = TextStyle(fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace, fontSize = 13.sp)

private val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(6.dp),
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(22.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

@Composable
fun FilePilotTheme(
    themeMode: ThemeMode = ThemeMode.LIGHT,
    accent: AccentColor = AccentColor.ROYAL_BLUE,
    dynamicColor: Boolean = false,
    animations: Boolean = true,
    content: @Composable () -> Unit,
) {
    val dark = when (themeMode) {
        ThemeMode.LIGHT -> false
        ThemeMode.DARK -> true
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
    }
    val context = LocalContext.current
    val scheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
            if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        dark -> darkScheme(accent)
        else -> lightScheme(accent)
    }
    CompositionLocalProvider(
        LocalAnimationsEnabled provides animations,
        LocalDarkTheme provides dark,
    ) {
        MaterialTheme(colorScheme = scheme, typography = AppTypography, shapes = AppShapes, content = content)
    }
}
