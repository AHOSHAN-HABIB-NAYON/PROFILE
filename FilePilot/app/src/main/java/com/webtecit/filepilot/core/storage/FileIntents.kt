package com.webtecit.filepilot.core.storage

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri

/** Opens and shares files with other apps using temporary per-file read grants. */
object FileIntents {

    /** Returns null on success, or a message to show. */
    fun open(context: Context, uri: Uri, mimeType: String, forceChooser: Boolean): String? {
        val type = if (mimeType == FileTypes.FALLBACK_MIME) "*/*" else mimeType
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, type)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        val launch = if (forceChooser) {
            Intent.createChooser(intent, "Open with").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        } else {
            intent
        }
        return try {
            context.startActivity(launch)
            null
        } catch (_: ActivityNotFoundException) {
            "No installed app can open this type of file."
        } catch (_: SecurityException) {
            "Android blocked opening this file."
        }
    }

    fun share(context: Context, uris: List<Uri>, mimeTypes: List<String>): String? {
        if (uris.isEmpty()) return "Select files to share. Folders can't be shared directly."
        val type = commonMime(mimeTypes)
        val intent = if (uris.size == 1) {
            Intent(Intent.ACTION_SEND).apply { putExtra(Intent.EXTRA_STREAM, uris[0]) }
        } else {
            Intent(Intent.ACTION_SEND_MULTIPLE).apply { putParcelableArrayListExtra(Intent.EXTRA_STREAM, ArrayList(uris)) }
        }
        intent.type = type
        // ClipData carries the read grant for every URI.
        val clip = ClipData.newRawUri("", uris[0])
        uris.drop(1).forEach { clip.addItem(ClipData.Item(it)) }
        intent.clipData = clip
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        return try {
            context.startActivity(Intent.createChooser(intent, "Share").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            null
        } catch (_: ActivityNotFoundException) {
            "No installed app can receive these files."
        }
    }

    private fun commonMime(types: List<String>): String {
        val distinct = types.distinct()
        if (distinct.size == 1 && distinct[0] != FileTypes.FALLBACK_MIME) return distinct[0]
        val groups = distinct.map { it.substringBefore('/') }.distinct()
        return if (groups.size == 1 && groups[0] != "application") "${groups[0]}/*" else "*/*"
    }
}
