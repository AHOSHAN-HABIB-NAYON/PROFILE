package com.appfix.core.ai

import com.sun.net.httpserver.HttpServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.net.InetSocketAddress

class AiAssistantTest {
    @get:Rule val tmp = TemporaryFolder()
    private var server: HttpServer? = null
    private val received = mutableListOf<Pair<Map<String, String>, String>>()

    @After fun stop() { server?.stop(0) }

    private fun serve(path: String, status: Int, body: String): String {
        val s = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        s.createContext(path) { ex ->
            val headers = ex.requestHeaders.entries.associate { it.key.lowercase() to it.value.joinToString() }
            received += headers to ex.requestBody.readBytes().decodeToString()
            val bytes = body.toByteArray()
            ex.sendResponseHeaders(status, bytes.size.toLong())
            ex.responseBody.use { it.write(bytes) }
        }
        s.start()
        server = s
        return "http://127.0.0.1:${s.address.port}"
    }

    @Test fun `anthropic request shape`() {
        val base = serve("/v1/messages", 200, """{"content":[{"type":"text","text":"Hello "},{"type":"text","text":"there"}]}""")
        val text = AiClient(AiConfig(AiProviderKind.ANTHROPIC, base, "model-x"), "key-123456").complete("sys", listOf(AiMessage("user", "hi")))
        assertEquals("Hello there", text)
        val (h, b) = received.single()
        assertEquals("key-123456", h["x-api-key"])
        assertTrue(b.contains("\"system\":\"sys\"") && b.contains("\"model\":\"model-x\""))
    }

    @Test fun `openai compatible request shape`() {
        val base = serve("/v1/chat/completions", 200, """{"choices":[{"message":{"role":"assistant","content":"ok"}}]}""")
        val text = AiClient(AiConfig(AiProviderKind.OPENAI_COMPATIBLE, "$base/v1", "m"), "key-abcdef").complete("sys", listOf(AiMessage("user", "hi")))
        assertEquals("ok", text)
        assertEquals("Bearer key-abcdef", received.single().first["authorization"])
        assertTrue(received.single().second.contains("\"role\":\"system\""))
    }

    @Test fun `proxy without a key`() {
        val base = serve("/ai", 200, """{"text":"from proxy"}""")
        assertEquals("from proxy", AiClient(AiConfig(AiProviderKind.PROXY, "$base/ai"), null).complete("s", listOf(AiMessage("user", "q"))))
        assertFalse(received.single().first.containsKey("authorization"))
    }

    @Test fun `errors never echo the key`() {
        val base = serve("/v1/messages", 401, """{"error":{"message":"invalid x-api-key secret-key-999"}}""")
        try {
            AiClient(AiConfig(AiProviderKind.ANTHROPIC, base, "m"), "secret-key-999").complete("s", listOf(AiMessage("user", "q")))
            fail()
        } catch (e: AiException) {
            assertEquals(401, e.status)
            assertFalse(e.message!!.contains("secret-key-999"))
        }
    }

    @Test fun `config validation`() {
        assertNotNull(AiConfig(AiProviderKind.PROXY, "http://example.com/ai").problem(false)) // plain http to a remote host
        assertEquals(null, AiConfig(AiProviderKind.PROXY, "https://example.com/ai").problem(false))
        assertNotNull(AiConfig(AiProviderKind.ANTHROPIC, model = "m").problem(false)) // missing key
        assertNotNull(AiConfig(AiProviderKind.ANTHROPIC).problem(true)) // missing model
        assertEquals(null, AiConfig(AiProviderKind.ANTHROPIC, model = "m").problem(true))
    }

    @Test fun `context skips secrets and redacts credentials`() {
        val root = tmp.newFolder("p")
        File(root, "app").mkdirs()
        File(root, "app/build.gradle").writeText("android {\n  signingConfigs { release { storePassword \"hunter2\"\n keyPassword = 'x' } }\n}\nval k = \"ghp_abcdefghijklmnopqrstuvwxyz0123\"\n")
        File(root, "release.jks").writeBytes(byteArrayOf(1, 2, 3))
        File(root, "local.properties").writeText("sdk.dir=/x\n")
        val p = AiContextBuilder.build(root, null, AiRequest("why?", listOf("app/build.gradle", "release.jks", "local.properties", "../etc/passwd", "missing.kt"), log = "token: abc\nerror here"))
        assertEquals(listOf("app/build.gradle"), p.shared.map { it.path })
        assertEquals(4, p.skipped.size)
        assertFalse(p.user.contains("hunter2"))
        assertFalse(p.user.contains("ghp_abcdefghijklmnopqrstuvwxyz0123"))
        assertFalse(p.user.contains("abc\n"))
        assertTrue(p.user.contains("error here"))
        assertEquals(3, p.shared.single().redactions)
        assertTrue(p.system.contains("unified diff"))
    }
}
