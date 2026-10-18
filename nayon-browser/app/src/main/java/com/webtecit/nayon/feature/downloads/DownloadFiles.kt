package com.webtecit.nayon.feature.downloads

import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.webkit.MimeTypeMap
import android.widget.Toast
import com.webtecit.nayon.R

/** Opening and sharing files downloaded through Android's DownloadManager. */
object DownloadFiles {

    private fun dm(context: Context) = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager

    /** (file name, finished successfully) for a download id, or null if unknown. */
    fun info(context: Context, id: Long): Pair<String, Boolean>? = runCatching {
        dm(context).query(DownloadManager.Query().setFilterById(id)).use { c ->
            if (!c.moveToFirst()) return@use null
            val name = c.getString(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TITLE)).orEmpty()
            val status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
            name to (status == DownloadManager.STATUS_SUCCESSFUL)
        }
    }.getOrNull()

    fun uri(context: Context, id: Long): Uri? = runCatching { dm(context).getUriForDownloadedFile(id) }.getOrNull()

    /**
     * A usable MIME type. DownloadManager often reports "application/octet-stream", which no
     * app opens, so the file extension decides in that case.
     */
    fun mime(context: Context, id: Long, name: String): String {
        val reported = runCatching { dm(context).getMimeTypeForDownloadedFile(id) }.getOrNull()
        if (!reported.isNullOrBlank() && reported != "application/octet-stream" && reported != "binary/octet-stream") return reported
        val ext = name.substringAfterLast('.', "").lowercase()
        return MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext)
            ?: if (ext == "apk") "application/vnd.android.package-archive" else reported ?: "*/*"
    }

    fun open(context: Context, id: Long, name: String) {
        val uri = uri(context, id) ?: run { toast(context, R.string.downloads_missing); return }
        val intent = Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime(context, id, name))
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(intent)
        } catch (e: ActivityNotFoundException) {
            toast(context, R.string.downloads_no_app)
        } catch (e: SecurityException) {
            toast(context, R.string.downloads_no_app)
        }
    }

    fun share(context: Context, id: Long, name: String) {
        val uri = uri(context, id) ?: return
        val send = Intent(Intent.ACTION_SEND).setType(mime(context, id, name))
            .putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        runCatching {
            context.startActivity(Intent.createChooser(send, name).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }

    private fun toast(context: Context, text: Int) = Toast.makeText(context, text, Toast.LENGTH_SHORT).show()
}
