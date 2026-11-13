package com.webtecit.filepilot.core.storage

import java.io.InputStream
import java.io.OutputStream

/**
 * One storage backend. Every function does blocking work on an I/O dispatcher and reports
 * problems as [FsException] with a message that can be shown to the user.
 */
interface FileSystem {
    fun handles(id: String): Boolean

    suspend fun list(dirId: String): List<FileItem>

    /** The item, or null when it doesn't exist. */
    suspend fun stat(id: String): FileItem?

    /** The containing folder, or null at the top of this backend (or when it can't be derived). */
    fun parentId(id: String): String?

    /** A best-effort name derived from the id alone, without I/O. */
    fun nameOf(id: String): String

    suspend fun createDirectory(parentId: String, name: String): FileItem

    suspend fun createFile(parentId: String, name: String): FileItem

    suspend fun rename(id: String, newName: String): FileItem

    /** Deletes a file or folder. Folders must be empty unless [nativeRecursiveDelete] is true. */
    suspend fun delete(id: String)

    /** True when [delete] removes a folder together with its contents. */
    val nativeRecursiveDelete: Boolean

    suspend fun childOf(parentId: String, name: String): FileItem?

    fun openInput(id: String): InputStream

    /** Opens the file for writing, replacing its content. */
    fun openOutput(id: String): OutputStream

    /** Moves without copying data when the backend allows it; null means "copy instead". */
    suspend fun moveFast(item: FileItem, targetParentId: String, newName: String): FileItem?

    /** Free space for new files in [dirId], or null when unknown. */
    suspend fun freeSpace(dirId: String): Long?

    /** True when [id] is [ancestorId] or somewhere inside it. */
    fun isAncestor(ancestorId: String, id: String): Boolean

    suspend fun setLastModified(id: String, time: Long) {}

    /** A path for display, such as "/storage/emulated/0/Download". */
    fun displayPath(id: String): String
}

/** Finds the backend responsible for an id. */
interface FileSystemResolver {
    fun of(id: String): FileSystem
}
