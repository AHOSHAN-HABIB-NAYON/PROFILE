package com.webtecit.nayon.core.designsystem.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * Central type scale. Screens use these roles only, never ad-hoc sizes.
 *
 * Role mapping used across the app:
 * - headlineSmall 24sp -> page headings
 * - titleLarge    20sp -> section headings
 * - titleMedium   16sp -> card / row titles, address text
 * - bodyLarge     16sp -> main body text
 * - bodyMedium    14sp -> secondary text
 * - bodySmall     12sp -> supporting text
 * - labelLarge    14sp -> buttons
 *
 * Sizes are in sp so Android font scaling is always respected.
 */
private val Base = FontFamily.Default

private fun style(size: Int, line: Int, weight: FontWeight, tracking: Double = 0.0) = TextStyle(
    fontFamily = Base,
    fontWeight = weight,
    fontSize = size.sp,
    lineHeight = line.sp,
    letterSpacing = tracking.sp,
)

val NayonTypography = Typography(
    displayLarge = style(48, 56, FontWeight.Bold, -0.5),
    displayMedium = style(40, 48, FontWeight.Bold, -0.25),
    displaySmall = style(32, 40, FontWeight.Bold),
    headlineLarge = style(30, 38, FontWeight.SemiBold),
    headlineMedium = style(26, 34, FontWeight.SemiBold),
    headlineSmall = style(24, 32, FontWeight.SemiBold),
    titleLarge = style(20, 28, FontWeight.SemiBold),
    titleMedium = style(16, 24, FontWeight.Medium, 0.1),
    titleSmall = style(14, 20, FontWeight.Medium, 0.1),
    bodyLarge = style(16, 24, FontWeight.Normal, 0.15),
    bodyMedium = style(14, 20, FontWeight.Normal, 0.15),
    bodySmall = style(12, 16, FontWeight.Normal, 0.3),
    labelLarge = style(14, 20, FontWeight.Medium, 0.1),
    labelMedium = style(12, 16, FontWeight.Medium, 0.4),
    labelSmall = style(11, 16, FontWeight.Medium, 0.5),
)
