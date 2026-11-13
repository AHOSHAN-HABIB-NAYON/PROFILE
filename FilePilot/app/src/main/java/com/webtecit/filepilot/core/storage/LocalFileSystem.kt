package com.webtecit.filepilot.core.storage

import java.io.File
import java.io.FileInputStream
import java.io.FileNotFoundException
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.nio.file.Files
import java.nio.file.attribute.BasicFileAttributes
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Direct file access by absolute path. Works for everything with "All files access"
 * (Android 11+) or the storage permission (Android 6–10), and for the app's own folders.
 * Contains no Android classes, so it is covered by plain JVM unit tests.
 *
 * @param useNio read size, date and type with one system call per file (Android 8+).
 */
class LocalFileSystem(
    private val io: CoroutineDispatcher = Dispatchers.IO,
    private val useNio: Boolean = true,
) : FileSystem {

    override fun handles(id: String): Boolean = id.startsWith("/")

    override suspend fun list(dirId: String): List<FileItem> = withContext(io) {
        val dir = File(dirId)
        if (!dir.exists()) throw FsException(FsError.NOT_FOUND, "This folder no longer exists.")
        if (!dir.isDirectory) throw FsException(FsError.IO, "This item is not a folder.")
        val children = dir.listFiles()
            ?: throw FsException(
                FsError.ACCESS_DENIED,
                "Android doesn't allow FilePilot to open this folder. Grant storage access and try again.",
            )
        val result = ArrayList<FileItem>(children.size)
        for (child in children) {
            runCatching { toItem(child) }.getOrNull()?.let(result::add)
        }
        result
    }

    override suspend fun stat(id: String): FileItem? = withContext(io) {
        val f = File(id)
        if (f.exists()) toItem(f) else null
    }

    override fun parentId(id: String): String? = File(id).parent

    override fun nameOf(id: String): String = File(id).name.ifEmpty { id }

    override suspend fun createDirectory(parentId: String, name: String): FileItem = withContext(io) {
        checkName(name)
        val target = File(parentId, name)
        if (target.exists()) throw FsException(FsError.ALREADY_EXISTS, "\"$name\" already exists here.")
        if (!target.mkdir()) throw writeDenied(parentId)
        toItem(target)
    }

    override suspend fun createFile(parentId: String, name: String): FileItem = withContext(io) {
        checkName(name)
        val target = File(parentId, name)
        if (target.exists()) throw FsException(FsError.ALREADY_EXISTS, "\"$name\" already exists here.")
        val created = try {
            target.createNewFile()
        } catch (e: java.io.IOException) {
            throw writeDenied(parentId, e)
        }
        if (!created) throw writeDenied(parentId)
        toItem(target)
    }

    override suspend fun rename(id: String, newName: String): FileItem = withContext(io) {
        checkName(newName)
        val source = File(id)
        if (!source.exists()) throw FsException(FsError.NOT_FOUND, "\"${source.name}\" no longer exists.")
        val target = File(source.parentFile, newName)
        if (source.name == newName) return@withContext toItem(source)
        val caseOnly = source.name.equals(newName, ignoreCase = true)
        if (target.exists() && !caseOnly) {
            throw FsException(FsError.ALREADY_EXISTS, "\"$newName\" already exists here.")
        }
        val ok = if (caseOnly) {
            // Case-insensitive storage: rename through a temporary name.
            val temp = File(source.parentFile, ".fmp-rename-${System.nanoTime()}")
            source.renameTo(temp) && temp.renameTo(target)
        } else {
            source.renameTo(target)
        }
        if (!ok) throw writeDenied(source.parent ?: id)
        toItem(target)
    }

    override val nativeRecursiveDelete: Boolean = false

    override suspend fun delete(id: String) = withContext(io) {
        val f = File(id)
        if (!f.exists()) return@withContext
        if (!f.delete()) {
            if (f.isDirectory && !f.list().isNullOrEmpty()) {
                throw FsException(FsError.IO, "\"${f.name}\" still contains files that couldn't be deleted.")
            }
            throw writeDenied(f.parent ?: id)
        }
    }

    override suspend fun childOf(parentId: String, name: String): FileItem? = withContext(io) {
        val f = File(parentId, name)
        if (f.exists()) toItem(f) else null
    }

    override fun openInput(id: String): InputStream = try {
        FileInputStream(File(id))
    } catch (e: FileNotFoundException) {
        throw FsException(FsError.NOT_FOUND, e.userMessage(), e)
    }

    override fun openOutput(id: String): OutputStream = try {
        FileOutputStream(File(id), false)
    } catch (e: FileNotFoundException) {
        throw writeDenied(File(id).parent ?: id, e)
    }

    override suspend fun moveFast(item: FileItem, targetParentId: String, newName: String): FileItem? =
        withContext(io) {
            val source = File(item.id)
            val target = File(targetParentId, newName)
            if (target.exists()) throw FsException(FsError.ALREADY_EXISTS, "\"$newName\" already exists here.")
            // renameTo only succeeds on the same storage volume; otherwise the caller copies.
            if (source.renameTo(target)) toItem(target) else null
        }

    override suspend fun freeSpace(dirId: String): Long? = withContext(io) {
        File(dirId).usableSpace.takeIf { it > 0 }
    }

    override fun isAncestor(ancestorId: String, id: String): Boolean {
        val a = ancestorId.trimEnd('/')
        return id == ancestorId || id == a || id.startsWith("$a/")
    }

    override suspend fun setLastModified(id: String, time: Long) {
        withContext(io) { if (time > 0) File(id).setLastModified(time) }
    }

    override fun displayPath(id: String): String = id

    private fun toItem(f: File): FileItem {
        if (useNio) {
            val attrs = runCatching { Files.readAttributes(f.toPath(), BasicFileAttributes::class.java) }.getOrNull()
            if (attrs != null) {
                val dir = attrs.isDirectory
                return FileItem(
                    id = f.absolutePath,
                    name = f.name.ifEmpty { f.absolutePath },
                    isDirectory = dir,
                    size = if (dir) 0L else attrs.size(),
                    lastModified = attrs.lastModifiedTime().toMillis(),
                    mimeType = if (dir) FileTypes.DIRECTORY_MIME else FileTypes.mimeOf(f.name),
                )
            }
        }
        val dir = f.isDirectory
        return FileItem(
            id = f.absolutePath,
            name = f.name.ifEmpty { f.absolutePath },
            isDirectory = dir,
            size = if (dir) 0L else f.length(),
            lastModified = f.lastModified(),
            mimeType = if (dir) FileTypes.DIRECTORY_MIME else FileTypes.mimeOf(f.name),
        )
    }

    private fun checkName(name: String) {
        NameRules.validate(name)?.let { throw FsException(FsError.INVALID_NAME, it) }
    }

    private fun writeDenied(dirId: String, cause: Throwable? = null): FsException {
        val noSpace = cause?.message?.contains("ENOSPC") == true
        return if (noSpace) FsException(FsError.NO_SPACE, "There isn't enough free space.", cause)
        else FsException(
            FsError.ACCESS_DENIED,
            "Android doesn't allow changes in \"${File(dirId).name.ifEmpty { dirId }}\". " +
                "On an SD card or USB drive, add it under Files → Add storage.",
            cause,
        )
    }
}
