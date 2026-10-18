package com.webtecit.nayon.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.performScrollToNode
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.webtecit.nayon.core.designsystem.theme.AppearanceSettings
import com.webtecit.nayon.core.designsystem.theme.Brightness
import com.webtecit.nayon.core.designsystem.theme.NayonTheme
import com.webtecit.nayon.core.designsystem.theme.ThemeFamily
import com.webtecit.nayon.core.designsystem.theme.ThemeMode
import com.webtecit.nayon.feature.appearance.AppearanceScreen
import com.webtecit.nayon.feature.browser.NewTabPage
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config

@RunWith(AndroidJUnit4::class)
@Config(sdk = [34], qualifiers = "w411dp-h891dp-xxhdpi")
class AppearanceScreenTest {

    @get:Rule val compose = createComposeRule()

    private val families = ThemeFamily.entries.filter { it != ThemeFamily.DEVICE }

    @Test fun selectingModeAndFamilyUpdatesState() {
        var settings by mutableStateOf(AppearanceSettings())
        compose.setContent {
            NayonTheme(settings.family, Brightness.LIGHT) {
                AppearanceScreen(
                    settings = settings,
                    families = families,
                    onBack = {},
                    onModeSelected = { settings = settings.copy(mode = it) },
                    onFamilySelected = { settings = settings.copy(family = it) },
                    onDarkStartChanged = {}, onDarkEndChanged = {}, onScheduleAmoledChanged = {},
                )
            }
        }
        compose.onNodeWithText("Dark").performClick()
        assertEquals(ThemeMode.DARK, settings.mode)

        compose.onNode(hasScrollAction()).performScrollToNode(hasText("Emerald"))
        compose.onNodeWithText("Emerald").performClick()
        assertEquals(ThemeFamily.EMERALD, settings.family)
    }

    @Test fun scheduleOptionsAppearOnlyInScheduledMode() {
        var settings by mutableStateOf(AppearanceSettings(mode = ThemeMode.LIGHT))
        compose.setContent {
            NayonTheme {
                AppearanceScreen(settings, families, {}, { settings = settings.copy(mode = it) }, {}, {}, {}, {})
            }
        }
        compose.onNodeWithText("Dark from").assertDoesNotExist()
        compose.onNode(hasScrollAction()).performScrollToNode(hasText("Scheduled"))
        compose.onNodeWithText("Scheduled").performClick()
        compose.onNode(hasScrollAction()).performScrollToNode(hasText("Dark from"))
        compose.onNodeWithText("Dark from").assertIsDisplayed()
        compose.onNode(hasScrollAction()).performScrollToNode(hasText("Use AMOLED black at night"))
        compose.onNodeWithText("Use AMOLED black at night").assertIsDisplayed()
    }

    @Test fun selectedModeIsExposedToAccessibility() {
        compose.setContent {
            NayonTheme { AppearanceScreen(AppearanceSettings(mode = ThemeMode.AMOLED), families, {}, {}, {}, {}, {}, {}) }
        }
        compose.onNodeWithText("AMOLED black").assertIsSelected()
    }

    @Test fun newTabPageRendersInEveryThemeAndBrightness() {
        var family by mutableStateOf(ThemeFamily.AURORA)
        var brightness by mutableStateOf(Brightness.LIGHT)
        compose.setContent {
            NayonTheme(family, brightness) {
                NewTabPage(
                    isPrivate = false, showShortcuts = true, recent = emptyList(), privateIsolationSupported = true,
                    voiceAvailable = false, onSearchClick = {}, onVoiceClick = {}, onOpenUrl = {}, onSeeHistory = {}, onOpenAbout = {},
                )
            }
        }
        for (f in families) for (b in Brightness.entries) {
            family = f; brightness = b
            compose.waitForIdle()
            compose.onNodeWithText("Search or type web address").assertIsDisplayed()
        }
    }
}
