package com.webtecit.nayon.data.browser

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.produceState
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.core.graphics.scale
import com.webtecit.nayon.core.browser.UrlResolver
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Site icons, cached per host in memory and in app-private storage.
 *
 * Icons come from pages visited in normal tabs ([save]) — no extra requests. For home-page
 * shortcuts that were never visited, [fetch] downloads the icon once from that site itself
 * (no third-party icon service is used). Failed lookups are remembered for a week.
 */
class FaviconStore(private val dir: File) {
    private val memory = LruCache<String, Bitmap>(96)
    private val _version = MutableStateFlow(0)
    /** Increments whenever an icon is added, so lists can refresh. */
    val version: StateFlow<Int> = _version.asStateFlow()

    init { dir.mkdirs() }

    private fun key(host: String) = host.lowercase().removePrefix("www.").removePrefix("m.")
    private fun file(host: String) = File(dir, key(host).replace(Regex("[^a-z0-9.-]"), "_") + ".png")
    private fun missFile(host: String) = File(dir, key(host).replace(Regex("[^a-z0-9.-]"), "_") + ".none")

    fun cached(host: String): Bitmap? = memory.get(key(host))

    suspend fun load(host: String): Bitmap? {
        cached(host)?.let { return it }
        return withContext(Dispatchers.IO) {
            val f = file(host)
            if (!f.exists()) return@withContext null
            BitmapFactory.decodeFile(f.path)?.also { memory.put(key(host), it) }
        }
    }

    suspend fun save(host: String, icon: Bitmap) {
        if (host.isBlank() || icon.width < 8) return
        val existing = cached(host)
        if (existing != null && existing.width >= icon.width) return
        val small = if (icon.width > ICON_SIZE) icon.scale(ICON_SIZE, (icon.height * ICON_SIZE / icon.width).coerceAtLeast(1)) else icon
        memory.put(key(host), small)
        withContext(Dispatchers.IO) {
            runCatching {
                file(host).outputStream().use { small.compress(Bitmap.CompressFormat.PNG, 100, it) }
                missFile(host).delete()
            }
        }
        _version.value++
    }

    /** Downloads the icon from the site itself (shortcuts only). */
    suspend fun fetch(host: String): Bitmap? {
        load(host)?.let { return it }
        val miss = missFile(host)
        if (miss.exists() && System.currentTimeMillis() - miss.lastModified() < WEEK_MS) return null
        val bitmap = withContext(Dispatchers.IO) {
            listOf("/apple-touch-icon.png", "/favicon.ico").firstNotNullOfOrNull { path -> download("https://$host$path") }
        }
        if (bitmap != null) save(host, bitmap) else withContext(Dispatchers.IO) { runCatching { miss.writeText("") } }
        return bitmap
    }

    /** Deletes all cached icons (used by "Clear browsing data"). */
    suspend fun clear() {
        memory.evictAll()
        withContext(Dispatchers.IO) { dir.listFiles()?.forEach { it.delete() } }
        _version.value++
    }

    private fun download(url: String): Bitmap? = runCatching {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 5_000
        c.readTimeout = 5_000
        c.instanceFollowRedirects = true
        c.setRequestProperty("Accept", "image/*")
        try {
            if (c.responseCode != 200) return@runCatching null
            val out = ByteArrayOutputStream()
            c.inputStream.use { input ->
                val buf = ByteArray(8 * 1024)
                while (true) {
                    val n = input.read(buf)
                    if (n < 0) break
                    out.write(buf, 0, n)
                    if (out.size() > MAX_BYTES) return@runCatching null
                }
            }
            val bytes = out.toByteArray()
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.takeIf { it.width >= 16 }
        } finally {
            c.disconnect()
        }
    }.getOrNull()

    companion object {
        const val ICON_SIZE = 96
        private const val MAX_BYTES = 300 * 1024
        private const val WEEK_MS = 7L * 24 * 60 * 60 * 1000
    }
}

val LocalFaviconStore = staticCompositionLocalOf<FaviconStore?> { null }

/** The cached icon for [url]'s site. With [download] it fetches a missing icon from the site. */
@Composable
fun rememberFavicon(url: String?, download: Boolean = false): State<Bitmap?> {
    val store = LocalFaviconStore.current
    val host = UrlResolver.displayHost(url)
    return produceState(initialValue = store?.cached(host), store, host) {
        if (store == null || host.isBlank()) return@produceState
        value = store.load(host) ?: if (download) store.fetch(host) else null
        if (value == null) {
            store.version.collect { value = store.load(host) ?: value }
        }
    }
}
