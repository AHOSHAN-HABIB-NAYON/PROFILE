package com.appfix.core.project

import com.appfix.core.TestFixtures
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class ProjectDetectorTest {
    @Test
    fun `detects the native sample project`() {
        val ws = TestFixtures.copySample()
        val info = ProjectDetector.detect(ws)
        assertEquals(Framework.ANDROID_NATIVE, info.framework)
        assertEquals("", info.root)
        assertEquals("", info.androidDir)
        assertEquals("8.14.3", info.gradleVersion)
        assertEquals("8.11.1", info.agpVersion)
        assertEquals("2.2.0", info.kotlinVersion)
        assertTrue(info.hasGradleWrapper && info.hasWrapperJar && info.usesKotlinDsl)
        val app = info.appModule!!
        assertEquals(":app", app.gradlePath)
        assertEquals("com.appfix.sample", app.namespace)
        assertEquals(36, app.compileSdk)
        assertEquals(24, app.minSdk)
        assertEquals(36, app.targetSdk)
        assertEquals("1.0", app.versionName)
        assertEquals("app/src/main/AndroidManifest.xml", app.manifestPath)
        assertTrue("Kotlin" in info.languages)
        assertTrue("XML Views" in info.uiToolkits)
    }

    @Test
    fun `finds the root inside a GitHub-style zipball folder`() {
        val ws = TestFixtures.tempDir()
        TestFixtures.copySample().copyRecursively(File(ws, "owner-repo-abc123"))
        val info = ProjectDetector.detect(ws)
        assertEquals("owner-repo-abc123", info.root)
        assertEquals(Framework.ANDROID_NATIVE, info.framework)
    }

    @Test
    fun `detects flutter with android folder`() {
        val ws = TestFixtures.tempDir()
        File(ws, "pubspec.yaml").writeText("name: demo\ndependencies:\n  flutter:\n    sdk: flutter\n")
        File(ws, "android/app").mkdirs()
        File(ws, "android/settings.gradle").writeText("include ':app'")
        File(ws, "android/app/build.gradle").writeText("apply plugin: 'com.android.application'\nandroid {\n  namespace 'com.demo'\n  compileSdkVersion 34\n}")
        val info = ProjectDetector.detect(ws)
        assertEquals(Framework.FLUTTER, info.framework)
        assertEquals("android", info.androidDir)
        assertEquals("android/app", info.appModule!!.dir)
        assertEquals(34, info.appModule!!.compileSdk)
        assertEquals("flutter build apk --debug", info.buildCommand)
    }

    @Test
    fun `detects react native and expo`() {
        val ws = TestFixtures.tempDir()
        File(ws, "package.json").writeText("""{"dependencies":{"react":"18.0.0","react-native":"0.76.0"}}""")
        assertEquals(Framework.REACT_NATIVE, ProjectDetector.detect(ws).framework)
        File(ws, "package.json").writeText("""{"dependencies":{"expo":"~52.0.0","react-native":"0.76.0"}}""")
        val expo = ProjectDetector.detect(ws)
        assertEquals(Framework.EXPO, expo.framework)
        assertNull(expo.androidDir)
    }

    @Test
    fun `unknown folders are reported as unknown`() {
        val ws = TestFixtures.tempDir()
        File(ws, "notes.txt").writeText("hello")
        val info = ProjectDetector.detect(ws)
        assertEquals(Framework.UNKNOWN, info.framework)
        assertNull(info.androidDir)
    }

    @Test
    fun `groovy scripts and version catalogs are read`() {
        val settings = "rootProject.name = 'x'\ninclude ':app', ':core'\n// include ':ignored'\ninclude(\":feature:login\")"
        assertEquals(listOf(":app", ":core", ":feature:login"), GradleScripts.includedModules(settings))
        val catalog = GradleScripts.parseCatalog("[versions]\nagp = \"8.5.2\"\ncompile-sdk = \"35\"\n[plugins]\nandroid-application = { id = \"com.android.application\", version.ref = \"agp\" }\n")
        val m = GradleScripts.parseModule(":app", "app", "app/build.gradle.kts",
            "plugins { alias(libs.plugins.android.application) }\nandroid {\n compileSdk = libs.versions.compile.sdk.get().toInt()\n defaultConfig { minSdkVersion 21 }\n}", catalog) { false }
        assertEquals(ModuleType.APPLICATION, m.type)
        assertEquals(35, m.compileSdk)
        assertEquals(21, m.minSdk)
        assertEquals("8.5.2", GradleScripts.agpVersion(emptyList(), catalog))
        assertEquals("7.6.4", GradleScripts.gradleVersionFromWrapper("distributionUrl=https\\://services.gradle.org/distributions/gradle-7.6.4-all.zip"))
    }
}
