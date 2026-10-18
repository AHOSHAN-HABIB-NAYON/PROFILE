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
    private fun missFile(host: String) = File(dir, key(host).replace(Regex("[^a-z0-9.-]"), "_") + ".tried")

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

    /** Downloads the best icon from the site itself when nothing is cached (home shortcuts). */
    suspend fun fetch(host: String): Bitmap? {
        load(host)?.takeIf { it.width >= HIRES }?.let { return it }
        return upgrade(host) ?: load(host)
    }

    /**
     * Finds the site's highest-resolution icon — the ones it declares for home screens
     * (apple-touch-icon, web-app manifest, sized icons) — so icons stay sharp. Tried at most
     * once a week per site.
     */
    suspend fun upgrade(host: String): Bitmap? {
        if ((cached(host)?.width ?: 0) >= HIRES) return cached(host)
        val marker = missFile(host)
        if (marker.exists() && System.currentTimeMillis() - marker.lastModified() < WEEK_MS) return null
        withContext(Dispatchers.IO) { runCatching { marker.writeText("") } }
        val bitmap = withContext(Dispatchers.IO) { bestIcon(host) }
        if (bitmap != null) save(host, bitmap)
        return bitmap
    }

    private fun bestIcon(host: String): Bitmap? {
        val base = "https://$host/"
        val candidates = mutableListOf<Pair<String, Int>>()   // url to declared size
        val html = text(base, 256 * 1024)
        if (html != null) {
            Regex("""<link\b[^>]*>""", RegexOption.IGNORE_CASE).findAll(html).forEach { m ->
                val tag = m.value
                val rel = attr(tag, "rel")?.lowercase() ?: return@forEach
                val href = attr(tag, "href") ?: return@forEach
                when {
                    "manifest" in rel -> manifestIcons(resolve(base, href)).forEach { candidates += it }
                    "apple-touch-icon" in rel -> candidates += resolve(base, href) to (sizeOf(attr(tag, "sizes")) ?: 180)
                    "icon" in rel -> candidates += resolve(base, href) to (sizeOf(attr(tag, "sizes")) ?: 32)
                }
            }
        }
        candidates += "${base}apple-touch-icon.png" to 180
        candidates += "${base}favicon.ico" to 32
        // Prefer the smallest icon that is at least 128 px; otherwise the largest available.
        val ordered = candidates.distinctBy { it.first }.filter { !it.first.endsWith(".svg") }
            .sortedWith(compareBy<Pair<String, Int>> { if (it.second >= 128) 0 else 1 }.thenBy { if (it.second >= 128) it.second else -it.second })
        for ((url, _) in ordered.take(6)) {
            val bmp = download(url) ?: continue
            if (bmp.width >= 48 || url.endsWith("favicon.ico")) return bmp
        }
        return null
    }

    private fun manifestIcons(url: String): List<Pair<String, Int>> = runCatching {
        val json = org.json.JSONObject(text(url, 128 * 1024) ?: return emptyList())
        val icons = json.optJSONArray("icons") ?: return emptyList()
        (0 until icons.length()).mapNotNull { i ->
            val o = icons.getJSONObject(i)
            val src = o.optString("src").takeIf { it.isNotBlank() } ?: return@mapNotNull null
            if (o.optString("purpose").contains("monochrome")) return@mapNotNull null
            resolve(url, src) to (sizeOf(o.optString("sizes")) ?: 192)
        }
    }.getOrDefault(emptyList())

    private fun attr(tag: String, name: String): String? =
        Regex("""\b$name\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))""", RegexOption.IGNORE_CASE).find(tag)?.let { m ->
            m.groupValues.drop(2).firstOrNull { it.isNotEmpty() }
        }?.replace("&amp;", "&")

    private fun sizeOf(sizes: String?): Int? =
        sizes?.split(' ')?.mapNotNull { it.lowercase().substringBefore('x').toIntOrNull() }?.maxOrNull()

    private fun resolve(base: String, href: String): String = runCatching { java.net.URL(java.net.URL(base), href).toString() }.getOrDefault(href)

    private fun text(url: String, max: Int): String? = runCatching {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 5_000
        c.readTimeout = 5_000
        c.instanceFollowRedirects = true
        c.setRequestProperty("User-Agent", MOBILE_UA)
        try {
            if (c.responseCode != 200) return@runCatching null
            val out = ByteArrayOutputStream()
            c.inputStream.use { input ->
                val buf = ByteArray(8 * 1024)
                while (out.size() < max) {
                    val n = input.read(buf)
                    if (n < 0) break
                    out.write(buf, 0, n)
                }
            }
            out.toString("UTF-8")
        } finally {
            c.disconnect()
        }
    }.getOrNull()

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
        c.setRequestProperty("User-Agent", MOBILE_UA)
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
        const val ICON_SIZE = 192
        /** Icons at least this wide look sharp on home-page tiles. */
        const val HIRES = 96
        private const val MOBILE_UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36"
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
