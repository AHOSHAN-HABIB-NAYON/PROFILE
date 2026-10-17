package com.filepilot.app.data.files

import android.content.ContentResolver
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.DocumentsContract.Document
import com.filepilot.app.core.model.FileItem
import com.filepilot.app.core.model.Location
import com.filepilot.app.core.model.SourceKind
import com.filepilot.app.core.util.MimeTypes

/**
 * Storage Access Framework access for folders the user picked in the system folder picker.
 * Items are addressed by document URIs; there is no filesystem path.
 */
class SafFiles(private val resolver: ContentResolver) {

    private val projection = arrayOf(
        Document.COLUMN_DOCUMENT_ID,
        Document.COLUMN_DISPLAY_NAME,
        Document.COLUMN_MIME_TYPE,
        Document.COLUMN_SIZE,
        Document.COLUMN_LAST_MODIFIED,
        Document.COLUMN_FLAGS,
    )

    fun rootLocation(treeUri: Uri, name: String): Location.Saf =
        Location.Saf(treeUri, DocumentsContract.getTreeDocumentId(treeUri), name)

    fun documentUri(treeUri: Uri, documentId: String): Uri =
        DocumentsContract.buildDocumentUriUsingTree(treeUri, documentId)

    fun list(location: Location.Saf, showHidden: Boolean): List<FileItem> {
        val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(location.treeUri, location.documentId)
        val cursor = try {
            resolver.query(childrenUri, projection, null, null, null)
        } catch (e: SecurityException) {
            throw FileAccessException("Access to this folder was removed. Pick the folder again to restore it.", e)
        } catch (e: IllegalArgumentException) {
            throw FileAccessException("This folder is no longer available", e)
        } ?: throw FileAccessException("This folder can't be read")
        val result = ArrayList<FileItem>()
        cursor.use { c ->
            while (c.moveToNext()) {
                val item = rowToItem(location.treeUri, c) ?: continue
                if (!showHidden && item.isHidden) continue
                result.add(item)
            }
        }
        return result
    }

    fun query(treeUri: Uri, documentId: String): FileItem? {
        val uri = documentUri(treeUri, documentId)
        return try {
            resolver.query(uri, projection, null, null, null)?.use { c -> if (c.moveToFirst()) rowToItem(treeUri, c) else null }
        } catch (_: Exception) {
            null
        }
    }

    private fun rowToItem(treeUri: Uri, c: android.database.Cursor): FileItem? {
        val docId = c.getString(0) ?: return null
        val name = c.getString(1) ?: return null
        val mime = c.getString(2) ?: MimeTypes.UNKNOWN
        val isDir = mime == Document.MIME_TYPE_DIR
        val size = if (c.isNull(3)) -1L else c.getLong(3)
        val modified = if (c.isNull(4)) 0L else c.getLong(4)
        val flags = if (c.isNull(5)) 0 else c.getInt(5)
        return FileItem(
            name = name,
            isDirectory = isDir,
            size = if (isDir) -1 else size,
            lastModified = modified,
            mimeType = if (isDir) MimeTypes.DIRECTORY else MimeTypes.best(name, mime),
            source = SourceKind.SAF,
            uri = documentUri(treeUri, docId),
            treeUri = treeUri,
            documentId = docId,
            canWrite = if (isDir) (flags and Document.FLAG_DIR_SUPPORTS_CREATE) != 0 else (flags and Document.FLAG_SUPPORTS_WRITE) != 0,
            canDelete = (flags and Document.FLAG_SUPPORTS_DELETE) != 0,
            canRename = (flags and Document.FLAG_SUPPORTS_RENAME) != 0,
        )
    }

    fun childNames(location: Location.Saf): Set<String> =
        list(location, showHidden = true).mapTo(HashSet()) { it.name.lowercase() }

    fun createDirectory(parent: Location.Saf, name: String): FileItem {
        val parentUri = documentUri(parent.treeUri, parent.documentId)
        val created = DocumentsContract.createDocument(resolver, parentUri, Document.MIME_TYPE_DIR, name)
            ?: throw FileAccessException("This folder doesn't allow creating new folders")
        return query(parent.treeUri, DocumentsContract.getDocumentId(created))
            ?: throw FileAccessException("The folder was created but can't be read")
    }

    fun createFile(parent: Location.Saf, name: String, mime: String): Uri {
        val parentUri = documentUri(parent.treeUri, parent.documentId)
        return DocumentsContract.createDocument(resolver, parentUri, mime, name)
            ?: throw FileAccessException("This folder doesn't allow creating files")
    }

    fun rename(item: FileItem, newName: String): FileItem {
        val tree = item.treeUri ?: throw FileAccessException("Can't rename this item")
        val newUri = DocumentsContract.renameDocument(resolver, item.uri, newName)
            ?: throw FileAccessException("The storage provider refused the rename")
        val newId = DocumentsContract.getDocumentId(newUri)
        return query(tree, newId) ?: item.copy(name = newName, uri = newUri, documentId = newId)
    }

    fun delete(item: FileItem) {
        val ok = DocumentsContract.deleteDocument(resolver, item.uri)
        if (!ok) throw FileAccessException("Couldn't delete ${item.name}")
    }

    /** True while the user's grant for this tree is still active. */
    fun hasPermission(treeUri: Uri): Boolean =
        resolver.persistedUriPermissions.any { it.uri == treeUri && it.isReadPermission }

    fun exists(item: FileItem): Boolean {
        val tree = item.treeUri ?: return false
        val id = item.documentId ?: return false
        return query(tree, id) != null
    }
}
