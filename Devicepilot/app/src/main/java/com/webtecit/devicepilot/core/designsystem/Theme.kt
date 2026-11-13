package com.webtecit.devicepilot.core.designsystem

import androidx.compose.foundation.isSystemInDarkTheme
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

object Brand {
    val Green = Color(0xFF12B76A)
    val GreenDark = Color(0xFF0A8A50)
    val GreenLight = Color(0xFFD1FADF)
    val Teal = Color(0xFF0E9384)
    val TealLight = Color(0xFFCCFBEF)
    val Amber = Color(0xFFF59E0B)
    val Red = Color(0xFFE5484D)
    val Navy = Color(0xFF0B1220)
    val NavySurface = Color(0xFF131C2E)
    val NavySurfaceHigh = Color(0xFF1B2539)
    val SoftGray = Color(0xFFF5F7F9)
}

/** Status colours that are not part of the Material scheme. */
@Immutable
data class StatusColors(
    val success: Color,
    val onSuccessContainer: Color,
    val successContainer: Color,
    val warning: Color,
    val warningContainer: Color,
    val onWarningContainer: Color,
    val error: Color,
    val errorContainer: Color,
    val onErrorContainer: Color,
)

private val LightStatus = StatusColors(
    success = Color(0xFF079455),
    successContainer = Color(0xFFDCFAE6),
    onSuccessContainer = Color(0xFF085D3A),
    warning = Color(0xFFB54708),
    warningContainer = Color(0xFFFEF0C7),
    onWarningContainer = Color(0xFF7A2E0E),
    error = Color(0xFFD92D20),
    errorContainer = Color(0xFFFEE4E2),
    onErrorContainer = Color(0xFF7A271A),
)

private val DarkStatus = StatusColors(
    success = Color(0xFF47CD89),
    successContainer = Color(0xFF0B3B26),
    onSuccessContainer = Color(0xFFA6F4C5),
    warning = Color(0xFFFDB022),
    warningContainer = Color(0xFF4A2F06),
    onWarningContainer = Color(0xFFFEDF89),
    error = Color(0xFFF97066),
    errorContainer = Color(0xFF4F1612),
    onErrorContainer = Color(0xFFFECDCA),
)

val LocalStatusColors = staticCompositionLocalOf { LightStatus }

private val LightScheme = lightColorScheme(
    primary = Brand.GreenDark,
    onPrimary = Color.White,
    primaryContainer = Brand.GreenLight,
    onPrimaryContainer = Color(0xFF053321),
    secondary = Brand.Teal,
    onSecondary = Color.White,
    secondaryContainer = Brand.TealLight,
    onSecondaryContainer = Color(0xFF0A3A34),
    tertiary = Color(0xFF155EEF),
    background = Brand.SoftGray,
    onBackground = Color(0xFF101828),
    surface = Color.White,
    onSurface = Color(0xFF101828),
    surfaceVariant = Color(0xFFF0F2F5),
    onSurfaceVariant = Color(0xFF5D6B82),
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color(0xFFFAFBFC),
    surfaceContainer = Color(0xFFF2F4F7),
    surfaceContainerHigh = Color(0xFFEAECF0),
    surfaceContainerHighest = Color(0xFFE4E7EC),
    outline = Color(0xFFD0D5DD),
    outlineVariant = Color(0xFFE6E9EE),
    error = Brand.Red,
)

private val DarkScheme = darkColorScheme(
    primary = Color(0xFF3CCB86),
    onPrimary = Color(0xFF00331C),
    primaryContainer = Color(0xFF0D3B29),
    onPrimaryContainer = Color(0xFFB4F2D0),
    secondary = Color(0xFF2ED3B7),
    onSecondary = Color(0xFF00332C),
    secondaryContainer = Color(0xFF0C3A35),
    onSecondaryContainer = Color(0xFFB2F5EA),
    tertiary = Color(0xFF84ADFF),
    background = Brand.Navy,
    onBackground = Color(0xFFE6EAF2),
    surface = Brand.NavySurface,
    onSurface = Color(0xFFE6EAF2),
    surfaceVariant = Brand.NavySurfaceHigh,
    onSurfaceVariant = Color(0xFF9AA6BC),
    surfaceContainerLowest = Color(0xFF0E1626),
    surfaceContainerLow = Color(0xFF111A2B),
    surfaceContainer = Brand.NavySurface,
    surfaceContainerHigh = Brand.NavySurfaceHigh,
    surfaceContainerHighest = Color(0xFF243048),
    outline = Color(0xFF34405A),
    outlineVariant = Color(0xFF242E44),
    error = Color(0xFFF97066),
)

private val AppTypography = Typography(
    displaySmall = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 34.sp, lineHeight = 40.sp),
    headlineMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 26.sp, lineHeight = 32.sp),
    headlineSmall = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 22.sp, lineHeight = 28.sp),
    titleLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 20.sp, lineHeight = 26.sp),
    titleMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 22.sp),
    titleSmall = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 14.sp, lineHeight = 20.sp),
    bodyLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 16.sp),
    labelLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 14.sp, lineHeight = 20.sp),
    labelMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 16.sp),
    labelSmall = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 11.sp, lineHeight = 16.sp),
)

private val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(6.dp),
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(20.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

enum class ThemeMode { LIGHT, DARK, SYSTEM }

@Composable
fun ThemeMode.isDark(): Boolean = when (this) {
    ThemeMode.LIGHT -> false
    ThemeMode.DARK -> true
    ThemeMode.SYSTEM -> isSystemInDarkTheme()
}

@Composable
fun DevicepilotTheme(darkTheme: Boolean = false, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalStatusColors provides if (darkTheme) DarkStatus else LightStatus) {
        MaterialTheme(
            colorScheme = if (darkTheme) DarkScheme else LightScheme,
            typography = AppTypography,
            shapes = AppShapes,
            content = content,
        )
    }
}

object Spacing {
    val xs = 4.dp
    val sm = 8.dp
    val md = 12.dp
    val lg = 16.dp
    val xl = 24.dp
    val xxl = 32.dp
}
