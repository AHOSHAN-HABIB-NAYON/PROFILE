package com.appfix.studio

import android.content.Context
import android.net.Uri
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.appfix.core.util.CancelToken
import com.appfix.core.util.OperationCancelledException
import com.appfix.core.util.ProgressListener
import com.appfix.studio.data.db.AppDatabase
import com.appfix.studio.data.db.ProjectKind
import com.appfix.studio.data.repo.ImportException
import com.appfix.studio.data.repo.ProjectRepository
import com.appfix.studio.data.repo.ProjectStorage
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ImportRepositoryTest {
    private lateinit var context: Context
    private lateinit var db: AppDatabase
    private lateinit var repo: ProjectRepository
    private lateinit var storage: ProjectStorage

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java).allowMainThreadQueries().build()
        storage = ProjectStorage(context)
        repo = ProjectRepository(context, db.projects(), storage)
    }

    @After
    fun tearDown() {
        db.close()
        storage.root.deleteRecursively()
    }

    private fun zip(name: String, entries: Map<String, String>): Uri {
        val f = File(context.cacheDir, name)
        ZipOutputStream(f.outputStream()).use { z ->
            entries.forEach { (n, content) -> z.putNextEntry(ZipEntry(n)); z.write(content.toByteArray()); z.closeEntry() }
        }
        return Uri.fromFile(f)
    }

    private val project = mapOf(
        "demo-main/settings.gradle" to "rootProject.name = 'demo'\ninclude ':app'\n",
        "demo-main/build.gradle" to "plugins { id 'com.android.application' version '8.5.0' apply false }\n",
        "demo-main/app/build.gradle" to "plugins { id 'com.android.application' }\nandroid {\n    namespace 'com.example.demo'\n    compileSdk 35\n    defaultConfig { applicationId 'com.example.demo'; minSdk 24; targetSdk 35; versionName '2.0' }\n}\n",
        "demo-main/app/src/main/AndroidManifest.xml" to "<manifest xmlns:android=\"http://schemas.android.com/apk/res/android\">\n    <application android:label=\"@string/app_name\">\n        <activity android:name=\".MainActivity\">\n            <intent-filter>\n                <action android:name=\"android.intent.action.MAIN\" />\n                <category android:name=\"android.intent.category.LAUNCHER\" />\n            </intent-filter>\n        </activity>\n    </application>\n</manifest>\n",
        "demo-main/app/src/main/res/values/strings.xml" to "<resources><string name=\"app_name\">Demo App</string></resources>",
        "demo-main/app/src/main/java/com/example/demo/MainActivity.kt" to "package com.example.demo\nclass MainActivity\n",
    )

    @Test
    fun `zip import detects project, analyses it and applies a fix`() = runBlocking {
        val outcome = repo.importZip(zip("demo.zip", project), ProgressListener.NONE, CancelToken.NONE)
        val entity = repo.get(outcome.projectId)!!
        assertEquals(ProjectKind.SOURCE, entity.kind)
        assertEquals("Demo App", entity.name)
        assertEquals("com.example.demo", entity.packageName)
        assertEquals("2.0", entity.versionName)
        val info = repo.projectInfo(outcome.projectId)!!
        assertEquals("demo-main", info.root)
        assertEquals("8.5.0", info.agpVersion)

        val report = repo.analyze(outcome.projectId, CancelToken.NONE)
        val exported = report.findings.single { it.ruleId == "manifest.exported_missing" }
        assertTrue(report.findings.any { it.ruleId == "gradle.no_wrapper" })
        val fix = repo.createFix(outcome.projectId, exported)
        repo.applyChange(outcome.projectId, fix, backupFirst = true)
        val after = repo.analyze(outcome.projectId, CancelToken.NONE)
        assertFalse(after.findings.any { it.ruleId == "manifest.exported_missing" })
        assertEquals(1, repo.history(outcome.projectId).size)

        repo.undo(outcome.projectId, fix.id)
        assertTrue(repo.analyze(outcome.projectId, CancelToken.NONE).findings.any { it.ruleId == "manifest.exported_missing" })

        val backup = repo.createBackup(outcome.projectId, "test")
        assertEquals(listOf(backup.id), repo.backups(outcome.projectId).map { it.id })

        repo.delete(outcome.projectId)
        assertFalse(storage.projectDir(outcome.projectId).exists())
    }

    @Test
    fun `path traversal archives are rejected and leave nothing behind`() = runBlocking {
        try {
            repo.importZip(zip("evil.zip", mapOf("ok/settings.gradle" to "", "../../evil.txt" to "x")), ProgressListener.NONE, CancelToken.NONE)
            fail()
        } catch (e: ImportException) {
            assertTrue(e.message!!, e.message!!.startsWith("Import blocked for safety"))
        }
        assertTrue(storage.root.listFiles().orEmpty().isEmpty())
    }

    @Test
    fun `invalid apk produces a clear error`() = runBlocking {
        val f = File(context.cacheDir, "fake.apk").apply { writeText("not an apk") }
        try {
            repo.importApk(Uri.fromFile(f), ProgressListener.NONE, CancelToken.NONE)
            fail()
        } catch (e: ImportException) {
            assertTrue(e.message!!, e.message!!.contains("Not a valid APK"))
        }
        assertTrue(storage.root.listFiles().orEmpty().isEmpty())
    }

    @Test
    fun `cancelled imports are cleaned up`() = runBlocking {
        val big = project + (1..200).associate { "demo-main/assets/f$it.txt" to "x".repeat(1000) }
        var calls = 0
        try {
            repo.importZip(zip("big.zip", big), ProgressListener.NONE, CancelToken { ++calls > 50 })
            fail()
        } catch (e: OperationCancelledException) {
            // expected
        }
        assertTrue(storage.root.listFiles().orEmpty().isEmpty())
    }

    @Test
    fun `crash logs are analysed against the project`() = runBlocking {
        val id = repo.importZip(zip("demo2.zip", project), ProgressListener.NONE, CancelToken.NONE).projectId
        val report = repo.analyzeCrash(
            id,
            "FATAL EXCEPTION: main\nProcess: com.example.demo, PID: 1\n" +
                "android.content.ActivityNotFoundException: Unable to find explicit activity class {com.example.demo/com.example.demo.AboutActivity}; have you declared this activity in your AndroidManifest.xml?\n" +
                "\tat com.example.demo.MainActivity.open(MainActivity.kt:2)\n",
        )
        assertNotNull(report.appFrameSource)
        val fix = report.findings.single { it.ruleId == "manifest.activity_not_declared" }
        assertTrue(repo.createFix(id, fix).changes.single().after!!.contains("com.example.demo.AboutActivity"))
    }
}
