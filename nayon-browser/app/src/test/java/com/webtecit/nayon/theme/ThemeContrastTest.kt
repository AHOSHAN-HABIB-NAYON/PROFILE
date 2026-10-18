package com.webtecit.nayon.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import com.webtecit.nayon.core.designsystem.theme.Brightness
import com.webtecit.nayon.core.designsystem.theme.ThemeFamily
import com.webtecit.nayon.core.designsystem.theme.colorSchemeFor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.max
import kotlin.math.min

/** Every built-in theme in every brightness must meet WCAG AA (4.5:1) for text roles. */
class ThemeContrastTest {

    private fun contrast(a: Color, b: Color): Double {
        val la = a.luminance().toDouble(); val lb = b.luminance().toDouble()
        return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
    }

    private val builtInFamilies = ThemeFamily.entries.filter { it != ThemeFamily.DEVICE }

    private fun ColorScheme.textPairs() = listOf(
        "onSurface/surface" to (onSurface to surface),
        "onSurfaceVariant/surface" to (onSurfaceVariant to surface),
        "onSurfaceVariant/surfaceContainerHighest" to (onSurfaceVariant to surfaceContainerHighest),
        "onSurface/surfaceContainerLow" to (onSurface to surfaceContainerLow),
        "onPrimary/primary" to (onPrimary to primary),
        "onPrimaryContainer/primaryContainer" to (onPrimaryContainer to primaryContainer),
        "onSecondary/secondary" to (onSecondary to secondary),
        "onSecondaryContainer/secondaryContainer" to (onSecondaryContainer to secondaryContainer),
        "onTertiaryContainer/tertiaryContainer" to (onTertiaryContainer to tertiaryContainer),
        "primary/surface" to (primary to surface),
        "onError/error" to (onError to error),
    )

    @Test fun allThemesMeetWcagAa() {
        val failures = mutableListOf<String>()
        for (family in builtInFamilies) for (brightness in Brightness.entries) {
            colorSchemeFor(family, brightness).textPairs().forEach { (name, pair) ->
                val ratio = contrast(pair.first, pair.second)
                if (ratio < 4.5) failures += "$family/$brightness $name = ${"%.2f".format(ratio)}"
            }
        }
        assertTrue("Contrast failures:\n" + failures.joinToString("\n"), failures.isEmpty())
    }

    @Test fun amoledUsesTrueBlackSurfaces() {
        for (family in builtInFamilies) {
            val s = colorSchemeFor(family, Brightness.AMOLED)
            assertEquals(Color.Black, s.surface)
            assertEquals(Color.Black, s.background)
        }
    }

    @Test fun eachFamilyHasDistinctPrimary() {
        for (brightness in listOf(Brightness.LIGHT, Brightness.DARK)) {
            val primaries = builtInFamilies.map { colorSchemeFor(it, brightness).primary }
            assertEquals(primaries.size, primaries.toSet().size)
        }
    }
}
