package com.filepilot.app.data.files

import android.content.Context
import android.media.MediaScannerConnection
import android.net.Uri
import com.filepilot.app.core.model.FileItem
import com.filepilot.app.core.model.Location
import com.filepilot.app.core.model.SourceKind
import com.filepilot.app.core.util.FileNames
import com.filepilot.app.core.util.MimeTypes
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** One entry point for listing and changing files, whatever their source. */
class FileRepository(private val context: Context) {
    val resolver: android.content.ContentResolver = context.contentResolver
    val saf = SafFiles(resolver)
    val media = MediaFiles(resolver)

    suspend fun list(location: Location, showHidden: Boolean): List<FileItem> = withContext(Dispatchers.IO) {
        when (location) {
            is Location.Local -> LocalFiles.list(location.path, showHidden)
            is Location.Saf -> saf.list(location, showHidden)
        }
    }

    fun canWriteTo(location: Location): Boolean = when (location) {
        is Location.Local -> File(location.path).canWrite()
        is Location.Saf -> saf.query(location.treeUri, location.documentId)?.canWrite ?: false
    }

    suspend fun createFolder(location: Location, rawName: String): FileItem = withContext(Dispatchers.IO) {
        val name = rawName.trim()
        FileNames.validate(name)?.let { throw FileAccessException(it) }
        when (location) {
            is Location.Local -> {
                val dir = File(location.path, name)
                if (dir.exists()) throw FileAccessException("An item with this name already exists")
                if (!LocalFiles.isInside(File(location.path), dir)) throw FileAccessException("Invalid folder name")
                if (!dir.mkdir()) throw FileAccessException(writeDeniedMessage(location.path))
                LocalFiles.toItem(dir)
            }
            is Location.Saf -> {
                if (name.lowercase() in saf.childNames(location)) throw FileAccessException("An item with this name already exists")
                saf.createDirectory(location, name)
            }
        }
    }

    suspend fun rename(item: FileItem, rawName: String): FileItem = withContext(Dispatchers.IO) {
        val name = rawName.trim()
        FileNames.validate(name)?.let { throw FileAccessException(it) }
        if (name == item.name) return@withContext item
        when (item.source) {
            SourceKind.LOCAL -> {
                val src = File(item.path ?: throw FileAccessException("Can't rename this item"))
                val parent = src.parentFile ?: throw FileAccessException("Can't rename this item")
                val dst = File(parent, name)
                if (!LocalFiles.isInside(parent, dst)) throw FileAccessException("Invalid name")
                // Allow case-only renames on case-insensitive storage.
                if (dst.exists() && !dst.absolutePath.equals(src.absolutePath, ignoreCase = true)) {
                    throw FileAccessException("An item with this name already exists")
                }
                if (!src.renameTo(dst)) throw FileAccessException(writeDeniedMessage(parent.path))
                scan(listOf(src.absolutePath, dst.absolutePath))
                LocalFiles.toItem(dst)
            }
            SourceKind.SAF -> saf.rename(item, name)
            SourceKind.MEDIA -> throw FileAccessException(MEDIA_READ_ONLY)
        }
    }

    suspend fun exists(item: FileItem): Boolean = withContext(Dispatchers.IO) {
        when (item.source) {
            SourceKind.LOCAL -> item.path?.let { File(it).exists() } ?: false
            SourceKind.SAF -> saf.exists(item)
            SourceKind.MEDIA -> media.exists(item.uri)
        }
    }

    /** Fresh metadata for an item (e.g. after returning from another app). */
    suspend fun refresh(item: FileItem): FileItem? = withContext(Dispatchers.IO) {
        when (item.source) {
            SourceKind.LOCAL -> item.path?.let { File(it) }?.takeIf { it.exists() }?.let { LocalFiles.toItem(it) }
            SourceKind.SAF -> item.treeUri?.let { t -> item.documentId?.let { saf.query(t, it) } }
            SourceKind.MEDIA -> if (media.exists(item.uri)) item else null
        }
    }

    fun openInput(item: FileItem): InputStream = when (item.source) {
        SourceKind.LOCAL -> FileInputStream(File(item.path ?: throw FileAccessException("Missing path")))
        else -> resolver.openInputStream(item.uri) ?: throw FileAccessException("Can't open ${item.name}")
    }

    /** A writable handle for [location], used by copy, extract and compress. */
    fun dirHandle(location: Location): DirHandle = when (location) {
        is Location.Local -> LocalDir(File(location.path))
        is Location.Saf -> SafDir(this, location)
    }

    /** Tell MediaStore about changed paths so categories and other apps stay accurate. */
    fun scan(paths: List<String>) {
        if (paths.isEmpty()) return
        runCatching { MediaScannerConnection.scanFile(context, paths.toTypedArray(), null, null) }
    }

    fun writeDeniedMessage(path: String): String {
        val onRemovable = !path.startsWith(LocalFiles.primaryRoot)
        return if (onRemovable && android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.R) {
            "Android doesn't let apps change SD card files directly on this version. Add the SD card in Browse → Add folder to make changes."
        } else {
            "FilePilot doesn't have permission to change this location"
        }
    }

    companion object {
        const val MEDIA_READ_ONLY =
            "This file is available read-only through media access. Allow full file access to change it."
    }
}

/** A folder that can receive new files. Names are never overwritten; collisions get " (1)" suffixes. */
interface DirHandle {
    val displayName: String
    fun exists(name: String): Boolean
    fun uniqueName(name: String, isDirectory: Boolean): String = FileNames.unique(name, isDirectory) { exists(it) }
    /** Creates (or reuses, when [reuse] is true) a child folder. */
    fun childDir(name: String, reuse: Boolean = false): DirHandle
    fun createFile(name: String, mime: String): Pair<OutputStream, CreatedFile>
    fun location(): Location
    fun freeBytes(): Long
}

/** A file created by a [DirHandle], so a partial file can be removed if the operation fails. */
interface CreatedFile {
    val path: String?
    fun delete()
}

class LocalDir(val dir: File) : DirHandle {
    override val displayName: String get() = dir.name
    override fun exists(name: String) = File(dir, name).exists()

    override fun childDir(name: String, reuse: Boolean): DirHandle {
        val safe = FileNames.sanitize(name)
        val target = File(dir, if (reuse) safe else uniqueName(safe, true))
        if (!LocalFiles.isInside(dir, target)) throw FileAccessException("Blocked an unsafe folder name")
        if (!target.exists() && !target.mkdirs()) throw FileAccessException("Couldn't create folder ${target.name}")
        if (!target.isDirectory) throw FileAccessException("${target.name} exists and is not a folder")
        return LocalDir(target)
    }

    override fun createFile(name: String, mime: String): Pair<OutputStream, CreatedFile> {
        val safe = FileNames.sanitize(name)
        val target = File(dir, uniqueName(safe, false))
        if (!LocalFiles.isInside(dir, target)) throw FileAccessException("Blocked an unsafe file name")
        val out = FileOutputStream(target)
        return out to object : CreatedFile {
            override val path: String = target.absolutePath
            override fun delete() {
                target.delete()
            }
        }
    }

    override fun location(): Location = Location.Local(dir.absolutePath)
    override fun freeBytes(): Long = runCatching { dir.usableSpace }.getOrDefault(-1L)
}

class SafDir(private val repo: FileRepository, private val loc: Location.Saf) : DirHandle {
    private val names: MutableSet<String> by lazy { repo.saf.childNames(loc).toMutableSet() }
    override val displayName: String get() = loc.name
    override fun exists(name: String) = name.lowercase() in names

    override fun childDir(name: String, reuse: Boolean): DirHandle {
        val safe = FileNames.sanitize(name)
        if (reuse && exists(safe)) {
            val existing = repo.saf.list(loc, showHidden = true).firstOrNull { it.isDirectory && it.name.equals(safe, true) }
            if (existing != null) return SafDir(repo, Location.Saf(loc.treeUri, existing.documentId!!, existing.name))
        }
        val finalName = uniqueName(safe, true)
        val created = repo.saf.createDirectory(loc, finalName)
        names.add(created.name.lowercase())
        return SafDir(repo, Location.Saf(loc.treeUri, created.documentId!!, created.name))
    }

    override fun createFile(name: String, mime: String): Pair<OutputStream, CreatedFile> {
        val safe = FileNames.sanitize(name)
        val finalName = uniqueName(safe, false)
        val uri: Uri = repo.saf.createFile(loc, finalName, mime.ifBlank { MimeTypes.UNKNOWN })
        names.add(finalName.lowercase())
        val resolver = repo.resolver
        val out = resolver.openOutputStream(uri, "w") ?: throw FileAccessException("Can't write $finalName")
        return out to object : CreatedFile {
            override val path: String? = null
            override fun delete() {
                runCatching { android.provider.DocumentsContract.deleteDocument(resolver, uri) }
            }
        }
    }

    override fun location(): Location = loc
    override fun freeBytes(): Long = -1L
}
