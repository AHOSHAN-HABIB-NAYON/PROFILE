package com.webtecit.filepilot.feature.toolkit

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.EncodeHintType
import com.google.zxing.LuminanceSource
import com.google.zxing.MultiFormatReader
import com.google.zxing.MultiFormatWriter
import com.google.zxing.NotFoundException
import com.google.zxing.RGBLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive

/** Image output formats for the image tools. */
enum class ImageFormat(val label: String, val extension: String, val compress: Bitmap.CompressFormat) {
    JPG("JPG", "jpg", Bitmap.CompressFormat.JPEG),
    PNG("PNG", "png", Bitmap.CompressFormat.PNG),
    @Suppress("DEPRECATION")
    WEBP("WEBP", "webp", Bitmap.CompressFormat.WEBP),
}

/** The kinds of content a QR code can hold, with the text format other apps understand. */
enum class QrKind(val label: String) { TEXT("Text"), URL("Link"), WIFI("WiFi"), PHONE("Phone"), EMAIL("Email"), SMS("SMS"), CONTACT("Contact") }

/** PDF, image and QR work. Pure functions over streams, so they run on any background thread. */
object MediaTools {
    const val A4_W = 595
    const val A4_H = 842

    // ----- PDF ----------------------------------------------------------------------------------

    /** Lays text out on A4 pages, with an optional bold title on the first page. Returns the page count. */
    suspend fun textToPdf(text: String, title: String, fontSize: Float, out: OutputStream): Int {
        val doc = PdfDocument()
        val margin = 48f
        val width = (A4_W - 2 * margin).toInt()
        val pageHeight = A4_H - 2 * margin
        val body = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { textSize = fontSize; color = Color.BLACK }
        val heading = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { textSize = fontSize * 1.6f; color = Color.BLACK; typeface = Typeface.DEFAULT_BOLD }
        val titleLayout = title.takeIf { it.isNotBlank() }?.let { layout(it, heading, width) }
        val layout = layout(text.ifEmpty { " " }, body, width)
        var pages = 0
        try {
            var line = 0
            while (line < layout.lineCount) {
                currentCoroutineContext().ensureActive()
                pages++
                val page = doc.startPage(PdfDocument.PageInfo.Builder(A4_W, A4_H, pages).create())
                val canvas = page.canvas
                canvas.drawColor(Color.WHITE)
                var top = margin
                if (pages == 1 && titleLayout != null) {
                    canvas.save()
                    canvas.translate(margin, top)
                    titleLayout.draw(canvas)
                    canvas.restore()
                    top += titleLayout.height + fontSize
                }
                val available = A4_H - margin - top
                val startTop = layout.getLineTop(line)
                var end = line
                while (end < layout.lineCount && layout.getLineBottom(end) - startTop <= available) end++
                if (end == line) end = line + 1 // a single line taller than the page still goes on it
                canvas.save()
                canvas.clipRect(margin, top, A4_W - margin, top + (layout.getLineBottom(end - 1) - startTop).toFloat())
                canvas.translate(margin, top - startTop)
                layout.draw(canvas)
                canvas.restore()
                doc.finishPage(page)
                line = end
                if (pageHeight <= 0) break
            }
            doc.writeTo(out)
        } finally {
            doc.close()
        }
        return pages
    }

    private fun layout(text: String, paint: TextPaint, width: Int): StaticLayout =
        StaticLayout.Builder.obtain(text, 0, text.length, paint, width)
            .setAlignment(Layout.Alignment.ALIGN_NORMAL)
            .setLineSpacing(0f, 1.25f)
            .build()

    /** Page count of a PDF, or an error for protected or damaged files. */
    fun pageCount(pdf: ParcelFileDescriptor): Int = openRenderer(pdf).use { it.pageCount }

    private fun openRenderer(pdf: ParcelFileDescriptor): PdfRenderer = try {
        PdfRenderer(pdf)
    } catch (e: SecurityException) {
        throw IllegalStateException("This PDF is password-protected.", e)
    } catch (e: java.io.IOException) {
        throw IllegalStateException("This file isn't a valid PDF or is damaged.", e)
    }

    /** Saves pages as images in [outDir]. [pages] are 0-based; null means all. Returns the files written. */
    suspend fun pdfToImages(
        pdf: ParcelFileDescriptor,
        baseName: String,
        outDir: File,
        format: ImageFormat,
        dpi: Int = 150,
        pages: List<Int>? = null,
        onProgress: (done: Int, total: Int) -> Unit = { _, _ -> },
    ): List<File> {
        outDir.mkdirs()
        val written = ArrayList<File>()
        openRenderer(pdf).use { r ->
            val list = (pages ?: (0 until r.pageCount).toList()).filter { it in 0 until r.pageCount }
            val digits = r.pageCount.toString().length.coerceAtLeast(2)
            list.forEachIndexed { n, i ->
                currentCoroutineContext().ensureActive()
                r.openPage(i).use { p ->
                    val bmp = Bitmap.createBitmap((p.width * dpi / 72).coerceAtLeast(1), (p.height * dpi / 72).coerceAtLeast(1), Bitmap.Config.ARGB_8888)
                    bmp.eraseColor(Color.WHITE)
                    p.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
                    val file = uniqueFile(outDir, "${baseName}_page_${(i + 1).toString().padStart(digits, '0')}", format.extension)
                    file.outputStream().use { bmp.compress(format.compress, 92, it) }
                    bmp.recycle()
                    written += file
                }
                onProgress(n + 1, list.size)
            }
        }
        return written
    }

    /**
     * Builds a new PDF from pages of one or more PDFs, drawn as images at [dpi] (Android has no
     * built-in way to copy PDF pages). [pick] chooses the 0-based pages of each source; null = all.
     */
    suspend fun combinePdfs(
        sources: List<ParcelFileDescriptor>,
        out: OutputStream,
        pick: (sourceIndex: Int, pageCount: Int) -> List<Int>? = { _, _ -> null },
        dpi: Int = 150,
        rotate: Int = 0,
        onProgress: (Int) -> Unit = {},
    ): Int {
        val doc = PdfDocument()
        var number = 0
        try {
            sources.forEachIndexed { s, pfd ->
                openRenderer(pfd).use { r ->
                    val wanted = (pick(s, r.pageCount) ?: (0 until r.pageCount).toList()).filter { it in 0 until r.pageCount }
                    for (i in wanted) {
                        currentCoroutineContext().ensureActive()
                        r.openPage(i).use { p ->
                            val bmp = Bitmap.createBitmap((p.width * dpi / 72).coerceAtLeast(1), (p.height * dpi / 72).coerceAtLeast(1), Bitmap.Config.ARGB_8888)
                            bmp.eraseColor(Color.WHITE)
                            p.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
                            val jpeg = recompress(bmp, 88)
                            val turned = rotate % 180 != 0
                            val w = if (turned) p.height else p.width
                            val h = if (turned) p.width else p.height
                            val page = doc.startPage(PdfDocument.PageInfo.Builder(w, h, ++number).create())
                            val m = Matrix().apply {
                                postScale(p.width.toFloat() / jpeg.width, p.height.toFloat() / jpeg.height)
                                if (rotate != 0) {
                                    postRotate(rotate.toFloat())
                                    when (((rotate % 360) + 360) % 360) {
                                        90 -> postTranslate(p.height.toFloat(), 0f)
                                        180 -> postTranslate(p.width.toFloat(), p.height.toFloat())
                                        270 -> postTranslate(0f, p.width.toFloat())
                                    }
                                }
                            }
                            page.canvas.drawColor(Color.WHITE)
                            page.canvas.drawBitmap(jpeg, m, Paint(Paint.FILTER_BITMAP_FLAG))
                            doc.finishPage(page)
                            bmp.recycle()
                            jpeg.recycle()
                            onProgress(number)
                        }
                    }
                }
            }
            if (number == 0) throw IllegalArgumentException("No pages were chosen.")
            doc.writeTo(out)
        } finally {
            doc.close()
        }
        return number
    }

    /** Images on A4 pages (fit inside margins) or at their own size. */
    suspend fun imagesToPdf(images: List<() -> InputStream>, out: OutputStream, a4: Boolean, onProgress: (Int) -> Unit = {}): Int {
        val doc = PdfDocument()
        try {
            images.forEachIndexed { i, open ->
                currentCoroutineContext().ensureActive()
                val bmp = decode(open, 2480) ?: throw IllegalArgumentException("Image ${i + 1} couldn't be read.")
                val pw = if (a4) A4_W else (bmp.width * 72 / 150).coerceAtLeast(1)
                val ph = if (a4) A4_H else (bmp.height * 72 / 150).coerceAtLeast(1)
                val page = doc.startPage(PdfDocument.PageInfo.Builder(pw, ph, i + 1).create())
                val margin = if (a4) 24f else 0f
                val box = RectF(margin, margin, pw - margin, ph - margin)
                val scale = minOf(box.width() / bmp.width, box.height() / bmp.height)
                val w = bmp.width * scale
                val h = bmp.height * scale
                val m = Matrix().apply { postScale(scale, scale); postTranslate(box.left + (box.width() - w) / 2, box.top + (box.height() - h) / 2) }
                page.canvas.drawColor(Color.WHITE)
                page.canvas.drawBitmap(bmp, m, Paint(Paint.FILTER_BITMAP_FLAG))
                doc.finishPage(page)
                bmp.recycle()
                onProgress(i + 1)
            }
            doc.writeTo(out)
        } finally {
            doc.close()
        }
        return images.size
    }

    /** "1-3, 5, 8-" → 0-based page indexes within [pageCount]. Throws with a readable message when the text is wrong. */
    fun parsePages(text: String, pageCount: Int): List<Int> {
        val out = LinkedHashSet<Int>()
        val parts = text.split(',', ' ', ';').map { it.trim() }.filter { it.isNotEmpty() }
        require(parts.isNotEmpty()) { "Enter pages, for example 1-3, 5." }
        for (part in parts) {
            val range = part.split('-')
            when {
                range.size == 1 -> {
                    val n = range[0].toIntOrNull() ?: throw IllegalArgumentException("\"$part\" isn't a page number.")
                    require(n in 1..pageCount) { "Page $n doesn't exist (the PDF has $pageCount pages)." }
                    out += n - 1
                }
                range.size == 2 -> {
                    val a = range[0].ifBlank { "1" }.toIntOrNull() ?: throw IllegalArgumentException("\"$part\" isn't a page range.")
                    val b = range[1].ifBlank { pageCount.toString() }.toIntOrNull() ?: throw IllegalArgumentException("\"$part\" isn't a page range.")
                    require(a in 1..pageCount && b in 1..pageCount) { "\"$part\" is outside 1–$pageCount." }
                    val step = if (a <= b) 1 else -1
                    var i = a
                    while (true) {
                        out += i - 1
                        if (i == b) break
                        i += step
                    }
                }
                else -> throw IllegalArgumentException("\"$part\" isn't a page range.")
            }
        }
        return out.toList()
    }

    // ----- Images -------------------------------------------------------------------------------

    /**
     * Re-saves an image: optional resize so the longer side is at most [maxSide] (0 keeps the size),
     * photo rotation from EXIF applied, then written in [format] at [quality].
     */
    fun processImage(open: () -> InputStream, out: OutputStream, format: ImageFormat, quality: Int, maxSide: Int) {
        val rotation = runCatching { open().use { exifRotation(it) } }.getOrDefault(0)
        var bmp = decode(open, if (maxSide > 0) maxSide * 2 else 8192) ?: throw IllegalArgumentException("The image couldn't be read.")
        if (maxSide > 0 && maxOf(bmp.width, bmp.height) > maxSide) {
            val scale = maxSide.toFloat() / maxOf(bmp.width, bmp.height)
            val scaled = Bitmap.createScaledBitmap(bmp, (bmp.width * scale).toInt().coerceAtLeast(1), (bmp.height * scale).toInt().coerceAtLeast(1), true)
            if (scaled !== bmp) bmp.recycle()
            bmp = scaled
        }
        if (rotation != 0) {
            val turned = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, Matrix().apply { postRotate(rotation.toFloat()) }, true)
            if (turned !== bmp) bmp.recycle()
            bmp = turned
        }
        if (format == ImageFormat.JPG && bmp.hasAlpha()) {
            // JPG has no transparency: put the picture on white.
            val flat = Bitmap.createBitmap(bmp.width, bmp.height, Bitmap.Config.ARGB_8888)
            Canvas(flat).apply { drawColor(Color.WHITE); drawBitmap(bmp, 0f, 0f, null) }
            bmp.recycle()
            bmp = flat
        }
        bmp.compress(format.compress, quality.coerceIn(1, 100), out)
        bmp.recycle()
    }

    /** Width and height of an image without loading it. */
    fun imageSize(open: () -> InputStream): Pair<Int, Int>? {
        val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        open().use { BitmapFactory.decodeStream(it, null, o) }
        return if (o.outWidth > 0) o.outWidth to o.outHeight else null
    }

    private fun exifRotation(input: InputStream): Int =
        when (androidx.exifinterface.media.ExifInterface(input).getAttributeInt(androidx.exifinterface.media.ExifInterface.TAG_ORIENTATION, 1)) {
            androidx.exifinterface.media.ExifInterface.ORIENTATION_ROTATE_90 -> 90
            androidx.exifinterface.media.ExifInterface.ORIENTATION_ROTATE_180 -> 180
            androidx.exifinterface.media.ExifInterface.ORIENTATION_ROTATE_270 -> 270
            else -> 0
        }

    fun decode(open: () -> InputStream, maxSide: Int): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        open().use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0) return null
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxSide) sample *= 2
        return open().use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) }
    }

    private fun recompress(bmp: Bitmap, quality: Int): Bitmap {
        val bytes = java.io.ByteArrayOutputStream().also { bmp.compress(Bitmap.CompressFormat.JPEG, quality, it) }.toByteArray()
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    }

    fun uniqueFile(dir: File, base: String, extension: String): File {
        val clean = base.replace(Regex("[\\\\/:*?\"<>|]"), "_").take(120).ifBlank { "file" }
        var f = File(dir, "$clean.$extension")
        var n = 1
        while (f.exists()) f = File(dir, "$clean ($n).$extension").also { n++ }
        return f
    }

    // ----- QR -----------------------------------------------------------------------------------

    /** Builds the text that goes inside a QR code for each kind (the formats phone cameras understand). */
    fun qrPayload(kind: QrKind, fields: Map<String, String>): String {
        fun f(key: String) = fields[key].orEmpty().trim()
        fun esc(v: String) = v.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace(":", "\\:").replace("\"", "\\\"")
        return when (kind) {
            QrKind.TEXT -> fields["text"].orEmpty()
            QrKind.URL -> f("url").let { if (it.isEmpty() || it.contains("://")) it else "https://$it" }
            QrKind.WIFI -> {
                val security = f("security").ifEmpty { "WPA" }
                buildString {
                    append("WIFI:T:").append(if (security == "None") "nopass" else security)
                    append(";S:").append(esc(f("ssid")))
                    if (security != "None") append(";P:").append(esc(f("password")))
                    if (fields["hidden"] == "true") append(";H:true")
                    append(";;")
                }
            }
            QrKind.PHONE -> "tel:" + f("phone")
            QrKind.EMAIL -> buildString {
                append("mailto:").append(f("email"))
                val subject = f("subject")
                val body = f("body")
                if (subject.isNotEmpty() || body.isNotEmpty()) {
                    append('?')
                    val q = ArrayList<String>()
                    if (subject.isNotEmpty()) q += "subject=" + android.net.Uri.encode(subject)
                    if (body.isNotEmpty()) q += "body=" + android.net.Uri.encode(body)
                    append(q.joinToString("&"))
                }
            }
            QrKind.SMS -> "SMSTO:" + f("phone") + ":" + fields["message"].orEmpty()
            QrKind.CONTACT -> buildString {
                append("MECARD:N:").append(esc(f("name"))).append(';')
                if (f("phone").isNotEmpty()) append("TEL:").append(esc(f("phone"))).append(';')
                if (f("email").isNotEmpty()) append("EMAIL:").append(esc(f("email"))).append(';')
                if (f("org").isNotEmpty()) append("ORG:").append(esc(f("org"))).append(';')
                append(';')
            }
        }
    }

    /** A QR code as a bitmap; [logo] is drawn in the middle (high error correction keeps it readable). */
    fun qrBitmap(content: String, size: Int, foreground: Int, background: Int, logo: Bitmap? = null): Bitmap {
        require(content.isNotEmpty()) { "Enter something to put in the QR code." }
        val hints = mapOf(
            EncodeHintType.ERROR_CORRECTION to if (logo != null) ErrorCorrectionLevel.H else ErrorCorrectionLevel.M,
            EncodeHintType.MARGIN to 2,
            EncodeHintType.CHARACTER_SET to "UTF-8",
        )
        val matrix = MultiFormatWriter().encode(content, BarcodeFormat.QR_CODE, size, size, hints)
        val pixels = IntArray(matrix.width * matrix.height)
        for (y in 0 until matrix.height) for (x in 0 until matrix.width) {
            pixels[y * matrix.width + x] = if (matrix[x, y]) foreground else background
        }
        val bmp = Bitmap.createBitmap(pixels, matrix.width, matrix.height, Bitmap.Config.ARGB_8888).copy(Bitmap.Config.ARGB_8888, true)
        if (logo != null) {
            val side = matrix.width * 0.22f
            val left = (matrix.width - side) / 2
            val top = (matrix.height - side) / 2
            val canvas = Canvas(bmp)
            val pad = side * 0.08f
            canvas.drawRoundRect(RectF(left - pad, top - pad, left + side + pad, top + side + pad), side * 0.2f, side * 0.2f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = background })
            canvas.drawBitmap(logo, null, RectF(left, top, left + side, top + side), Paint(Paint.FILTER_BITMAP_FLAG))
        }
        return bmp
    }

    /** A barcode (Code 128 or EAN-13) as a bitmap. */
    fun barcodeBitmap(content: String, format: BarcodeFormat, width: Int, height: Int): Bitmap {
        require(content.isNotEmpty()) { "Enter the barcode number or text." }
        val matrix = MultiFormatWriter().encode(content, format, width, height, mapOf(EncodeHintType.MARGIN to 10))
        val pixels = IntArray(matrix.width * matrix.height)
        for (y in 0 until matrix.height) for (x in 0 until matrix.width) {
            pixels[y * matrix.width + x] = if (matrix[x, y]) Color.BLACK else Color.WHITE
        }
        return Bitmap.createBitmap(pixels, matrix.width, matrix.height, Bitmap.Config.ARGB_8888)
    }

    private val readerHints = mapOf(
        DecodeHintType.TRY_HARDER to true,
        DecodeHintType.CHARACTER_SET to "UTF-8",
    )

    /** Reads a QR code or barcode from a picture; null when none is found. */
    fun decode(bitmap: Bitmap): com.google.zxing.Result? {
        val w = bitmap.width
        val h = bitmap.height
        val pixels = IntArray(w * h)
        bitmap.getPixels(pixels, 0, w, 0, 0, w, h)
        return decode(RGBLuminanceSource(w, h, pixels))
    }

    fun decode(source: LuminanceSource): com.google.zxing.Result? {
        val reader = MultiFormatReader().apply { setHints(readerHints) }
        for (s in listOf(source, source.invert())) {
            try {
                return reader.decodeWithState(BinaryBitmap(HybridBinarizer(s)))
            } catch (e: NotFoundException) {
                // try the inverted picture (light code on dark background)
            } catch (e: com.google.zxing.ReaderException) {
                // damaged or partial code: try again
            } finally {
                reader.reset()
            }
        }
        return null
    }
}
