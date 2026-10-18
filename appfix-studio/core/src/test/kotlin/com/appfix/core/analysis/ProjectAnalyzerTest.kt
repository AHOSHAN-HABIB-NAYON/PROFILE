package com.appfix.core.analysis

import com.appfix.core.TestFixtures
import com.appfix.core.patch.ChangeApplier
import com.appfix.core.project.ProjectDetector
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.util.Base64

class ProjectAnalyzerTest {
    private val resources = FixResources("#!/bin/sh\necho gradlew", "@echo gradlew", Base64.getEncoder().encodeToString(byteArrayOf(0x50, 0x4b, 3, 4)))

    private fun analyze(ws: File) = ProjectAnalyzer(ws).analyze(ProjectDetector.detect(ws))

    /** Applies the fix for [ruleId] and returns the findings afterwards. */
    private fun fix(ws: File, ruleId: String): List<Finding> {
        val finding = analyze(ws).findings.firstOrNull { it.ruleId == ruleId } ?: error("No $ruleId finding: ${analyze(ws).findings.map { it.ruleId }}")
        assertTrue("$ruleId should be fixable", finding.hasFix)
        val change = RepairEngine(ws, resources).createFix(finding)
        ChangeApplier(ws, File(ws.parentFile, "history")).apply(change)
        return analyze(ws).findings
    }

    @Test
    fun `sample project has no errors`() {
        val report = analyze(TestFixtures.copySample())
        val errors = report.findings.filter { it.severity == Severity.ERROR }
        assertTrue("unexpected errors: $errors", errors.isEmpty())
        assertTrue(report.limitations.isNotEmpty())
    }

    @Test
    fun `missing exported attribute is detected and fixed`() {
        val ws = TestFixtures.copySample()
        val manifest = File(ws, "app/src/main/AndroidManifest.xml")
        manifest.writeText(manifest.readText().replace("\n            android:exported=\"true\"", ""))
        val f = analyze(ws).findings.single { it.ruleId == "manifest.exported_missing" }
        assertEquals(Certainty.CONFIRMED, f.certainty)
        assertEquals(10, f.line)
        val after = fix(ws, "manifest.exported_missing")
        assertFalse(after.any { it.ruleId == "manifest.exported_missing" })
        assertTrue(manifest.readText().contains("android:name=\".MainActivity\"\n            android:exported=\"true\">"))
    }

    @Test
    fun `package attribute without namespace is moved to namespace`() {
        val ws = TestFixtures.copySample()
        val build = File(ws, "app/build.gradle.kts")
        build.writeText(build.readText().replace("    namespace = \"com.appfix.sample\"\n", ""))
        val manifest = File(ws, "app/src/main/AndroidManifest.xml")
        manifest.writeText(manifest.readText().replace("<manifest xmlns:android=\"http://schemas.android.com/apk/res/android\">",
            "<manifest xmlns:android=\"http://schemas.android.com/apk/res/android\"\n    package=\"com.appfix.sample\">"))
        val after = fix(ws, "module.namespace_missing")
        assertFalse(after.any { it.ruleId.startsWith("module.namespace") || it.ruleId == "manifest.package_attribute" })
        assertTrue(build.readText().contains("android {\n    namespace = \"com.appfix.sample\"\n    compileSdk = 36"))
        assertFalse(manifest.readText().contains("package="))
    }

    @Test
    fun `old gradle build scripts are repaired`() {
        val ws = TestFixtures.copySample()
        File(ws, "app/build.gradle.kts").delete()
        File(ws, "app/build.gradle").writeText("""
            apply plugin: 'com.android.application'
            android {
                namespace 'com.appfix.sample'
                compileSdkVersion 34
                defaultConfig { minSdkVersion 24; targetSdkVersion 36 }
            }
            repositories {
                jcenter()
            }
            dependencies {
                compile 'androidx.appcompat:appcompat:1.7.1'
                testCompile 'junit:junit:4.13.2'
            }
        """.trimIndent())
        var findings = analyze(ws).findings
        assertNotNull(findings.find { it.ruleId == "gradle.jcenter" })
        assertNotNull(findings.find { it.ruleId == "gradle.removed_configuration" })
        assertNotNull(findings.find { it.ruleId == "sdk.target_above_compile" })
        findings = fix(ws, "gradle.jcenter")
        findings = fix(ws, "gradle.removed_configuration")
        findings = fix(ws, "sdk.target_above_compile")
        assertTrue(findings.none { it.ruleId in setOf("gradle.jcenter", "gradle.removed_configuration", "sdk.target_above_compile") })
        val text = File(ws, "app/build.gradle").readText()
        assertTrue(text, text.contains("implementation 'androidx.appcompat") && text.contains("testImplementation 'junit") && text.contains("mavenCentral()") && text.contains("compileSdkVersion 36"))
    }

    @Test
    fun `gradle version incompatible with agp is fixed`() {
        val ws = TestFixtures.copySample()
        val props = File(ws, "gradle/wrapper/gradle-wrapper.properties")
        props.writeText(props.readText().replace("gradle-8.14.3-bin.zip", "gradle-8.2-bin.zip") + "distributionSha256Sum=abc\n")
        val after = fix(ws, "gradle.version_too_old")
        assertFalse(after.any { it.ruleId == "gradle.version_too_old" })
        assertTrue(props.readText().contains("gradle-8.13-bin.zip"))
        assertFalse(props.readText().contains("distributionSha256Sum"))
    }

    @Test
    fun `missing wrapper is added`() {
        val ws = TestFixtures.copySample()
        File(ws, "gradlew").delete(); File(ws, "gradlew.bat").delete(); File(ws, "gradle/wrapper").deleteRecursively()
        val after = fix(ws, "gradle.no_wrapper")
        assertFalse(after.any { it.ruleId.startsWith("gradle.no_wrapper") })
        assertTrue(File(ws, "gradle/wrapper/gradle-wrapper.properties").readText().contains("gradle-8.13-bin.zip"))
        assertEquals(4, File(ws, "gradle/wrapper/gradle-wrapper.jar").length())
    }

    @Test
    fun `missing and malformed resources are reported`() {
        val ws = TestFixtures.copySample()
        val layout = File(ws, "app/src/main/res/layout/activity_main.xml")
        layout.writeText(layout.readText().replace("@string/tap_me", "@string/tap_me_now"))
        File(ws, "app/src/main/res/values/broken.xml").writeText("<resources>\n  <string name=\"x\">oops</strin>\n</resources>")
        File(ws, "app/src/main/res/drawable/Bad-Name.xml").writeText("<shape xmlns:android=\"http://schemas.android.com/apk/res/android\"/>")
        File(ws, "app/src/main/res/values/dupes.xml").writeText("<resources><string name=\"title\">Again</string></resources>")
        val findings = analyze(ws).findings
        val missing = findings.single { it.ruleId == "resources.missing_reference" }
        assertEquals("app/src/main/res/layout/activity_main.xml", missing.file)
        assertEquals(Certainty.LIKELY, missing.certainty)
        assertEquals(2, findings.single { it.ruleId == "resources.malformed_xml" }.line)
        assertNotNull(findings.find { it.ruleId == "resources.invalid_file_name" })
        assertNotNull(findings.find { it.ruleId == "resources.duplicate" && it.title.contains("string/title") })
        File(ws, "app/src/main/res/values/broken.xml").delete()
        val after = fix(ws, "resources.missing_reference")
        assertFalse(after.any { it.ruleId == "resources.missing_reference" })
        assertTrue(File(ws, "app/src/main/res/values/strings.xml").readText().contains("<string name=\"tap_me_now\">Tap me now</string>"))
    }

    @Test
    fun `network code without INTERNET permission is fixed`() {
        val ws = TestFixtures.copySample()
        File(ws, "app/src/main/java/com/appfix/sample/Api.kt").writeText("package com.appfix.sample\nimport java.net.URL\nobject Api { fun get() = URL(\"https://example.com\").readText() }\n")
        val after = fix(ws, "manifest.internet_permission")
        assertFalse(after.any { it.ruleId == "manifest.internet_permission" })
        val manifest = File(ws, "app/src/main/AndroidManifest.xml").readText()
        assertTrue(manifest, manifest.contains("<manifest xmlns:android=\"http://schemas.android.com/apk/res/android\">\n    <uses-permission android:name=\"android.permission.INTERNET\" />\n\n    <application"))
    }

    @Test
    fun `undeclared classes and malformed manifests are found`() {
        val ws = TestFixtures.copySample()
        val manifest = File(ws, "app/src/main/AndroidManifest.xml")
        manifest.writeText(manifest.readText().replace("android:name=\".MainActivity\"", "android:name=\".HomeActivity\""))
        assertNotNull(analyze(ws).findings.find { it.ruleId == "manifest.class_missing" && it.title.contains("HomeActivity") })
        manifest.writeText(manifest.readText().replace("</application>", ""))
        val f = analyze(ws).findings.single { it.ruleId == "manifest.malformed" }
        assertEquals(Severity.ERROR, f.severity)
    }

    @Test
    fun `non android projects get an informational finding`() {
        val ws = TestFixtures.tempDir()
        File(ws, "pubspec.yaml").writeText("dependencies:\n  flutter:\n    sdk: flutter\n")
        val r = analyze(ws)
        assertEquals("project.no_android_build", r.findings.single().ruleId)
    }
}
