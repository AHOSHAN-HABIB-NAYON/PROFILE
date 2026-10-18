package com.appfix.core.build

import com.appfix.core.util.B64
import com.appfix.core.util.CancelToken
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

class GitHubApiException(val status: Int, message: String) : IOException(message)

@Serializable data class GhUser(val login: String)
@Serializable data class GhRepo(val name: String, @SerialName("full_name") val fullName: String, @SerialName("default_branch") val defaultBranch: String = "main", val private: Boolean = false, val permissions: GhPermissions? = null)
@Serializable data class GhPermissions(val push: Boolean = false, val admin: Boolean = false)
@Serializable data class GhSha(val sha: String)
@Serializable data class GhRefObject(val sha: String)
@Serializable data class GhRef(val ref: String, @SerialName("object") val obj: GhRefObject)
@Serializable data class GhRun(val id: Long, val status: String, val conclusion: String? = null, @SerialName("head_sha") val headSha: String = "", @SerialName("html_url") val htmlUrl: String = "")
@Serializable data class GhRuns(@SerialName("workflow_runs") val runs: List<GhRun> = emptyList())
@Serializable data class GhStep(val name: String, val status: String, val conclusion: String? = null, val number: Int = 0)
@Serializable data class GhJob(val id: Long, val name: String, val status: String, val conclusion: String? = null, val steps: List<GhStep> = emptyList())
@Serializable data class GhJobs(val jobs: List<GhJob> = emptyList())
@Serializable data class GhArtifact(val id: Long, val name: String, @SerialName("size_in_bytes") val size: Long = 0, val expired: Boolean = false)
@Serializable data class GhArtifacts(val artifacts: List<GhArtifact> = emptyList())

/**
 * Minimal GitHub REST client for cloud builds. The token is sent only to [apiBase]; download
 * redirects to storage hosts are followed without credentials.
 */
class GitHubClient(private val token: String, private val apiBase: String = "https://api.github.com") {
    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

    private fun open(method: String, path: String, body: String? = null, accept: String = "application/vnd.github+json"): HttpURLConnection {
        val conn = (URL(if (path.startsWith("http")) path else apiBase + path).openConnection() as HttpURLConnection)
        conn.requestMethod = method
        conn.instanceFollowRedirects = false
        conn.connectTimeout = 20_000
        conn.readTimeout = 60_000
        conn.setRequestProperty("Accept", accept)
        conn.setRequestProperty("Authorization", "Bearer $token")
        conn.setRequestProperty("X-GitHub-Api-Version", "2022-11-28")
        conn.setRequestProperty("User-Agent", "AppFixStudio")
        if (body != null) {
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.outputStream.use { it.write(body.toByteArray()) }
        }
        return conn
    }

    private fun call(method: String, path: String, body: String? = null, okCodes: Set<Int> = setOf(200, 201)): String {
        val conn = open(method, path, body)
        try {
            val code = conn.responseCode
            val text = (if (code < 400) conn.inputStream else conn.errorStream)?.use { it.readBytes().decodeToString() }.orEmpty()
            if (code !in okCodes) throw GitHubApiException(code, describe(code, text, path))
            return text
        } finally {
            conn.disconnect()
        }
    }

    private fun describe(code: Int, body: String, path: String): String {
        val msg = Regex("\"message\"\\s*:\\s*\"([^\"]*)\"").find(body)?.groupValues?.get(1)
        val hint = when (code) {
            401 -> "The token is invalid or expired."
            403 -> "The token lacks permission (it needs Contents: read & write and Actions: read & write on the build repository), or the rate limit was reached."
            404 -> "Not found. Check the repository name and that the token can access it."
            409 -> "The repository is empty or in a conflicting state."
            422 -> "GitHub rejected the request."
            else -> "GitHub returned HTTP $code."
        }
        return "$hint${msg?.let { " ($it)" } ?: ""}"
    }

    fun user(): GhUser = json.decodeFromString(call("GET", "/user"))

    fun repo(owner: String, name: String): GhRepo = json.decodeFromString(call("GET", "/repos/$owner/$name"))

    /** Creates a private repository for builds, initialised with a README so refs exist. */
    fun createPrivateRepo(name: String): GhRepo = json.decodeFromString(call("POST", "/user/repos", buildJsonObject {
        put("name", name); put("private", true); put("auto_init", true)
        put("description", "Cloud builds for AppFix Studio")
    }.toString()))

    fun createBlob(owner: String, repo: String, bytes: ByteArray): String =
        json.decodeFromString<GhSha>(call("POST", "/repos/$owner/$repo/git/blobs", buildJsonObject {
            put("content", B64.encode(bytes)); put("encoding", "base64")
        }.toString())).sha

    fun createTree(owner: String, repo: String, entries: List<Triple<String, String, Boolean>>): String =
        json.decodeFromString<GhSha>(call("POST", "/repos/$owner/$repo/git/trees", buildJsonObject {
            putJsonArray("tree") {
                for ((path, sha, exec) in entries) add(buildJsonObject {
                    put("path", path); put("mode", if (exec) "100755" else "100644"); put("type", "blob"); put("sha", sha)
                })
            }
        }.toString())).sha

    fun createCommit(owner: String, repo: String, message: String, tree: String): String =
        json.decodeFromString<GhSha>(call("POST", "/repos/$owner/$repo/git/commits", buildJsonObject {
            put("message", message); put("tree", tree); put("parents", buildJsonArray { })
        }.toString())).sha

    /**
     * Points refs/heads/[branch] at [sha]. Build branches are unique per build, so the ref is
     * normally created; an existing one is deleted and recreated (HttpURLConnection has no PATCH).
     */
    fun setBranch(owner: String, repo: String, branch: String, sha: String) {
        val body = buildJsonObject { put("ref", "refs/heads/$branch"); put("sha", sha) }.toString()
        try {
            call("POST", "/repos/$owner/$repo/git/refs", body)
        } catch (e: GitHubApiException) {
            if (e.status != 422) throw e
            deleteBranch(owner, repo, branch)
            call("POST", "/repos/$owner/$repo/git/refs", body)
        }
    }

    fun deleteBranch(owner: String, repo: String, branch: String) {
        call("DELETE", "/repos/$owner/$repo/git/refs/heads/$branch", okCodes = setOf(204, 404, 422))
    }

    fun findRun(owner: String, repo: String, branch: String, sha: String): GhRun? =
        json.decodeFromString<GhRuns>(call("GET", "/repos/$owner/$repo/actions/runs?branch=${branch.replace("/", "%2F")}&head_sha=$sha&per_page=5")).runs.firstOrNull { it.headSha == sha }

    fun run(owner: String, repo: String, id: Long): GhRun = json.decodeFromString(call("GET", "/repos/$owner/$repo/actions/runs/$id"))

    fun jobs(owner: String, repo: String, runId: Long): List<GhJob> = json.decodeFromString<GhJobs>(call("GET", "/repos/$owner/$repo/actions/runs/$runId/jobs")).jobs

    fun cancel(owner: String, repo: String, runId: Long) {
        call("POST", "/repos/$owner/$repo/actions/runs/$runId/cancel", okCodes = setOf(202, 409))
    }

    fun artifacts(owner: String, repo: String, runId: Long): List<GhArtifact> = json.decodeFromString<GhArtifacts>(call("GET", "/repos/$owner/$repo/actions/runs/$runId/artifacts")).artifacts

    /** Job log as text (only available once the job has finished). */
    fun jobLog(owner: String, repo: String, jobId: Long, maxBytes: Int = 4 * 1024 * 1024): String =
        download("/repos/$owner/$repo/actions/jobs/$jobId/logs") { input ->
            val bytes = input.readNBytesCompat(maxBytes)
            bytes.decodeToString()
        }

    fun downloadArtifact(owner: String, repo: String, artifactId: Long, target: File, cancel: CancelToken = CancelToken.NONE) {
        download("/repos/$owner/$repo/actions/artifacts/$artifactId/zip") { input ->
            target.parentFile?.mkdirs()
            target.outputStream().use { out ->
                val buf = ByteArray(64 * 1024)
                while (true) {
                    cancel.throwIfCancelled()
                    val n = input.read(buf)
                    if (n < 0) break
                    out.write(buf, 0, n)
                }
            }
        }
    }

    /** Follows one redirect to a pre-signed storage URL without sending the token there. */
    private fun <T> download(path: String, read: (InputStream) -> T): T {
        val conn = open("GET", path, accept = "application/vnd.github+json")
        try {
            val code = conn.responseCode
            if (code == 302 || code == 301 || code == 307) {
                val location = conn.getHeaderField("Location") ?: throw GitHubApiException(code, "Redirect without a location")
                val storage = URL(location).openConnection() as HttpURLConnection
                storage.connectTimeout = 20_000
                storage.readTimeout = 120_000
                try {
                    if (storage.responseCode != 200) throw GitHubApiException(storage.responseCode, "Download failed (HTTP ${storage.responseCode})")
                    return storage.inputStream.use(read)
                } finally {
                    storage.disconnect()
                }
            }
            if (code == 200) return conn.inputStream.use(read)
            val text = conn.errorStream?.use { it.readBytes().decodeToString() }.orEmpty()
            throw GitHubApiException(code, describe(code, text, path))
        } finally {
            conn.disconnect()
        }
    }
}

internal fun InputStream.readNBytesCompat(limit: Int): ByteArray {
    val out = java.io.ByteArrayOutputStream()
    val buf = ByteArray(32 * 1024)
    while (out.size() < limit) {
        val n = read(buf, 0, minOf(buf.size, limit - out.size()))
        if (n < 0) break
        out.write(buf, 0, n)
    }
    return out.toByteArray()
}
