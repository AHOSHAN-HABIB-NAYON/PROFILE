package com.appfix.core.build

import com.appfix.core.TestFixtures
import com.appfix.core.project.ProjectDetector
import com.appfix.core.util.CancelToken
import com.appfix.core.util.ProgressListener
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.File
import java.net.InetSocketAddress
import java.util.concurrent.atomic.AtomicInteger

class CloudBuildTest {
    @Test
    fun `upload plan skips build output and signing material`() {
        val ws = TestFixtures.copySample()
        File(ws, "app/build/outputs/x.apk").apply { parentFile.mkdirs(); writeText("x") }
        File(ws, "release.jks").writeText("secret")
        File(ws, "keystore.properties").writeText("storePassword=x")
        File(ws, "local.properties").writeText("sdk.dir=/x")
        val plan = BuildPlanner.uploadPlan(ws)
        val paths = plan.files.map { it.path }
        assertTrue("settings.gradle.kts" in paths && "app/src/main/AndroidManifest.xml" in paths)
        assertFalse(paths.any { it.contains("/build/") || it.endsWith(".jks") || it.endsWith("keystore.properties") || it == "local.properties" })
        assertTrue(plan.files.first { it.path == "gradlew" }.executable)
        assertEquals(3, plan.excluded.count { it.contains("never uploaded") })
        assertTrue(plan.warnings.single().contains("signed on this device"))
    }

    @Test
    fun `workflow matches the project type`() {
        val info = ProjectDetector.detect(TestFixtures.copySample())
        val wf = BuildPlanner.workflow(info, BuildVariant.RELEASE_AAB)
        assertTrue(wf, wf.contains("branches: [\"appfix-build/**\"]") && wf.contains("./gradlew bundleRelease") && wf.contains("java-version: \"17\"") && wf.contains("name: appfix-output"))
        assertTrue(wf.contains("group: \${{ github.ref }}"))
        val flutter = TestFixtures.tempDir().also { File(it, "pubspec.yaml").writeText("dependencies:\n  flutter:\n    sdk: flutter\n") }
        val fw = BuildPlanner.workflow(ProjectDetector.detect(flutter), BuildVariant.DEBUG_APK)
        assertTrue(fw.contains("subosito/flutter-action@v2") && fw.contains("flutter build apk --debug"))
        val unity = TestFixtures.tempDir().also { File(it, "Assets").mkdirs(); File(it, "ProjectSettings").mkdirs() }
        try { BuildPlanner.workflow(ProjectDetector.detect(unity), BuildVariant.DEBUG_APK); fail() } catch (e: BuildPlanException) {}
        assertEquals("11", BuildPlanner.jdkFor(info.copy(agpVersion = "7.4.2")))
    }

    // ------------------------------------------------------------------ fake GitHub

    private val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
    private val base get() = "http://127.0.0.1:${server.address.port}"
    private val blobs = AtomicInteger()
    private var treeBody = ""
    private var storageAuthHeader: String? = "unset"
    private var refPatched = false
    private var cancelled = false

    private fun HttpExchange.reply(code: Int, body: String = "", headers: Map<String, String> = emptyMap()) {
        headers.forEach { (k, v) -> responseHeaders.add(k, v) }
        val bytes = body.toByteArray()
        sendResponseHeaders(code, if (bytes.isEmpty()) -1 else bytes.size.toLong())
        if (bytes.isNotEmpty()) responseBody.use { it.write(bytes) } else close()
    }

    private fun startServer(runStatus: () -> Pair<String, String?>) {
        server.createContext("/") { ex ->
            val path = ex.requestURI.path
            val method = ex.requestMethod
            val body = ex.requestBody.readBytes().decodeToString()
            if (!path.startsWith("/storage/") && ex.requestHeaders.getFirst("Authorization") != "Bearer test-token") { ex.reply(401, "{\"message\":\"Bad credentials\"}"); return@createContext }
            when {
                path == "/user" -> ex.reply(200, "{\"login\":\"octo\"}")
                path.endsWith("/git/blobs") -> ex.reply(201, "{\"sha\":\"blob${blobs.incrementAndGet()}\"}")
                path.endsWith("/git/trees") -> { treeBody = body; ex.reply(201, "{\"sha\":\"tree1\"}") }
                path.endsWith("/git/commits") -> { assertTrue(body.contains("\"parents\":[]")); ex.reply(201, "{\"sha\":\"commit1\"}") }
                method == "POST" && path.endsWith("/git/refs") -> { refPatched = body.contains("refs/heads/appfix-build/"); ex.reply(201, "{\"ref\":\"x\",\"object\":{\"sha\":\"commit1\"}}") }
                path.endsWith("/actions/runs") -> ex.reply(200, "{\"workflow_runs\":[{\"id\":77,\"status\":\"queued\",\"head_sha\":\"commit1\",\"html_url\":\"https://github.com/octo/builds/actions/runs/77\"}]}")
                path.endsWith("/actions/runs/77") -> { val (s, c) = runStatus(); ex.reply(200, "{\"id\":77,\"status\":\"$s\",\"conclusion\":${c?.let { "\"$it\"" } ?: "null"},\"head_sha\":\"commit1\"}") }
                path.endsWith("/actions/runs/77/jobs") -> ex.reply(200, "{\"jobs\":[{\"id\":5,\"name\":\"build\",\"status\":\"completed\",\"conclusion\":\"success\",\"steps\":[{\"name\":\"Build with Gradle\",\"status\":\"completed\",\"conclusion\":\"success\",\"number\":4}]}]}")
                path.endsWith("/actions/jobs/5/logs") -> ex.reply(302, headers = mapOf("Location" to "$base/storage/log.txt"))
                path.endsWith("/actions/runs/77/artifacts") -> ex.reply(200, "{\"artifacts\":[{\"id\":9,\"name\":\"appfix-output\",\"size_in_bytes\":4,\"expired\":false}]}")
                path.endsWith("/actions/artifacts/9/zip") -> ex.reply(302, headers = mapOf("Location" to "$base/storage/artifact.zip"))
                path.endsWith("/cancel") -> { cancelled = true; ex.reply(202, "{}") }
                path == "/storage/log.txt" -> { storageAuthHeader = ex.requestHeaders.getFirst("Authorization"); ex.reply(200, "BUILD SUCCESSFUL in 42s") }
                path == "/storage/artifact.zip" -> { storageAuthHeader = ex.requestHeaders.getFirst("Authorization"); ex.reply(200, "PK..") }
                else -> ex.reply(404, "{\"message\":\"Not Found\"}")
            }
        }
        server.start()
    }

    @After
    fun stop() = server.stop(0)

    @Test
    fun `full cloud build flow against a fake GitHub`() {
        var status = "in_progress" to null as String?
        startServer { status }
        val client = GitHubClient("test-token", base)
        assertEquals("octo", client.user().login)
        val ws = TestFixtures.copySample()
        val info = ProjectDetector.detect(ws)
        val build = CloudBuild(client, "octo", "builds")
        var progressCalls = 0
        val (sha, count) = build.upload(ws, info, BuildVariant.DEBUG_APK, "abc123def456xyz", { _, _, _ -> progressCalls++ }, CancelToken.NONE)
        assertEquals("commit1", sha)
        assertEquals(count + 1, blobs.get())
        assertTrue(refPatched)
        assertTrue(treeBody.contains("\"path\":\".github/workflows/appfix-build.yml\"") && treeBody.contains("\"mode\":\"100755\""))
        assertTrue(progressCalls >= count)

        var record = BuildRecord("abc123def456xyz", "p", BuildVariant.DEBUG_APK, "octo/builds", CloudBuild.branchFor("abc123def456xyz"), sha, state = BuildState.UPLOADING, startedAt = 0)
        assertEquals("appfix-build/abc123def456", record.branch)
        record = build.poll(record)
        assertEquals(77L, record.runId)
        assertEquals(BuildState.QUEUED, record.state)
        record = build.poll(record)
        assertEquals(BuildState.RUNNING, record.state)
        assertEquals("Build with Gradle", record.steps.single().name)
        status = "completed" to "success"
        record = build.poll(record)
        assertEquals(BuildState.DOWNLOADING, record.state)
        assertTrue(build.logs(record).contains("BUILD SUCCESSFUL"))
        val zip = File(TestFixtures.tempDir(), "out.zip")
        assertTrue(build.downloadArtifact(record, zip, CancelToken.NONE))
        assertEquals("PK..", zip.readText())
        assertNull("the token must not be sent to the storage host", storageAuthHeader)
        build.cancel(record)
        assertTrue(cancelled)
    }

    @Test
    fun `api errors are explained`() {
        startServer { "queued" to null }
        try { GitHubClient("wrong", base).user(); fail() } catch (e: GitHubApiException) {
            assertEquals(401, e.status)
            assertTrue(e.message!!.contains("invalid or expired") && e.message!!.contains("Bad credentials"))
        }
        try { GitHubClient("test-token", base).repo("a", "b"); fail() } catch (e: GitHubApiException) { assertEquals(404, e.status) }
    }

}
