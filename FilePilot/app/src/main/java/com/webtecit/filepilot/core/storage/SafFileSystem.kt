package com.webtecit.filepilot.core.storage

import android.content.ContentResolver
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.DocumentsContract.Document
import java.io.InputStream
import java.io.OutputStream
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext

/**
 * Folders the user granted through Android's folder picker (Storage Access Framework):
 * SD cards and USB drives on any Android version, and any folder in limited mode.
 * Talks to DocumentsContract directly, which is much faster than DocumentFile for listings.
 */
class SafFileSystem(
    context: Context,
    private val io: CoroutineDispatcher,
) : FileSystem {

    private val resolver: ContentResolver = context.contentResolver

    override fun handles(id: String): Boolean = id.startsWith(PREFIX)

    override suspend fun list(dirId: String): List<FileItem> = withContext(io) {
        val uri = uriOf(dirId)
        val tree = treeOf(uri)
        val children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getDocumentId(uri))
        val cursor = guarded { resolver.query(children, PROJECTION, null, null, null) }
            ?: throw FsException(FsError.ACCESS_DENIED, "This folder can't be opened. Grant access again from Files.")
        cursor.use { c ->
            val result = ArrayList<FileItem>(c.count.coerceAtLeast(0))
            while (c.moveToNext()) {
                val docId = c.getString(0) ?: continue
                result += readItem(c, DocumentsContract.buildDocumentUriUsingTree(tree, docId))
            }
            result
        }
    }

    override suspend fun stat(id: String): FileItem? = withContext(io) {
        val uri = uriOf(id)
        val cursor = runCatching { resolver.query(uri, PROJECTION, null, null, null) }.getOrNull()
            ?: return@withContext null
        cursor.use { c -> if (c.moveToFirst()) readItem(c, uri) else null }
    }

    override fun parentId(id: String): String? {
        val uri = runCatching { uriOf(id) }.getOrNull() ?: return null
        val docId = runCatching { DocumentsContract.getDocumentId(uri) }.getOrNull() ?: return null
        val treeDocId = runCatching { DocumentsContract.getTreeDocumentId(uri) }.getOrNull() ?: return null
        if (docId == treeDocId) return null
        // Path-like ids ("primary:Download/Photos") are used by the system storage providers.
        val parentDoc = when {
            docId.contains('/') -> docId.substringBeforeLast('/')
            docId.contains(':') && !docId.endsWith(':') -> docId.substringBefore(':') + ":"
            else -> return null
        }
        val target = if (parentDoc.length < treeDocId.length) treeDocId else parentDoc
        return idOf(DocumentsContract.buildDocumentUriUsingTree(treeOf(uri), target))
    }

    override fun nameOf(id: String): String {
        val docId = runCatching { DocumentsContract.getDocumentId(uriOf(id)) }.getOrNull() ?: return id
        return docId.substringAfterLast('/').substringAfterLast(':').ifEmpty { docId }
    }

    override suspend fun createDirectory(parentId: String, name: String): FileItem = withContext(io) {
        NameRules.validate(name)?.let { throw FsException(FsError.INVALID_NAME, it) }
        if (childOfBlocking(parentId, name) != null) {
            throw FsException(FsError.ALREADY_EXISTS, "\"$name\" already exists here.")
        }
        val created = guarded { DocumentsContract.createDocument(resolver, uriOf(parentId), Document.MIME_TYPE_DIR, name) }
            ?: throw FsException(FsError.ACCESS_DENIED, "The folder couldn't be created here.")
        statBlocking(created) ?: throw FsException(FsError.IO, "The folder was created but can't be read.")
    }

    override suspend fun createFile(parentId: String, name: String): FileItem = withContext(io) {
        NameRules.validate(name)?.let { throw FsException(FsError.INVALID_NAME, it) }
        if (childOfBlocking(parentId, name) != null) {
            throw FsException(FsError.ALREADY_EXISTS, "\"$name\" already exists here.")
        }
        val created = guarded { DocumentsContract.createDocument(resolver, uriOf(parentId), FileTypes.mimeOf(name), name) }
            ?: throw FsException(FsError.ACCESS_DENIED, "The file couldn't be created here.")
        statBlocking(created) ?: throw FsException(FsError.IO, "The file was created but can't be read.")
    }

    override suspend fun rename(id: String, newName: String): FileItem = withContext(io) {
        NameRules.validate(newName)?.let { throw FsException(FsError.INVALID_NAME, it) }
        val uri = uriOf(id)
        val renamed = guarded { DocumentsContract.renameDocument(resolver, uri, newName) } ?: uri
        statBlocking(renamed) ?: throw FsException(FsError.IO, "The item was renamed but can't be read.")
    }

    override val nativeRecursiveDelete: Boolean = true

    override suspend fun delete(id: String) = withContext(io) {
        val ok = guarded { DocumentsContract.deleteDocument(resolver, uriOf(id)) }
        if (!ok) throw FsException(FsError.ACCESS_DENIED, "\"${nameOf(id)}\" couldn't be deleted.")
    }

    override suspend fun childOf(parentId: String, name: String): FileItem? = withContext(io) {
        childOfBlocking(parentId, name)
    }

    override fun openInput(id: String): InputStream =
        guarded { resolver.openInputStream(uriOf(id)) }
            ?: throw FsException(FsError.NOT_FOUND, "\"${nameOf(id)}\" can't be read.")

    override fun openOutput(id: String): OutputStream {
        val uri = uriOf(id)
        // "wt" truncates; a few providers only accept "w".
        val stream = runCatching { resolver.openOutputStream(uri, "wt") }.getOrNull()
            ?: guarded { resolver.openOutputStream(uri, "w") }
        return stream ?: throw FsException(FsError.ACCESS_DENIED, "\"${nameOf(id)}\" can't be written.")
    }

    override suspend fun moveFast(item: FileItem, targetParentId: String, newName: String): FileItem? =
        withContext(io) {
            val source = uriOf(item.id)
            val target = uriOf(targetParentId)
            if (source.authority != target.authority) return@withContext null
            val parent = parentId(item.id) ?: return@withContext null
            val moved = runCatching {
                DocumentsContract.moveDocument(resolver, source, uriOf(parent), target)
            }.getOrNull() ?: return@withContext null
            val result = statBlocking(moved) ?: return@withContext null
            if (result.name != newName) {
                val renamed = guarded { DocumentsContract.renameDocument(resolver, moved, newName) } ?: moved
                statBlocking(renamed)
            } else {
                result
            }
        }

    override suspend fun freeSpace(dirId: String): Long? = null

    override fun isAncestor(ancestorId: String, id: String): Boolean {
        if (ancestorId == id) return true
        val a = runCatching { uriOf(ancestorId) }.getOrNull() ?: return false
        val b = runCatching { uriOf(id) }.getOrNull() ?: return false
        if (a.authority != b.authority) return false
        val da = runCatching { DocumentsContract.getDocumentId(a) }.getOrNull() ?: return false
        val db = runCatching { DocumentsContract.getDocumentId(b) }.getOrNull() ?: return false
        if (da == db) return true
        val prefix = if (da.endsWith(":") || da.endsWith("/")) da else "$da/"
        return db.startsWith(prefix)
    }

    override fun displayPath(id: String): String {
        val docId = runCatching { DocumentsContract.getDocumentId(uriOf(id)) }.getOrNull() ?: return id
        val volume = docId.substringBefore(':', "")
        val path = docId.substringAfter(':', docId)
        val label = when {
            volume.equals("primary", ignoreCase = true) -> "Internal storage"
            volume.isNotEmpty() -> volume
            else -> ""
        }
        return listOf(label, path).filter { it.isNotEmpty() }.joinToString("/")
    }

    private fun childOfBlocking(parentId: String, name: String): FileItem? {
        val uri = uriOf(parentId)
        val tree = treeOf(uri)
        val children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getDocumentId(uri))
        val cursor = runCatching { resolver.query(children, PROJECTION, null, null, null) }.getOrNull() ?: return null
        cursor.use { c ->
            while (c.moveToNext()) {
                if (c.getString(1) == name) {
                    val docId = c.getString(0) ?: continue
                    return readItem(c, DocumentsContract.buildDocumentUriUsingTree(tree, docId))
                }
            }
        }
        return null
    }

    private fun statBlocking(uri: Uri): FileItem? {
        val cursor = runCatching { resolver.query(uri, PROJECTION, null, null, null) }.getOrNull() ?: return null
        return cursor.use { c -> if (c.moveToFirst()) readItem(c, uri) else null }
    }

    private fun readItem(c: Cursor, uri: Uri): FileItem {
        val name = c.getString(1) ?: "Unnamed"
        val mime = c.getString(2) ?: FileTypes.FALLBACK_MIME
        val isDir = mime == Document.MIME_TYPE_DIR
        return FileItem(
            id = idOf(uri),
            name = name,
            isDirectory = isDir,
            size = if (isDir || c.isNull(3)) 0L else c.getLong(3),
            lastModified = if (c.isNull(4)) 0L else c.getLong(4),
            mimeType = if (isDir) FileTypes.DIRECTORY_MIME else mime,
        )
    }

    private inline fun <T> guarded(block: () -> T): T = try {
        block()
    } catch (e: SecurityException) {
        throw FsException(FsError.ACCESS_DENIED, "Access to this location was removed. Grant access again from Files.", e)
    } catch (e: FsException) {
        throw e
    } catch (e: IllegalArgumentException) {
        throw FsException(FsError.NOT_FOUND, "This item no longer exists.", e)
    } catch (e: UnsupportedOperationException) {
        throw FsException(FsError.NOT_SUPPORTED, "This storage doesn't support that action.", e)
    } catch (e: java.io.IOException) {
        throw FsException(FsError.IO, e.userMessage(), e)
    }

    companion object {
        const val PREFIX = "saf:"

        private val PROJECTION = arrayOf(
            Document.COLUMN_DOCUMENT_ID,
            Document.COLUMN_DISPLAY_NAME,
            Document.COLUMN_MIME_TYPE,
            Document.COLUMN_SIZE,
            Document.COLUMN_LAST_MODIFIED,
        )

        fun idOf(uri: Uri): String = PREFIX + uri.toString()

        fun uriOf(id: String): Uri = Uri.parse(id.removePrefix(PREFIX))

        fun treeOf(uri: Uri): Uri =
            DocumentsContract.buildTreeDocumentUri(uri.authority, DocumentsContract.getTreeDocumentId(uri))

        /** The id of the top folder of a granted tree. */
        fun rootIdOf(treeUri: Uri): String =
            idOf(DocumentsContract.buildDocumentUriUsingTree(treeUri, DocumentsContract.getTreeDocumentId(treeUri)))
    }
}
