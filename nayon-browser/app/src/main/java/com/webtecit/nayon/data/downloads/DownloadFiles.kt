package com.webtecit.nayon.data.downloads

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.core.content.FileProvider
import com.webtecit.nayon.R
import java.io.File

/** Opening and sharing downloaded files. */
object DownloadFiles {

    fun contentUri(context: Context, record: DownloadRecord): Uri? {
        val dest = record.destUri ?: return null
        val uri = Uri.parse(dest)
        return if (uri.scheme == "file") {
            runCatching { FileProvider.getUriForFile(context, context.packageName + ".files", File(uri.path!!)) }.getOrNull()
        } else {
            uri
        }
    }

    fun mime(record: DownloadRecord): String =
        record.mimeType?.takeIf { it.isNotBlank() && it != "application/octet-stream" } ?: DownloadEngine.guessMime(record.fileName)

    fun viewIntent(context: Context, record: DownloadRecord): Intent =
        Intent(Intent.ACTION_VIEW).setDataAndType(contentUri(context, record), mime(record))
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)

    fun open(context: Context, record: DownloadRecord) {
        if (contentUri(context, record) == null) { toast(context, R.string.downloads_missing); return }
        try {
            context.startActivity(viewIntent(context, record))
        } catch (e: ActivityNotFoundException) {
            toast(context, R.string.downloads_no_app)
        } catch (e: SecurityException) {
            toast(context, R.string.downloads_no_app)
        }
    }

    fun share(context: Context, record: DownloadRecord) {
        val uri = contentUri(context, record) ?: return
        val send = Intent(Intent.ACTION_SEND).setType(mime(record))
            .putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        runCatching { context.startActivity(Intent.createChooser(send, record.fileName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
    }

    private fun toast(context: Context, text: Int) = Toast.makeText(context, text, Toast.LENGTH_SHORT).show()
}
