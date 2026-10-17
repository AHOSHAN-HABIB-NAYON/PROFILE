package com.filepilot.app.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import com.filepilot.app.core.model.ThemeMode

object Brand {
    val Indigo = Color(0xFF4F46E5)
    val IndigoBright = Color(0xFF5B5FF2)
    val Violet = Color(0xFF7C3AED)
    val VioletSoft = Color(0xFF7A3CE6)
}

private val LightColors = lightColorScheme(
    primary = Color(0xFF4F46E5),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE7E7FF),
    onPrimaryContainer = Color(0xFF1E1A6E),
    secondary = Color(0xFF6D5BD0),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFEDE9FE),
    onSecondaryContainer = Color(0xFF2E1F72),
    tertiary = Color(0xFF0E9F9A),
    onTertiary = Color.White,
    tertiaryContainer = Color(0xFFD6F5F3),
    onTertiaryContainer = Color(0xFF003734),
    background = Color(0xFFF7F7FB),
    onBackground = Color(0xFF1A1B23),
    surface = Color(0xFFF7F7FB),
    onSurface = Color(0xFF1A1B23),
    surfaceVariant = Color(0xFFE9E9F2),
    onSurfaceVariant = Color(0xFF5D5F6E),
    surfaceTint = Color(0xFF4F46E5),
    surfaceBright = Color(0xFFFFFFFF),
    surfaceDim = Color(0xFFE2E2EA),
    surfaceContainerLowest = Color(0xFFFFFFFF),
    surfaceContainerLow = Color(0xFFFFFFFF),
    surfaceContainer = Color(0xFFF1F1F7),
    surfaceContainerHigh = Color(0xFFEBEBF3),
    surfaceContainerHighest = Color(0xFFE5E5EE),
    outline = Color(0xFFC6C7D3),
    outlineVariant = Color(0xFFE4E4ED),
    error = Color(0xFFDC2626),
    onError = Color.White,
    errorContainer = Color(0xFFFEE2E2),
    onErrorContainer = Color(0xFF7F1D1D),
    inverseSurface = Color(0xFF2B2C36),
    inverseOnSurface = Color(0xFFF2F2F8),
    inversePrimary = Color(0xFFA5A6FF),
    scrim = Color(0xFF000000),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFA9AAFF),
    onPrimary = Color(0xFF1E1A6E),
    primaryContainer = Color(0xFF3730A3),
    onPrimaryContainer = Color(0xFFE2E1FF),
    secondary = Color(0xFFC4B5FD),
    onSecondary = Color(0xFF2E1F72),
    secondaryContainer = Color(0xFF3F2F8A),
    onSecondaryContainer = Color(0xFFEDE9FE),
    tertiary = Color(0xFF5EDAD2),
    onTertiary = Color(0xFF003734),
    tertiaryContainer = Color(0xFF00504C),
    onTertiaryContainer = Color(0xFFD6F5F3),
    background = Color(0xFF0F1020),
    onBackground = Color(0xFFE6E6F0),
    surface = Color(0xFF0F1020),
    onSurface = Color(0xFFE6E6F0),
    surfaceVariant = Color(0xFF26273C),
    onSurfaceVariant = Color(0xFFA6A8BC),
    surfaceTint = Color(0xFFA9AAFF),
    surfaceBright = Color(0xFF2E2F47),
    surfaceDim = Color(0xFF0F1020),
    surfaceContainerLowest = Color(0xFF0B0C19),
    surfaceContainerLow = Color(0xFF17182B),
    surfaceContainer = Color(0xFF1B1C30),
    surfaceContainerHigh = Color(0xFF222338),
    surfaceContainerHighest = Color(0xFF2A2B41),
    outline = Color(0xFF4A4C63),
    outlineVariant = Color(0xFF2C2E44),
    error = Color(0xFFF87171),
    onError = Color(0xFF450A0A),
    errorContainer = Color(0xFF7F1D1D),
    onErrorContainer = Color(0xFFFEE2E2),
    inverseSurface = Color(0xFFE6E6F0),
    inverseOnSurface = Color(0xFF1A1B23),
    inversePrimary = Color(0xFF4F46E5),
    scrim = Color(0xFF000000),
)

private val base = Typography()

/** Medium-density type scale: compact headings, comfortable body text. Respects system font scaling (sp). */
val AppTypography = Typography(
    displaySmall = base.displaySmall.copy(fontSize = 30.sp, lineHeight = 36.sp, fontWeight = FontWeight.SemiBold),
    headlineMedium = base.headlineMedium.copy(fontSize = 24.sp, lineHeight = 30.sp, fontWeight = FontWeight.SemiBold),
    headlineSmall = base.headlineSmall.copy(fontSize = 21.sp, lineHeight = 28.sp, fontWeight = FontWeight.SemiBold),
    titleLarge = base.titleLarge.copy(fontSize = 19.sp, lineHeight = 26.sp, fontWeight = FontWeight.SemiBold),
    titleMedium = base.titleMedium.copy(fontSize = 16.sp, lineHeight = 22.sp, fontWeight = FontWeight.SemiBold),
    titleSmall = base.titleSmall.copy(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = base.bodyLarge.copy(fontSize = 15.sp, lineHeight = 22.sp),
    bodyMedium = base.bodyMedium.copy(fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = base.bodySmall.copy(fontSize = 12.sp, lineHeight = 16.sp),
    labelLarge = base.labelLarge.copy(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium),
    labelMedium = base.labelMedium.copy(fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.Medium),
    labelSmall = base.labelSmall.copy(fontSize = 11.sp, lineHeight = 14.sp, fontWeight = FontWeight.Medium),
)

val MonoStyle = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 13.sp, lineHeight = 19.sp)

val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(6.dp),
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(14.dp),
    large = RoundedCornerShape(20.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

/** True when the dark palette is active, for the few places that tint differently. */
val LocalIsDark = staticCompositionLocalOf { false }

@Composable
fun FilePilotTheme(mode: ThemeMode = ThemeMode.LIGHT, content: @Composable () -> Unit) {
    val dark = when (mode) {
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
        ThemeMode.LIGHT -> false
        ThemeMode.DARK -> true
    }
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? Activity)?.window ?: return@SideEffect
            val controller = WindowCompat.getInsetsController(window, view)
            controller.isAppearanceLightStatusBars = !dark
            controller.isAppearanceLightNavigationBars = !dark
        }
    }
    androidx.compose.runtime.CompositionLocalProvider(LocalIsDark provides dark) {
        MaterialTheme(
            colorScheme = if (dark) DarkColors else LightColors,
            typography = AppTypography,
            shapes = AppShapes,
            content = content,
        )
    }
}
