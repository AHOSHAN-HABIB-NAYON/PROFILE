package com.appfix.core.branding

import com.appfix.core.TestFixtures
import com.appfix.core.layout.ComponentKind
import com.appfix.core.layout.LayoutCapabilities
import com.appfix.core.layout.LayoutEditor
import com.appfix.core.patch.ChangeApplier
import com.appfix.core.patch.ChangeSet
import com.appfix.core.patch.FileChange
import com.appfix.core.project.ProjectDetector
import com.appfix.core.resources.ValuesEditor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.io.File
import javax.imageio.ImageIO

class BrandingTest {
    private fun editor(ws: File) = BrandingEditor(ws, ProjectDetector.detect(ws))
    private fun apply(ws: File, set: ChangeSet) = ChangeApplier(ws, File(ws.parentFile, "h-${ws.name}")).apply(set)

    @Test
    fun `icon outputs and conflicting files`() {
        val ws = TestFixtures.copySample()
        File(ws, "app/src/main/res/mipmap-hdpi").mkdirs()
        File(ws, "app/src/main/res/mipmap-hdpi/ic_launcher.webp").writeBytes(byteArrayOf(1, 2, 3))
        val e = editor(ws)
        assertEquals(BrandingEditor.IconNames("ic_launcher", null), e.iconNames())
        val outputs = e.iconOutputs()
        assertEquals(15, outputs.size)
        assertEquals(192, outputs.first { it.path.endsWith("mipmap-xxxhdpi/ic_launcher.png") }.sizePx)
        assertEquals(432, outputs.first { it.path.endsWith("mipmap-xxxhdpi/ic_launcher_foreground.png") }.sizePx)
        val set = e.iconChange(outputs.associate { it.path to png(it.sizePx) }, "#FF102030")
        val paths = set.changes.associateBy { it.path }
        assertEquals(FileChange.Kind.DELETE, paths.getValue("app/src/main/res/mipmap-hdpi/ic_launcher.webp").kind)
        assertTrue(paths.getValue("app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml").after!!.contains("@mipmap/ic_launcher_foreground"))
        assertTrue(paths.getValue("app/src/main/res/values/colors.xml").after!!.contains("<color name=\"ic_launcher_background\">#FF102030</color>"))
        assertTrue(paths.getValue("app/src/main/AndroidManifest.xml").after!!.contains("android:roundIcon=\"@mipmap/ic_launcher_round\""))
        apply(ws, set)
        assertFalse(File(ws, "app/src/main/res/mipmap-hdpi/ic_launcher.webp").exists())
        assertTrue(File(ws, "app/src/main/res/mipmap-mdpi/ic_launcher_round.png").length() > 0)
        try { e.iconChange(emptyMap(), "blue"); fail() } catch (x: BrandingException) {}
    }

    @Test
    fun `app name, theme colours, font, transitions, splash and lottie`() {
        val ws = TestFixtures.copySample()
        assertEquals("Sample Notes" to "app_name", editor(ws).appName())
        apply(ws, editor(ws).appNameChange("Notes \"Pro\""))
        assertEquals("Notes \"Pro\"" to "app_name", editor(ws).appName())

        val colors = editor(ws).themeColors().associate { it.first to it.third }
        assertEquals("#FF1E5EFF", colors["colorPrimary"])
        apply(ws, editor(ws).themeColorChange("colorPrimary", "#FF00897B"))
        assertEquals("#FF00897B", editor(ws).themeColors().first { it.first == "colorPrimary" }.third)
        apply(ws, editor(ws).themeColorChange("colorSecondary", "#FFFFB300"))
        assertEquals("@color/theme_color_secondary", editor(ws).appTheme()!!.items["colorSecondary"])

        apply(ws, editor(ws).fontChange("serif"))
        assertEquals("serif", editor(ws).appTheme()!!.items["android:fontFamily"])
        try { editor(ws).fontChange("Comic Sans"); fail() } catch (e: BrandingException) {}

        apply(ws, editor(ws).transitionChange(BrandingEditor.Transition.SLIDE, 300))
        assertEquals("@style/AppFix.ActivityAnimation", editor(ws).appTheme()!!.items["android:windowAnimationStyle"])
        assertTrue(File(ws, "app/src/main/res/anim/appfix_open_enter.xml").readText().contains("android:fromXDelta=\"100%\""))
        // Re-applying replaces instead of duplicating.
        apply(ws, editor(ws).transitionChange(BrandingEditor.Transition.FADE))
        assertEquals(1, Regex("AppFix.ActivityAnimation\"").findAll(File(ws, "app/src/main/res/values/themes.xml").readText()).count())

        apply(ws, editor(ws).splashChange("#FF000000", "@drawable/ic_launcher_foreground"))
        val v31 = File(ws, "app/src/main/res/values-v31/themes.xml").readText()
        assertTrue(v31, v31.contains("<style name=\"Theme.SampleNotes\" parent=\"Theme.Material3.DayNight.NoActionBar\">"))
        assertTrue(v31.contains("<item name=\"colorPrimary\">@color/brand_primary</item>"))
        assertTrue(v31.contains("android:windowSplashScreenAnimatedIcon\">@drawable/ic_launcher_foreground<"))
        apply(ws, editor(ws).splashChange("#FF111111", null))
        assertEquals(1, Regex("<style ").findAll(File(ws, "app/src/main/res/values-v31/themes.xml").readText()).count())

        apply(ws, editor(ws).lottieChange("intro", LOTTIE))
        val build = File(ws, "app/build.gradle.kts").readText()
        assertTrue(build, build.contains("dependencies {\n    implementation(\"com.airbnb.android:lottie:6.6.7\")\n"))
        assertEquals(1, editor(ws).lottieChange("other", LOTTIE).changes.size)
        try { editor(ws).lottieChange("bad", "{}"); fail() } catch (e: BrandingException) {}
    }

    companion object {
        const val LOTTIE = """{"v":"5.7.4","fr":30,"ip":0,"op":60,"w":100,"h":100,"nm":"dot","ddd":0,"assets":[],"layers":[]}"""

        fun png(size: Int): ByteArray {
            val img = BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB)
            val g = img.createGraphics()
            g.color = Color(0x27, 0x53, 0xE0)
            g.fillOval(size / 8, size / 8, size * 3 / 4, size * 3 / 4)
            g.dispose()
            return ByteArrayOutputStream().also { ImageIO.write(img, "png", it) }.toByteArray()
        }

        /** Applies every branding feature, used for the project that CI compiles. */
        fun applyAllBranding(ws: File) {
            fun e() = BrandingEditor(ws, ProjectDetector.detect(ws))
            val apply = { set: ChangeSet -> ChangeApplier(ws, File(ws.parentFile, "hb-${ws.name}")).apply(set) }
            apply(e().iconChange(e().iconOutputs().associate { it.path to png(it.sizePx) }, "#FFFFFFFF"))
            apply(e().appNameChange("Sample Notes Branded"))
            apply(e().themeColorChange("colorPrimary", "#FF6750A4"))
            apply(e().fontChange("sans-serif-medium"))
            apply(e().transitionChange(BrandingEditor.Transition.SLIDE))
            apply(e().splashChange("#FF6750A4", "@mipmap/ic_launcher_foreground"))
            apply(e().lottieChange("intro", LOTTIE))
            val layoutPath = "app/src/main/res/layout/activity_main.xml"
            val layout = File(ws, layoutPath).readText()
            val r = LayoutEditor.insert(layout, emptyList(), 0, ComponentKind.LOTTIE, LayoutCapabilities(true, true, false), LayoutEditor.declaredIds(layout), label = "intro")
            apply(ChangeSet(title = "lottie view", source = "test", changes = listOf(FileChange(layoutPath, layout, r.layoutText))))
            check(ValuesEditor.read(File(ws, "app/src/main/res/values/strings.xml").readText()).any { it.value == "Sample Notes Branded" })
        }
    }
}
