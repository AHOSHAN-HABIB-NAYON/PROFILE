package com.webtecit.devicepilot.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.webtecit.devicepilot.data.ThemeMode

object DpColors {
    val Navy = Color(0xFF0B1B3F)
    val Blue = Color(0xFF1E6BFF)
    val Cyan = Color(0xFF12B5E5)
    val Good = Color(0xFF16A34A)
    val Warn = Color(0xFFD97706)
    val Bad = Color(0xFFDC2626)
    val Neutral = Color(0xFF64748B)
}

@Immutable
data class StatusColors(val good: Color, val warn: Color, val bad: Color, val neutral: Color, val subtleBorder: Color)

val LocalStatusColors = staticCompositionLocalOf {
    StatusColors(DpColors.Good, DpColors.Warn, DpColors.Bad, DpColors.Neutral, Color(0xFFE2E8F5))
}

private val Light: ColorScheme = lightColorScheme(
    primary = DpColors.Blue,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFDDE8FF),
    onPrimaryContainer = Color(0xFF0A2A6B),
    secondary = DpColors.Cyan,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFD7F3FC),
    onSecondaryContainer = Color(0xFF053A4C),
    tertiary = Color(0xFF5B5BD6),
    background = Color(0xFFF5F8FF),
    onBackground = DpColors.Navy,
    surface = Color.White,
    onSurface = DpColors.Navy,
    surfaceVariant = Color(0xFFEEF3FC),
    onSurfaceVariant = Color(0xFF52607A),
    surfaceContainer = Color(0xFFF0F4FD),
    surfaceContainerHigh = Color(0xFFE9EFFB),
    surfaceContainerLow = Color.White,
    outline = Color(0xFFC6D2E8),
    outlineVariant = Color(0xFFE2E8F5),
    error = DpColors.Bad,
)

private val Dark: ColorScheme = darkColorScheme(
    primary = Color(0xFF7AA7FF),
    onPrimary = Color(0xFF00225E),
    primaryContainer = Color(0xFF16336E),
    onPrimaryContainer = Color(0xFFDDE8FF),
    secondary = Color(0xFF5ED3F3),
    onSecondary = Color(0xFF003544),
    secondaryContainer = Color(0xFF0B3B4C),
    onSecondaryContainer = Color(0xFFCDF2FC),
    tertiary = Color(0xFFB9B8FF),
    background = Color(0xFF0A1222),
    onBackground = Color(0xFFE3E9F7),
    surface = Color(0xFF111B2E),
    onSurface = Color(0xFFE3E9F7),
    surfaceVariant = Color(0xFF1A263D),
    onSurfaceVariant = Color(0xFFA9B6CF),
    surfaceContainer = Color(0xFF141F34),
    surfaceContainerHigh = Color(0xFF1B2740),
    surfaceContainerLow = Color(0xFF111B2E),
    outline = Color(0xFF3A4A66),
    outlineVariant = Color(0xFF26344F),
    error = Color(0xFFFF8A80),
)

private val DpTypography = Typography(
    headlineSmall = TextStyle(fontSize = 22.sp, lineHeight = 28.sp, fontWeight = FontWeight.SemiBold),
    titleLarge = TextStyle(fontSize = 19.sp, lineHeight = 25.sp, fontWeight = FontWeight.SemiBold),
    titleMedium = TextStyle(fontSize = 16.sp, lineHeight = 22.sp, fontWeight = FontWeight.SemiBold),
    titleSmall = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 15.sp, lineHeight = 22.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontSize = 12.sp, lineHeight = 17.sp),
    labelLarge = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium),
    labelMedium = TextStyle(fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.Medium),
    labelSmall = TextStyle(fontSize = 11.sp, lineHeight = 15.sp, fontWeight = FontWeight.Medium),
)

private val DpShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(18.dp),
    extraLarge = RoundedCornerShape(24.dp),
)

@Composable
fun isDarkTheme(mode: ThemeMode): Boolean = when (mode) {
    ThemeMode.SYSTEM -> isSystemInDarkTheme()
    ThemeMode.LIGHT -> false
    ThemeMode.DARK -> true
}

@Composable
fun DevicePilotTheme(dark: Boolean, content: @Composable () -> Unit) {
    val status = if (dark) StatusColors(Color(0xFF4ADE80), Color(0xFFFBBF24), Color(0xFFF87171), Color(0xFF94A3B8), Color(0xFF26344F))
    else StatusColors(DpColors.Good, DpColors.Warn, DpColors.Bad, DpColors.Neutral, Color(0xFFE2E8F5))
    CompositionLocalProvider(LocalStatusColors provides status) {
        MaterialTheme(
            colorScheme = if (dark) Dark else Light,
            typography = DpTypography,
            shapes = DpShapes,
            content = content,
        )
    }
}
