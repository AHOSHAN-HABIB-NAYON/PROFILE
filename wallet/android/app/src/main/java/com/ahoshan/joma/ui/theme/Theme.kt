package com.ahoshan.joma.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

val Brand = Color(0xFF0B6E4F)
val BrandBright = Color(0xFF0E8A63)
val Gold = Color(0xFFF2B441)
val MoneyIn = Color(0xFF15803D)
val MoneyInSoft = Color(0xFFDCFCE7)
val MoneyOut = Color(0xFFB42318)
val MoneyOutSoft = Color(0xFFFEE4E2)
val Send = Color(0xFF1D4ED8)
val SendSoft = Color(0xFFDBEAFE)

private val Light = lightColorScheme(
    primary = Brand,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE2F2EB),
    onPrimaryContainer = Color(0xFF053D2C),
    secondary = Color(0xFF3E6A5A),
    background = Color(0xFFF3F6F4),
    onBackground = Color(0xFF10201A),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF10201A),
    surfaceVariant = Color(0xFFF0F4F2),
    onSurfaceVariant = Color(0xFF5B6B64),
    outline = Color(0xFFC9D5CF),
    outlineVariant = Color(0xFFDFE7E3),
    error = MoneyOut,
)

private val Dark = darkColorScheme(
    primary = Color(0xFF46C795),
    onPrimary = Color(0xFF00382A),
    primaryContainer = Color(0xFF173A2D),
    onPrimaryContainer = Color(0xFFBFF0D9),
    background = Color(0xFF0C1512),
    onBackground = Color(0xFFE7F0EC),
    surface = Color(0xFF13201B),
    onSurface = Color(0xFFE7F0EC),
    surfaceVariant = Color(0xFF182822),
    onSurfaceVariant = Color(0xFF9AABA4),
    outline = Color(0xFF3A4C44),
    outlineVariant = Color(0xFF26372F),
    error = Color(0xFFF97066),
)

private val JomaShapes = Shapes(
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(22.dp),
)

@Composable
fun JomaTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) Dark else Light,
        shapes = JomaShapes,
        content = content,
    )
}
