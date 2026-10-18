package com.appfix.core.generator

import com.appfix.core.TestFixtures
import com.appfix.core.analysis.ProjectAnalyzer
import com.appfix.core.analysis.Severity
import com.appfix.core.layout.ClickAction
import com.appfix.core.layout.ClickActions
import com.appfix.core.layout.ClickSpec
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
import java.io.File

class FeatureGeneratorTest {
    private val allOptions = FeatureOptions(email = "support@example.com", website = "example.com", description = "A test app")

    private fun applyAll(ws: File, kinds: List<FeatureKind> = FeatureKind.entries) {
        for (kind in kinds) {
            val info = ProjectDetector.detect(ws)
            val g = FeatureGenerator(ws, info).generate(kind, allOptions.copy(addEntryButton = kind == FeatureKind.ABOUT))
            ChangeApplier(ws, File(ws.parentFile, "history-${ws.name}")).apply(g.change)
        }
    }

    private fun assertNoErrors(ws: File) {
        val report = ProjectAnalyzer(ws).analyze(ProjectDetector.detect(ws))
        val errors = report.findings.filter { it.severity == Severity.ERROR }
        assertTrue("analysis errors after generation: $errors", errors.isEmpty())
    }

    @Test
    fun `about page for the kotlin xml sample`() {
        val ws = TestFixtures.copySample()
        val g = FeatureGenerator(ws, ProjectDetector.detect(ws)).generate(FeatureKind.ABOUT)
        val paths = g.change.changes.map { it.path }.toSet()
        assertEquals(setOf(
            "app/src/main/res/layout/activity_about.xml",
            "app/src/main/java/com/appfix/sample/AboutActivity.kt",
            "app/src/main/res/values/strings.xml",
            "app/src/main/AndroidManifest.xml",
            "app/src/main/res/layout/activity_main.xml",
            "app/src/main/java/com/appfix/sample/MainActivity.kt",
        ), paths)
        assertTrue(g.plan.first().startsWith("Detected: Kotlin, XML layouts, AppCompat"))
        ChangeApplier(ws, File(ws.parentFile, "h")).apply(g.change)
        val main = File(ws, "app/src/main/java/com/appfix/sample/MainActivity.kt").readText()
        assertTrue(main, main.contains("startActivity(android.content.Intent(this, com.appfix.sample.AboutActivity::class.java))"))
        val manifest = File(ws, "app/src/main/AndroidManifest.xml").readText()
        assertTrue(manifest.contains("android:name=\".AboutActivity\""))
        val strings = ValuesEditor.read(File(ws, "app/src/main/res/values/strings.xml").readText()).associate { it.name to it.value }
        assertEquals("Version %1\$s", strings["about_version"])
        assertEquals("About", strings["button_text"])
        assertNoErrors(ws)
        try { FeatureGenerator(ws, ProjectDetector.detect(ws)).generate(FeatureKind.ABOUT); fail() } catch (e: GeneratorException) {
            assertTrue(e.message!!.contains("already exists"))
        }
    }

    @Test
    fun `contact page requires contact details and validates email`() {
        val ws = TestFixtures.copySample()
        val gen = FeatureGenerator(ws, ProjectDetector.detect(ws))
        try { gen.generate(FeatureKind.CONTACT); fail() } catch (e: GeneratorException) {}
        try { gen.generate(FeatureKind.CONTACT, FeatureOptions(email = "not-an-email")); fail() } catch (e: GeneratorException) {}
        val g = gen.generate(FeatureKind.CONTACT, FeatureOptions(email = "a@b.co", addEntryButton = false))
        val activity = g.change.changes.first { it.path.endsWith("ContactActivity.kt") }.after!!
        assertTrue(activity.contains("mailto:a@b.co"))
        assertFalse(activity.contains("contact_website"))
    }

    @Test
    fun `every feature leaves the kotlin sample free of analysis errors`() {
        val ws = TestFixtures.copySample()
        applyAll(ws)
        assertNoErrors(ws)
    }

    /**
     * Writes three fully modified projects (Kotlin+XML, Java+XML, Compose) for CI to build with Gradle.
     * Set APPFIX_GENERATED_OUT to a directory to enable.
     */
    @Test
    fun `write generated projects for compilation in CI`() {
        val out = System.getenv("APPFIX_GENERATED_OUT")?.let(::File) ?: File(TestFixtures.tempDir("gen"), "out")
        out.deleteRecursively()
        out.mkdirs()

        // 1. Kotlin + XML: all features, every component, every click action.
        val kotlinXml = File(out, "kotlin-xml")
        TestFixtures.copySample().copyRecursively(kotlinXml)
        applyAll(kotlinXml)
        addEveryComponentAndAction(kotlinXml, "kotlin")
        assertNoErrors(kotlinXml)

        // 2. Java + XML.
        val javaXml = File(out, "java-xml")
        TestFixtures.copySample().copyRecursively(javaXml)
        File(javaXml, "app/src/main/java/com/appfix/sample/MainActivity.kt").delete()
        File(javaXml, "app/src/main/java/com/appfix/sample/MainActivity.java").writeText(
            """
            package com.appfix.sample;

            import android.os.Bundle;
            import androidx.appcompat.app.AppCompatActivity;

            public class MainActivity extends AppCompatActivity {
                @Override
                protected void onCreate(Bundle savedInstanceState) {
                    super.onCreate(savedInstanceState);
                    setContentView(R.layout.activity_main);
                }
            }
            """.trimIndent() + "\n",
        )
        applyAll(javaXml)
        addEveryComponentAndAction(javaXml, "java")
        assertTrue(File(javaXml, "app/src/main/java/com/appfix/sample/SettingsActivity.java").isFile)
        assertNoErrors(javaXml)

        // 3. Kotlin + Compose.
        val compose = File(out, "compose")
        TestFixtures.copySample().copyRecursively(compose)
        makeCompose(compose)
        applyAll(compose)
        assertTrue(File(compose, "app/src/main/java/com/appfix/sample/HelpActivity.kt").readText().contains("fun HelpScreen()"))
        assertFalse(File(compose, "app/src/main/res/layout").exists())
        assertNoErrors(compose)
    }

    private fun addEveryComponentAndAction(ws: File, language: String) {
        val layoutPath = "app/src/main/res/layout/activity_main.xml"
        var layout = File(ws, layoutPath).readText()
        val strings = linkedMapOf<String, String>()
        val ids = mutableListOf<String>()
        for (kind in ComponentKind.entries) {
            val r = LayoutEditor.insert(layout, emptyList(), null, kind, LayoutCapabilities(true, true, false), LayoutEditor.declaredIds(layout))
            layout = r.layoutText
            strings += r.strings
            ids += r.newId
        }
        val host = ClickActions.findHost(listOf(File(ws, "app/src/main/java")), ws, "activity_main")!!
        assertEquals(language, host.language)
        var src = File(ws, host.path).readText()
        val actions = listOf(
            ClickSpec(ClickAction.TOAST, "It's \"quoted\" \$text"),
            ClickSpec(ClickAction.OPEN_URL, "https://example.com/?q=1"),
            ClickSpec(ClickAction.SHARE_TEXT, "Check this out"),
            ClickSpec(ClickAction.OPEN_SCREEN, "com.appfix.sample.AboutActivity"),
            ClickSpec(ClickAction.CONFIRM_DIALOG, "Delete everything?", "Confirm"),
        )
        actions.forEachIndexed { i, spec ->
            val h = ClickActions.addHandler(src, host, ids[i], spec)
            src = h.source
            strings += h.strings
        }
        val stringsPath = "app/src/main/res/values/strings.xml"
        var s = File(ws, stringsPath).readText()
        for ((k, v) in strings) s = ValuesEditor.add(s, "string", k, v)
        ChangeApplier(ws, File(ws.parentFile, "h2-${ws.name}")).apply(ChangeSet(title = "components", source = "test", changes = listOf(
            FileChange(layoutPath, File(ws, layoutPath).readText(), layout),
            FileChange(host.path, File(ws, host.path).readText(), src),
            FileChange(stringsPath, File(ws, stringsPath).readText(), s),
        )))
    }

    private fun makeCompose(ws: File) {
        File(ws, "app/src/main/res/layout").deleteRecursively()
        File(ws, "gradle/libs.versions.toml").writeText(
            """
            [versions]
            agp = "8.11.1"
            kotlin = "2.2.0"
            composeBom = "2025.06.01"
            activityCompose = "1.10.1"

            [libraries]
            androidx-compose-bom = { module = "androidx.compose:compose-bom", version.ref = "composeBom" }
            androidx-compose-material3 = { module = "androidx.compose.material3:material3" }
            androidx-compose-ui = { module = "androidx.compose.ui:ui" }
            androidx-activity-compose = { module = "androidx.activity:activity-compose", version.ref = "activityCompose" }

            [plugins]
            android-application = { id = "com.android.application", version.ref = "agp" }
            kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
            kotlin-compose = { id = "org.jetbrains.kotlin.plugin.compose", version.ref = "kotlin" }
            """.trimIndent() + "\n",
        )
        File(ws, "build.gradle.kts").writeText(
            "plugins {\n    alias(libs.plugins.android.application) apply false\n    alias(libs.plugins.kotlin.android) apply false\n    alias(libs.plugins.kotlin.compose) apply false\n}\n",
        )
        val build = File(ws, "app/build.gradle.kts")
        build.writeText(
            build.readText()
                .replace("    alias(libs.plugins.kotlin.android)\n", "    alias(libs.plugins.kotlin.android)\n    alias(libs.plugins.kotlin.compose)\n")
                .replace("    compileOptions {", "    buildFeatures { compose = true }\n    compileOptions {")
                .replace(
                    "    implementation(libs.androidx.appcompat)\n    implementation(libs.material)\n",
                    "    implementation(platform(libs.androidx.compose.bom))\n    implementation(libs.androidx.compose.ui)\n    implementation(libs.androidx.compose.material3)\n    implementation(libs.androidx.activity.compose)\n",
                ),
        )
        File(ws, "app/src/main/res/values/themes.xml").writeText(
            "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<resources>\n    <style name=\"Theme.SampleNotes\" parent=\"android:Theme.Material.Light.NoActionBar\" />\n</resources>\n",
        )
        File(ws, "app/src/main/java/com/appfix/sample/MainActivity.kt").writeText(
            """
            package com.appfix.sample

            import android.os.Bundle
            import androidx.activity.ComponentActivity
            import androidx.activity.compose.setContent
            import androidx.compose.material3.MaterialTheme
            import androidx.compose.material3.Text

            class MainActivity : ComponentActivity() {
                override fun onCreate(savedInstanceState: Bundle?) {
                    super.onCreate(savedInstanceState)
                    setContent { MaterialTheme { Text("Sample Notes") } }
                }
            }
            """.trimIndent() + "\n",
        )
        val strings = File(ws, "app/src/main/res/values/strings.xml")
        strings.writeText(strings.readText().replace(Regex("""\s*<string name="(title|body|no_taps|tap_me|tap_count)">[^<]*</string>"""), ""))
    }
}
