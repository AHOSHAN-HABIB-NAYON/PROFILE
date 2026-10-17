package com.filepilot.app.data.thumbs

import android.content.ContentResolver
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Point
import android.media.MediaMetadataRetriever
import android.media.ThumbnailUtils
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import android.util.Size
import coil3.ImageLoader
import coil3.asImage
import coil3.decode.DataSource
import coil3.fetch.FetchResult
import coil3.fetch.Fetcher
import coil3.fetch.ImageFetchResult
import coil3.key.Keyer
import coil3.request.Options
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * A small preview for a list or grid cell. Loading these through the system thumbnail APIs
 * (which read the camera's embedded preview or Android's thumbnail cache) is far faster than
 * decoding a full 12–50 MP photo for a 42 dp icon.
 */
data class Thumb(val uri: Uri, val path: String?, val isVideo: Boolean, val sizePx: Int, val modified: Long)

class ThumbKeyer : Keyer<Thumb> {
    override fun key(data: Thumb, options: Options): String =
        "thumb:${data.path ?: data.uri}:${data.sizePx}:${data.modified}"
}

class ThumbFetcher(private val context: Context, private val data: Thumb) : Fetcher {

    override suspend fun fetch(): FetchResult? = withContext(Dispatchers.IO) {
        val bitmap = load() ?: return@withContext null
        ImageFetchResult(image = bitmap.asImage(), isSampled = true, dataSource = DataSource.DISK)
    }

    private fun load(): Bitmap? {
        val size = data.sizePx.coerceIn(64, 512)
        val resolver = context.contentResolver
        val file = data.path?.let { File(it) }
        // 1. System thumbnails (fast path).
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val s = Size(size, size)
                return when {
                    file != null && data.isVideo -> ThumbnailUtils.createVideoThumbnail(file, s, null)
                    file != null -> ThumbnailUtils.createImageThumbnail(file, s, null)
                    else -> resolver.loadThumbnail(data.uri, s, null)
                }
            } else if (data.uri.scheme == ContentResolver.SCHEME_CONTENT && DocumentsContract.isDocumentUri(context, data.uri)) {
                DocumentsContract.getDocumentThumbnail(resolver, data.uri, Point(size, size), null)?.let { return it }
            }
        }
        // 2. Fallback: decode at a reduced sample size.
        return runCatching { if (data.isVideo) videoFrame(file, size) else sampledImage(resolver, file, size) }.getOrNull()
    }

    private fun sampledImage(resolver: ContentResolver, file: File?, size: Int): Bitmap? {
        fun open() = if (file != null) file.inputStream() else resolver.openInputStream(data.uri)
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        open()?.use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0) return null
        var sample = 1
        while (bounds.outWidth / (sample * 2) >= size && bounds.outHeight / (sample * 2) >= size) sample *= 2
        val opts = BitmapFactory.Options().apply {
            inSampleSize = sample
            inPreferredConfig = Bitmap.Config.RGB_565
        }
        return open()?.use { BitmapFactory.decodeStream(it, null, opts) }
    }

    private fun videoFrame(file: File?, size: Int): Bitmap? {
        val r = MediaMetadataRetriever()
        return try {
            if (file != null) r.setDataSource(file.absolutePath) else r.setDataSource(context, data.uri)
            val frame = r.frameAtTime ?: return null
            val scale = size.toFloat() / maxOf(frame.width, frame.height)
            if (scale >= 1f) frame else Bitmap.createScaledBitmap(frame, (frame.width * scale).toInt().coerceAtLeast(1), (frame.height * scale).toInt().coerceAtLeast(1), true)
        } finally {
            runCatching { r.release() }
        }
    }

    class Factory(private val context: Context) : Fetcher.Factory<Thumb> {
        override fun create(data: Thumb, options: Options, imageLoader: ImageLoader): Fetcher =
            ThumbFetcher(context.applicationContext, data)
    }
}
