package com.webtecit.devicepilot.data.repository

import android.content.Context
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.net.Uri
import com.webtecit.devicepilot.core.common.AppInfo
import com.webtecit.devicepilot.core.common.Formatters
import com.webtecit.devicepilot.domain.model.InfoSection
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.OutputStream
import javax.inject.Inject
import javax.inject.Singleton

/** Writes the device report as plain text or as an A4 PDF using Android's built-in PdfDocument. */
@Singleton
class ReportExporter @Inject constructor(@ApplicationContext private val context: Context) {

    suspend fun writeText(uri: Uri, text: String) = withContext(Dispatchers.IO) {
        context.contentResolver.openOutputStream(uri, "wt")?.use { it.write(text.toByteArray()) }
            ?: error("Could not open the selected file")
    }

    suspend fun writePdf(uri: Uri, sections: List<InfoSection>) = withContext(Dispatchers.IO) {
        context.contentResolver.openOutputStream(uri, "wt")?.use { writePdf(it, sections) }
            ?: error("Could not open the selected file")
    }

    fun writePdf(out: OutputStream, sections: List<InfoSection>) {
        val pageWidth = 595
        val pageHeight = 842
        val margin = 40f
        val doc = PdfDocument()

        val title = Paint().apply { color = Color.rgb(10, 138, 80); textSize = 20f; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD); isAntiAlias = true }
        val heading = Paint().apply { color = Color.rgb(14, 147, 132); textSize = 13f; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD); isAntiAlias = true }
        val label = Paint().apply { color = Color.rgb(93, 107, 130); textSize = 10f; isAntiAlias = true }
        val value = Paint().apply { color = Color.rgb(16, 24, 40); textSize = 10f; isAntiAlias = true }
        val small = Paint().apply { color = Color.rgb(120, 130, 150); textSize = 8f; isAntiAlias = true }
        val rule = Paint().apply { color = Color.rgb(230, 233, 238); strokeWidth = 1f }

        var pageNumber = 0
        var page: PdfDocument.Page? = null
        var y = 0f

        fun finishPage() {
            page?.let { p ->
                p.canvas.drawText("${AppInfo.NAME} by ${AppInfo.COMPANY} · Page $pageNumber", margin, pageHeight - 20f, small)
                doc.finishPage(p)
            }
        }

        fun newPage() {
            finishPage()
            pageNumber++
            page = doc.startPage(PdfDocument.PageInfo.Builder(pageWidth, pageHeight, pageNumber).create())
            y = margin
        }

        fun ensure(space: Float) {
            if (page == null || y + space > pageHeight - 40f) newPage()
        }

        fun wrap(text: String, paint: Paint, width: Float): List<String> {
            val lines = mutableListOf<String>()
            var remaining = text
            while (remaining.isNotEmpty()) {
                val count = paint.breakText(remaining, true, width, null).coerceAtLeast(1)
                lines += remaining.substring(0, count)
                remaining = remaining.substring(count)
            }
            return lines.ifEmpty { listOf("") }
        }

        newPage()
        page!!.canvas.drawText("${AppInfo.NAME} — Device Report", margin, y + 18f, title)
        y += 34f
        page!!.canvas.drawText("Generated ${Formatters.dateTime(System.currentTimeMillis())}", margin, y, label)
        y += 22f

        val labelWidth = 170f
        val valueWidth = pageWidth - margin * 2 - labelWidth
        sections.forEach { section ->
            ensure(40f)
            y += 8f
            page!!.canvas.drawText(section.title, margin, y, heading)
            y += 8f
            page!!.canvas.drawLine(margin, y, pageWidth - margin, y, rule)
            y += 14f
            section.rows.forEach { (k, v) ->
                val lines = wrap(v, value, valueWidth)
                ensure(14f * lines.size + 4f)
                page!!.canvas.drawText(k, margin, y, label)
                lines.forEachIndexed { i, line -> page!!.canvas.drawText(line, margin + labelWidth, y + i * 13f, value) }
                y += 13f * lines.size + 4f
            }
        }
        ensure(30f)
        y += 12f
        page!!.canvas.drawText("Values marked (est.) are estimates. 'Not Available' / 'Restricted by Android' means the device does not expose that value.", margin, y, small)
        finishPage()
        doc.writeTo(out)
        doc.close()
    }
}
