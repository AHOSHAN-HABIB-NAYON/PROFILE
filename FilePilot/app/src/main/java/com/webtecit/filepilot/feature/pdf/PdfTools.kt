package com.webtecit.filepilot.feature.pdf

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.pdf.PdfDocument
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import com.webtecit.filepilot.core.common.IoDispatcher
import com.webtecit.filepilot.core.storage.FileItem
import com.webtecit.filepilot.core.storage.FileSystems
import com.webtecit.filepilot.core.storage.FsError
import com.webtecit.filepilot.core.storage.FsException
import com.webtecit.filepilot.core.storage.SafFileSystem
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.io.OutputStream
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext

/** PDF creation tools built on Android's own PdfRenderer and PdfDocument (no third-party code). */
@Singleton
class PdfTools @Inject constructor(
    @ApplicationContext private val context: Context,
    private val fileSystems: FileSystems,
    @IoDispatcher private val io: CoroutineDispatcher,
) {
    fun openDescriptor(id: String): ParcelFileDescriptor =
        if (id.startsWith(SafFileSystem.PREFIX)) context.contentResolver.openFileDescriptor(SafFileSystem.uriOf(id), "r")
            ?: throw FsException(FsError.NOT_FOUND, "The PDF can't be opened.")
        else ParcelFileDescriptor.open(File(id), ParcelFileDescriptor.MODE_READ_ONLY)

    fun renderer(id: String): PdfRenderer = try {
        PdfRenderer(openDescriptor(id))
    } catch (e: SecurityException) {
        throw FsException(FsError.NOT_SUPPORTED, "This PDF is password-protected. Open it with another app.", e)
    } catch (e: java.io.IOException) {
        throw FsException(FsError.IO, "This file isn't a valid PDF or is damaged.", e)
    }

    /** A4 pages; each image is scaled to fit inside the margins. */
    suspend fun imagesToPdf(images: List<FileItem>, out: OutputStream) = withContext(io) {
        val doc = PdfDocument()
        try {
            images.forEachIndexed { i, item ->
                currentCoroutineContext().ensureActive()
                val bmp = decodeScaled(item, 2480) ?: throw FsException(FsError.IO, "\"${item.name}\" isn't a readable image.")
                val page = doc.startPage(PdfDocument.PageInfo.Builder(595, 842, i + 1).create())
                val margin = 24f
                val box = RectF(margin, margin, 595 - margin, 842 - margin)
                val scale = minOf(box.width() / bmp.width, box.height() / bmp.height)
                val w = bmp.width * scale
                val h = bmp.height * scale
                val m = Matrix().apply { postScale(scale, scale); postTranslate(box.left + (box.width() - w) / 2, box.top + (box.height() - h) / 2) }
                page.canvas.drawColor(Color.WHITE)
                page.canvas.drawBitmap(bmp, m, Paint(Paint.FILTER_BITMAP_FLAG))
                doc.finishPage(page)
                bmp.recycle()
            }
            doc.writeTo(out)
        } finally {
            doc.close()
        }
    }

    /**
     * Merges PDFs by drawing each page into a new document at [dpi]. Pages become images, so text
     * can no longer be selected in the result; the original files are not changed.
     */
    suspend fun merge(pdfs: List<FileItem>, out: OutputStream, dpi: Int = 150, jpegQuality: Int = 85, onProgress: (Int) -> Unit = {}) = withContext(io) {
        val doc = PdfDocument()
        var number = 0
        try {
            for (item in pdfs) {
                renderer(item.id).use { r ->
                    for (i in 0 until r.pageCount) {
                        currentCoroutineContext().ensureActive()
                        r.openPage(i).use { p ->
                            val w = p.width
                            val h = p.height
                            val bmp = Bitmap.createBitmap((w * dpi / 72).coerceAtLeast(1), (h * dpi / 72).coerceAtLeast(1), Bitmap.Config.ARGB_8888)
                            bmp.eraseColor(Color.WHITE)
                            p.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
                            val jpeg = recompress(bmp, jpegQuality)
                            val page = doc.startPage(PdfDocument.PageInfo.Builder(w, h, ++number).create())
                            page.canvas.drawBitmap(jpeg, null, RectF(0f, 0f, w.toFloat(), h.toFloat()), Paint(Paint.FILTER_BITMAP_FLAG))
                            doc.finishPage(page)
                            bmp.recycle()
                            jpeg.recycle()
                            onProgress(number)
                        }
                    }
                }
            }
            doc.writeTo(out)
        } finally {
            doc.close()
        }
    }

    private fun recompress(bmp: Bitmap, quality: Int): Bitmap {
        val bytes = java.io.ByteArrayOutputStream().also { bmp.compress(Bitmap.CompressFormat.JPEG, quality, it) }.toByteArray()
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    }

    private fun decodeScaled(item: FileItem, maxSide: Int): Bitmap? {
        val fs = fileSystems.of(item.id)
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        fs.openInput(item.id).use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0) return null
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / sample > maxSide) sample *= 2
        return fs.openInput(item.id).use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) }
    }
}
