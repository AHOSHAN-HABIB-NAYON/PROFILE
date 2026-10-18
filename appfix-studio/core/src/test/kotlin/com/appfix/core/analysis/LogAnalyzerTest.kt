package com.appfix.core.analysis

import com.appfix.core.TestFixtures
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class LogAnalyzerTest {
    @Test
    fun `parses a logcat crash and locates the app frame`() {
        val ws = TestFixtures.copySample()
        val log = """
            10-18 09:12:01.123  4321  4321 E AndroidRuntime: FATAL EXCEPTION: main
            10-18 09:12:01.123  4321  4321 E AndroidRuntime: Process: com.appfix.sample, PID: 4321
            10-18 09:12:01.123  4321  4321 E AndroidRuntime: java.lang.RuntimeException: Unable to start activity ComponentInfo{com.appfix.sample/com.appfix.sample.MainActivity}: java.lang.NullPointerException
            10-18 09:12:01.123  4321  4321 E AndroidRuntime: 	at android.app.ActivityThread.performLaunchActivity(ActivityThread.java:3782)
            10-18 09:12:01.123  4321  4321 E AndroidRuntime: Caused by: java.lang.NullPointerException: Attempt to invoke virtual method 'void android.widget.TextView.setText(java.lang.CharSequence)' on a null object reference
            10-18 09:12:01.123  4321  4321 E AndroidRuntime: 	at com.appfix.sample.MainActivity.onCreate(MainActivity.kt:17)
            10-18 09:12:01.123  4321  4321 E AndroidRuntime: 	at android.app.Activity.performCreate(Activity.java:8595)
            10-18 09:12:01.123  4321  4321 E AndroidRuntime: 	... 12 more
        """.trimIndent()
        val r = CrashLogAnalyzer.analyze(log, workspace = ws)
        assertEquals(2, r.chain.size)
        assertEquals("java.lang.NullPointerException", r.rootCause!!.type)
        assertEquals("com.appfix.sample", r.processName)
        assertEquals("onCreate", r.appFrame!!.method)
        assertEquals("app/src/main/java/com/appfix/sample/MainActivity.kt", r.appFrameSource!!.path)
        assertEquals(17, r.appFrameSource!!.line)
        assertTrue(r.explanation, r.explanation.contains("null"))
    }

    @Test
    fun `undeclared activity crash offers a manifest fix`() {
        val ws = TestFixtures.copySample()
        val log = """
            FATAL EXCEPTION: main
            Process: com.appfix.sample, PID: 1
            android.content.ActivityNotFoundException: Unable to find explicit activity class {com.appfix.sample/com.appfix.sample.SettingsActivity}; have you declared this activity in your AndroidManifest.xml, or does your intent not match its declared <intent-filter>?
            	at android.app.Instrumentation.checkStartActivityResult(Instrumentation.java:2197)
            	at com.appfix.sample.MainActivity.openSettings(MainActivity.kt:30)
        """.trimIndent()
        val manifest = "app/src/main/AndroidManifest.xml"
        val r = CrashLogAnalyzer.analyze(log, workspace = ws, manifestPath = manifest, declaredActivities = setOf("com.appfix.sample.MainActivity"))
        val fix = r.findings.single { it.ruleId == "manifest.activity_not_declared" }
        val change = RepairEngine(ws).createFix(fix)
        assertTrue(change.changes.single().after!!.contains("android:name=\"com.appfix.sample.SettingsActivity\""))
    }

    @Test
    fun `security exception suggests a permission and anr and native crashes are recognised`() {
        val ws = TestFixtures.copySample()
        val sec = "java.lang.SecurityException: Permission Denial: requires android.permission.CAMERA\n\tat com.appfix.sample.MainActivity.scan(MainActivity.kt:40)"
        val r = CrashLogAnalyzer.analyze(sec, appPackages = listOf("com.appfix.sample"), workspace = ws, manifestPath = "app/src/main/AndroidManifest.xml")
        assertNotNull(r.findings.find { it.ruleId == "crash.missing_permission" && it.fixData["permission"] == "android.permission.CAMERA" })
        assertEquals("ANR", CrashLogAnalyzer.analyze("ANR in com.appfix.sample (com.appfix.sample/.MainActivity)\nReason: Input dispatching timed out").kind)
        assertEquals("NATIVE", CrashLogAnalyzer.analyze("F libc    : Fatal signal 11 (SIGSEGV), code 1 (SEGV_MAPERR)").kind)
        assertEquals("UNKNOWN", CrashLogAnalyzer.analyze("hello world").kind)
    }

    @Test
    fun `build log errors are mapped to workspace files`() {
        val ws = TestFixtures.copySample()
        val log = """
            > Task :app:compileDebugKotlin FAILED
            e: file:///home/runner/work/proj/app/src/main/java/com/appfix/sample/MainActivity.kt:14:9 Unresolved reference 'foo'.
            /home/runner/work/proj/app/src/main/res/layout/activity_main.xml:12: AAPT: error: resource string/missing (aka com.appfix.sample:string/missing) not found.
            FAILURE: Build failed with an exception.
            * What went wrong:
            Execution failed for task ':app:compileDebugKotlin'.
            BUILD FAILED in 12s
        """.trimIndent()
        val r = BuildLogAnalyzer.analyze(log, ws)
        assertEquals(BuildOutcome.FAILURE, r.outcome)
        assertEquals(":app:compileDebugKotlin", r.failedTask)
        val k = r.findings.single { it.ruleId == "build.kotlin_error" }
        assertEquals("app/src/main/java/com/appfix/sample/MainActivity.kt", k.file)
        assertEquals(14, k.line)
        assertEquals("app/src/main/res/layout/activity_main.xml", r.findings.single { it.ruleId == "build.aapt_error" }.file)
    }

    @Test
    fun `gradle and sdk requirement messages produce fixes`() {
        val ws = TestFixtures.copySample()
        val log = "Minimum supported Gradle version is 8.13. Current version is 8.9.\n" +
            "Dependency 'androidx.core:core:1.17.0' requires libraries and applications that\n      depend on it to compile against version 37 or later of the\n      Android APIs.\nBUILD FAILED"
        val r = BuildLogAnalyzer.analyze(log, ws)
        val g = r.findings.single { it.ruleId == "gradle.version_too_old" }
        assertEquals("gradle/wrapper/gradle-wrapper.properties", g.fixData["path"])
        val sdk = r.findings.single { it.ruleId == "build.compile_sdk_too_low" }
        assertEquals("37", sdk.fixData["compileSdk"])
        val change = RepairEngine(ws).createFix(sdk)
        assertTrue(change.changes.single().after!!.contains("compileSdk = 37"))
        assertEquals(BuildOutcome.SUCCESS, BuildLogAnalyzer.analyze("BUILD SUCCESSFUL in 3s").outcome)
        assertEquals("build.failed", BuildLogAnalyzer.analyze("FAILURE: Build failed with an exception.\n* What went wrong:\nSomething odd").findings.single().ruleId)
        assertTrue(File(ws, "gradle/wrapper/gradle-wrapper.properties").isFile)
    }
}
