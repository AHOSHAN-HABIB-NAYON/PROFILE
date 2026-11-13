package com.webtecit.filepilot.data

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import com.webtecit.filepilot.core.common.IoDispatcher
import com.webtecit.filepilot.core.database.LibraryDao
import com.webtecit.filepilot.core.database.SafRootEntity
import com.webtecit.filepilot.core.storage.SafFileSystem
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext

data class SafRoot(
    val treeUri: String,
    val label: String,
    /** Id of the top folder, usable with the file backends. */
    val rootId: String,
    /** False when Android no longer holds the permission (for example, the SD card was replaced). */
    val accessible: Boolean,
)

/** Folders, SD cards and USB drives the user granted through the system folder picker. */
@Singleton
class SafRootsRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val dao: LibraryDao,
    @IoDispatcher private val io: CoroutineDispatcher,
) {
    val roots: Flow<List<SafRoot>> = dao.safRoots().map { list ->
        val granted = context.contentResolver.persistedUriPermissions.mapTo(HashSet()) { it.uri.toString() }
        list.mapNotNull { e ->
            val uri = Uri.parse(e.treeUri)
            val rootId = runCatching { SafFileSystem.rootIdOf(uri) }.getOrNull() ?: return@mapNotNull null
            SafRoot(e.treeUri, e.label, rootId, e.treeUri in granted)
        }
    }

    /** Stores a tree returned by ACTION_OPEN_DOCUMENT_TREE and keeps access across restarts. */
    suspend fun add(treeUri: Uri): SafRoot = withContext(io) {
        val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        runCatching { context.contentResolver.takePersistableUriPermission(treeUri, flags) }
            .recoverCatching {
                context.contentResolver.takePersistableUriPermission(treeUri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        val label = labelOf(treeUri)
        dao.upsertSafRoot(SafRootEntity(treeUri.toString(), label, System.currentTimeMillis()))
        SafRoot(treeUri.toString(), label, SafFileSystem.rootIdOf(treeUri), true)
    }

    suspend fun remove(treeUri: String) = withContext(io) {
        val uri = Uri.parse(treeUri)
        runCatching {
            context.contentResolver.releasePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
            )
        }
        dao.deleteSafRoot(treeUri)
    }

    private fun labelOf(treeUri: Uri): String {
        val docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, DocumentsContract.getTreeDocumentId(treeUri))
        val name = runCatching {
            context.contentResolver.query(docUri, arrayOf(DocumentsContract.Document.COLUMN_DISPLAY_NAME), null, null, null)
                ?.use { c -> if (c.moveToFirst()) c.getString(0) else null }
        }.getOrNull()
        return name?.takeIf { it.isNotBlank() } ?: DocumentsContract.getTreeDocumentId(treeUri).substringAfterLast(':')
            .ifBlank { "Granted folder" }
    }
}
