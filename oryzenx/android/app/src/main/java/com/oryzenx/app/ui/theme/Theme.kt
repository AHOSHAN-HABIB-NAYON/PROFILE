package com.oryzenx.app.ui.theme

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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Semantic colours shared with the web design tokens (public/assets/css/tokens.css). */
@Immutable
data class OxColors(
    val bg: Color, val surface: Color, val surface2: Color, val border: Color,
    val text: Color, val text2: Color, val text3: Color, val navy: Color,
    val primary: Color, val primarySoft: Color, val gain: Color, val gainSoft: Color,
    val loss: Color, val lossSoft: Color, val warn: Color, val warnSoft: Color, val info: Color, val infoSoft: Color,
)

val LightOx = OxColors(
    bg = Color(0xFFF5F7FB), surface = Color.White, surface2 = Color(0xFFF1F4F9), border = Color(0xFFE3E8F0),
    text = Color(0xFF0E1726), text2 = Color(0xFF4A5568), text3 = Color(0xFF8592A6), navy = Color(0xFF0B1F4D),
    primary = Color(0xFF1A56DB), primarySoft = Color(0xFFE8EFFD), gain = Color(0xFF0B8A5F), gainSoft = Color(0xFFE3F5EE),
    loss = Color(0xFFD92D20), lossSoft = Color(0xFFFDECEA), warn = Color(0xFFA15C07), warnSoft = Color(0xFFFEF3D7),
    info = Color(0xFF1D6FB8), infoSoft = Color(0xFFE6F1FB),
)
val DarkOx = OxColors(
    bg = Color(0xFF0A1120), surface = Color(0xFF101A2D), surface2 = Color(0xFF152139), border = Color(0xFF22314F),
    text = Color(0xFFE7ECF5), text2 = Color(0xFFA5B1C6), text3 = Color(0xFF6E7C95), navy = Color(0xFF142449),
    primary = Color(0xFF5B8DEF), primarySoft = Color(0xFF1A2B4D), gain = Color(0xFF3DD4A0), gainSoft = Color(0xFF12332A),
    loss = Color(0xFFFF7A70), lossSoft = Color(0xFF3B1C1C), warn = Color(0xFFF5B94A), warnSoft = Color(0xFF3A2C10),
    info = Color(0xFF6CB2F2), infoSoft = Color(0xFF14293F),
)

val LocalOx = staticCompositionLocalOf { LightOx }

object Ox {
    val colors: OxColors @Composable get() = LocalOx.current
}

private val AppTypography = Typography(
    displaySmall = TextStyle(fontSize = 34.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp),
    headlineSmall = TextStyle(fontSize = 24.sp, fontWeight = FontWeight.Bold),
    titleLarge = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.SemiBold),
    titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 21.sp),
    bodySmall = TextStyle(fontSize = 12.sp, lineHeight = 17.sp),
    labelLarge = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.SemiBold),
    labelMedium = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.SemiBold),
)

@Composable
fun OryzenTheme(themePref: String, content: @Composable () -> Unit) {
    val dark = when (themePref) { "dark" -> true; "system" -> isSystemInDarkTheme(); else -> false }
    val ox = if (dark) DarkOx else LightOx
    val scheme = if (dark) darkColorScheme(
        primary = ox.primary, onPrimary = Color(0xFF0A1120), background = ox.bg, surface = ox.surface, onBackground = ox.text,
        onSurface = ox.text, surfaceVariant = ox.surface2, onSurfaceVariant = ox.text2, outline = ox.border, error = ox.loss,
        primaryContainer = ox.primarySoft, onPrimaryContainer = ox.primary, secondaryContainer = ox.primarySoft, surfaceContainer = ox.surface,
    ) else lightColorScheme(
        primary = ox.primary, onPrimary = Color.White, background = ox.bg, surface = ox.surface, onBackground = ox.text,
        onSurface = ox.text, surfaceVariant = ox.surface2, onSurfaceVariant = ox.text2, outline = ox.border, error = ox.loss,
        primaryContainer = ox.primarySoft, onPrimaryContainer = ox.primary, secondaryContainer = ox.primarySoft, surfaceContainer = ox.surface,
    )
    CompositionLocalProvider(LocalOx provides ox) {
        MaterialTheme(
            colorScheme = scheme,
            typography = AppTypography,
            shapes = Shapes(small = RoundedCornerShape(8.dp), medium = RoundedCornerShape(12.dp), large = RoundedCornerShape(16.dp)),
            content = content,
        )
    }
}
