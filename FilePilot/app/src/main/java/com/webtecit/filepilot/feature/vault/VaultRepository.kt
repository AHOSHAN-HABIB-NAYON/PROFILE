package com.webtecit.filepilot.feature.vault

import android.content.Context
import android.os.Environment
import com.webtecit.filepilot.core.common.IoDispatcher
import com.webtecit.filepilot.core.database.VaultDao
import com.webtecit.filepilot.core.database.VaultEntity
import com.webtecit.filepilot.core.security.ChunkedCipher
import com.webtecit.filepilot.core.security.VaultKeys
import com.webtecit.filepilot.core.storage.FileItem
import com.webtecit.filepilot.core.storage.FileSystems
import com.webtecit.filepilot.core.storage.NameRules
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.io.InputStream
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext

/** Encrypted files live in the app's private storage, unreadable by other apps and by FilePilot without the keys. */
@Singleton
class VaultRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val dao: VaultDao,
    private val fileSystems: FileSystems,
    @IoDispatcher private val io: CoroutineDispatcher,
) {
    val items = dao.all()
    private val dir get() = File(context.filesDir, "vault").apply { mkdirs() }
    private val openDir get() = File(context.cacheDir, "vault_open").apply { mkdirs() }

    suspend fun add(name: String, mime: String, input: InputStream): VaultEntity = withContext(io) {
        val id = UUID.randomUUID().toString()
        val target = File(dir, "$id.fpv")
        val key = ChunkedCipher.newDataKey()
        var size = 0L
        try {
            input.use { inp -> target.outputStream().use { out -> ChunkedCipher.encrypt(inp, out, key, VaultKeys.wrap(key)) { size = it } } }
        } catch (e: Throwable) {
            target.delete()
            throw e
        }
        VaultEntity(id, name, size, mime, System.currentTimeMillis()).also { dao.upsert(it) }
    }

    /** Encrypts files from storage into the vault and deletes the originals only after success. */
    suspend fun importItems(items: List<FileItem>): Int {
        var count = 0
        for (item in items.filter { !it.isDirectory }) {
            val fs = fileSystems.of(item.id)
            add(item.name, item.mimeType, fs.openInput(item.id))
            fs.delete(item.id)
            count++
        }
        return count
    }

    private suspend fun decryptTo(entry: VaultEntity, target: File) = withContext(io) {
        File(dir, "${entry.id}.fpv").inputStream().buffered().use { inp ->
            val key = VaultKeys.unwrap(ChunkedCipher.readHeader(inp))
            target.outputStream().use { out -> ChunkedCipher.decrypt(inp, out, key) }
        }
    }

    /** Decrypts into a private cache file for viewing; cleared each time the vault is locked. */
    suspend fun openCopy(entry: VaultEntity): File {
        val f = File(openDir, entry.name)
        decryptTo(entry, f)
        return f
    }

    /** Restores a file to Download/FilePilot Restored and removes it from the vault. */
    suspend fun export(entry: VaultEntity, removeFromVault: Boolean): File {
        val outDir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "FilePilot Restored").apply { mkdirs() }
        val target = File(outDir, NameRules.uniqueName(entry.name, outDir.list()?.toList().orEmpty()))
        try {
            decryptTo(entry, target)
        } catch (e: Throwable) {
            target.delete()
            throw e
        }
        if (removeFromVault) delete(entry)
        return target
    }

    suspend fun delete(entry: VaultEntity) = withContext(io) {
        File(dir, "${entry.id}.fpv").delete()
        dao.delete(entry.id)
    }

    fun clearOpenCopies() {
        openDir.listFiles()?.forEach { it.delete() }
    }
}
