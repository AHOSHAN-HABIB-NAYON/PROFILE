package com.filepilot.app.actions

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import com.filepilot.app.core.model.FileItem
import com.filepilot.app.core.model.SourceKind
import java.io.File

/** Hands files to other apps through Android intents, granting read access to that file only. */
object SystemIntents {

    /** A content:// URI another app can read. Local files go through FileProvider. */
    fun shareableUri(context: Context, item: FileItem): Uri? = when (item.source) {
        SourceKind.LOCAL -> item.path?.let {
            try {
                FileProvider.getUriForFile(context, "${context.packageName}.files", File(it))
            } catch (_: IllegalArgumentException) {
                null
            }
        }
        else -> item.uri
    }

    /**
     * Opens [item] in another app. Returns an error message for the user, or null on success.
     * [chooser] forces the "Open with" picker.
     */
    fun open(context: Context, item: FileItem, chooser: Boolean = false): String? {
        val uri = shareableUri(context, item) ?: return "This file can't be shared with other apps"
        val mime = item.mimeType.ifBlank { "*/*" }
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, mime)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        return try {
            if (chooser) {
                context.startActivity(Intent.createChooser(intent, "Open ${item.name} with"))
            } else {
                context.startActivity(intent)
            }
            null
        } catch (_: ActivityNotFoundException) {
            "No installed app can open this type of file"
        } catch (_: SecurityException) {
            "The other app couldn't be given access to this file"
        }
    }

    /** Opens the Android Sharesheet. Folders are skipped because they can't be shared as one file. */
    fun share(context: Context, items: List<FileItem>): String? {
        val files = items.filterNot { it.isDirectory }
        if (files.isEmpty()) return "Folders can't be shared. Compress them to a ZIP first."
        val uris = files.mapNotNull { shareableUri(context, it) }
        if (uris.isEmpty()) return "These files can't be shared"
        val mime = commonMime(files.map { it.mimeType })
        val intent = if (uris.size == 1) {
            Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_STREAM, uris.first())
        } else {
            Intent(Intent.ACTION_SEND_MULTIPLE).putParcelableArrayListExtra(Intent.EXTRA_STREAM, ArrayList(uris))
        }
        intent.type = mime
        val clip = ClipData.newRawUri(files.first().name, uris.first())
        uris.drop(1).forEach { clip.addItem(ClipData.Item(it)) }
        intent.clipData = clip
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        return try {
            context.startActivity(Intent.createChooser(intent, null))
            if (files.size < items.size) "Folders were left out of the share" else null
        } catch (_: ActivityNotFoundException) {
            "No app available to share with"
        }
    }

    private fun commonMime(mimes: List<String>): String {
        val distinct = mimes.distinct()
        if (distinct.size == 1) return distinct.first()
        val tops = distinct.map { it.substringBefore('/') }.distinct()
        return if (tops.size == 1) "${tops.first()}/*" else "*/*"
    }
}
