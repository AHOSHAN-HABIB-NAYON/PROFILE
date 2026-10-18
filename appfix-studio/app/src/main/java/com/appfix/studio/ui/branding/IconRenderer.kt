package com.appfix.studio.ui.branding

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.net.Uri
import com.appfix.core.branding.IconOutput
import java.io.ByteArrayOutputStream

/** Renders launcher icon bitmaps from a user-picked image. */
object IconRenderer {
    /** Decodes an image, downsampling very large files to at most [maxSize] pixels per side. */
    fun decode(context: Context, uri: Uri, maxSize: Int = 1024): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        var sample = 1
        while (bounds.outWidth / (sample * 2) >= maxSize && bounds.outHeight / (sample * 2) >= maxSize) sample *= 2
        val opts = BitmapFactory.Options().apply { inSampleSize = sample }
        return context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) }
    }

    /**
     * [scale] is the share of the canvas the image occupies. Adaptive foregrounds keep the image
     * inside the 66/108 safe zone so launchers can mask it to any shape.
     */
    fun render(source: Bitmap, output: IconOutput, background: Int, scale: Float): Bitmap {
        val size = output.sizePx
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
        when (output.kind) {
            IconOutput.Kind.LEGACY -> {
                paint.color = background
                val r = size * 0.18f
                canvas.drawRoundRect(RectF(0f, 0f, size.toFloat(), size.toFloat()), r, r, paint)
                drawCentered(canvas, source, size, scale, paint)
            }
            IconOutput.Kind.ROUND -> {
                val clip = Path().apply { addCircle(size / 2f, size / 2f, size / 2f, Path.Direction.CW) }
                canvas.clipPath(clip)
                paint.color = background
                canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint)
                drawCentered(canvas, source, size, scale, paint)
            }
            IconOutput.Kind.FOREGROUND -> drawCentered(canvas, source, size, scale * (66f / 108f), paint)
        }
        return bmp
    }

    private fun drawCentered(canvas: Canvas, source: Bitmap, size: Int, scale: Float, paint: Paint) {
        val box = size * scale
        val ratio = minOf(box / source.width, box / source.height)
        val w = source.width * ratio
        val h = source.height * ratio
        val left = (size - w) / 2f
        val top = (size - h) / 2f
        canvas.drawBitmap(source, null, RectF(left, top, left + w, top + h), paint)
    }

    fun png(bitmap: Bitmap): ByteArray = ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }.toByteArray()
}
