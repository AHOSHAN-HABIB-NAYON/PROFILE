package com.webtecit.filepilot

import com.webtecit.filepilot.core.operations.ConflictPolicy
import com.webtecit.filepilot.core.operations.FileOperation
import com.webtecit.filepilot.core.operations.FileOperationManager
import com.webtecit.filepilot.core.operations.OperationStatus
import com.webtecit.filepilot.core.storage.FileItem
import com.webtecit.filepilot.core.storage.FileSystem
import com.webtecit.filepilot.core.storage.FileSystemResolver
import com.webtecit.filepilot.core.storage.LocalFileSystem
import java.io.File
import java.io.FilterInputStream
import java.io.InputStream
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class FileOperationManagerTest {
    @get:Rule val temp = TemporaryFolder()

    private val local = LocalFileSystem(Dispatchers.IO, useNio = true)

    private fun manager(fs: FileSystem = local) = FileOperationManager(
        resolver = object : FileSystemResolver {
            override fun of(id: String): FileSystem = fs
        },
        scope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
        io = Dispatchers.IO,
    )

    private fun await(m: FileOperationManager, id: Long): FileOperation = runBlocking {
        withTimeout(60_000) {
            m.operations.first { ops -> ops.firstOrNull { it.id == id }?.status?.finished == true }.first { it.id == id }
        }
    }

    private fun item(f: File): FileItem = runBlocking { local.stat(f.absolutePath)!! }

    private fun tree(root: File) {
        File(root, "a.txt").writeText("alpha")
        File(root, "nested/deeper").mkdirs()
        File(root, "nested/b.bin").writeBytes(ByteArray(300_000) { it.toByte() })
        File(root, "nested/deeper/c.txt").writeText("charlie")
    }

    private fun noTempFiles(dir: File) =
        dir.walkTopDown().none { it.name.contains(".fmp-part") || it.name.contains(".fmp-old") }

    @Test fun copiesFoldersRecursivelyWithProgress() {
        val src = temp.newFolder("src")
        tree(src)
        val dst = temp.newFolder("dst")
        val m = manager()
        val op = await(m, m.transfer(listOf(item(src)), dst.absolutePath, move = false, policy = ConflictPolicy.KEEP_BOTH))
        assertEquals(OperationStatus.COMPLETED, op.status)
        assertEquals("charlie", File(dst, "src/nested/deeper/c.txt").readText())
        assertArrayEquals(File(src, "nested/b.bin").readBytes(), File(dst, "src/nested/b.bin").readBytes())
        assertEquals(op.totalBytes, op.doneBytes)
        assertTrue(File(src, "a.txt").exists())
        assertTrue(noTempFiles(dst))
    }

    @Test fun movesAndRemovesTheSource() {
        val src = temp.newFolder("src")
        tree(src)
        val dst = temp.newFolder("dst")
        val m = manager()
        val op = await(m, m.transfer(listOf(item(src)), dst.absolutePath, move = true, policy = ConflictPolicy.KEEP_BOTH))
        assertEquals(OperationStatus.COMPLETED, op.status)
        assertFalse(src.exists())
        assertEquals("alpha", File(dst, "src/a.txt").readText())
    }

    @Test fun keepBothRenamesTheCopy() {
        val src = temp.newFolder("src")
        val file = File(src, "doc.txt").apply { writeText("new") }
        val dst = temp.newFolder("dst")
        File(dst, "doc.txt").writeText("old")
        val m = manager()
        await(m, m.transfer(listOf(item(file)), dst.absolutePath, move = false, policy = ConflictPolicy.KEEP_BOTH))
        assertEquals("old", File(dst, "doc.txt").readText())
        assertEquals("new", File(dst, "doc (1).txt").readText())
    }

    @Test fun replaceOverwritesSafely() {
        val src = temp.newFolder("src")
        val file = File(src, "doc.txt").apply { writeText("new content") }
        val dst = temp.newFolder("dst")
        File(dst, "doc.txt").writeText("old")
        val m = manager()
        val op = await(m, m.transfer(listOf(item(file)), dst.absolutePath, move = false, policy = ConflictPolicy.REPLACE))
        assertEquals(OperationStatus.COMPLETED, op.status)
        assertEquals("new content", File(dst, "doc.txt").readText())
        assertEquals(1, dst.listFiles()!!.size)
        assertTrue(noTempFiles(dst))
    }

    @Test fun replaceMergesFolders() {
        val src = temp.newFolder("src", "photos")
        File(src, "1.jpg").writeText("new1")
        File(src, "2.jpg").writeText("new2")
        val dstRoot = temp.newFolder("dst")
        val existing = File(dstRoot, "photos").apply { mkdirs() }
        File(existing, "1.jpg").writeText("old1")
        File(existing, "3.jpg").writeText("old3")
        val m = manager()
        await(m, m.transfer(listOf(item(src)), dstRoot.absolutePath, move = false, policy = ConflictPolicy.REPLACE))
        assertEquals("new1", File(existing, "1.jpg").readText())
        assertEquals("new2", File(existing, "2.jpg").readText())
        assertEquals("old3", File(existing, "3.jpg").readText())
    }

    @Test fun skipLeavesExistingItems() {
        val src = temp.newFolder("src")
        val file = File(src, "doc.txt").apply { writeText("new") }
        val dst = temp.newFolder("dst")
        File(dst, "doc.txt").writeText("old")
        val m = manager()
        val op = await(m, m.transfer(listOf(item(file)), dst.absolutePath, move = true, policy = ConflictPolicy.SKIP))
        assertEquals(OperationStatus.COMPLETED, op.status)
        assertEquals("old", File(dst, "doc.txt").readText())
        assertTrue("A skipped move keeps the source", file.exists())
    }

    @Test fun copyingIntoTheSameFolderMakesACopy() {
        val dir = temp.newFolder("dir")
        val file = File(dir, "a.txt").apply { writeText("x") }
        val m = manager()
        await(m, m.transfer(listOf(item(file)), dir.absolutePath, move = false, policy = ConflictPolicy.KEEP_BOTH))
        assertTrue(File(dir, "a (1).txt").exists())
        // "Replace" with itself must never destroy the original.
        await(m, m.transfer(listOf(item(file)), dir.absolutePath, move = false, policy = ConflictPolicy.REPLACE))
        assertEquals("x", file.readText())
    }

    @Test fun refusesToCopyAFolderIntoItself() {
        val src = temp.newFolder("src")
        tree(src)
        val m = manager()
        val op = await(m, m.transfer(listOf(item(src)), File(src, "nested").absolutePath, move = false, policy = ConflictPolicy.KEEP_BOTH))
        assertEquals(OperationStatus.FAILED, op.status)
        assertEquals(1, op.errors.size)
        assertFalse(File(src, "nested/src").exists())
    }

    @Test fun deletesFoldersRecursively() {
        val src = temp.newFolder("src")
        tree(src)
        val m = manager()
        val op = await(m, m.delete(listOf(item(src))))
        assertEquals(OperationStatus.COMPLETED, op.status)
        assertFalse(src.exists())
        assertEquals(op.totalItems, op.doneItems)
        assertEquals(listOf(src.absolutePath), op.succeededIds)
    }

    @Test fun cancellingRemovesThePartlyCopiedFile() {
        val src = temp.newFolder("src")
        val big = File(src, "big.bin").apply { writeBytes(ByteArray(8_000_000)) }
        val dst = temp.newFolder("dst")
        val slow = SlowFileSystem(local)
        val m = manager(slow)
        val id = m.transfer(listOf(item(big)), dst.absolutePath, move = false, policy = ConflictPolicy.KEEP_BOTH)
        runBlocking {
            withTimeout(30_000) { m.operations.first { ops -> (ops.firstOrNull { it.id == id }?.doneBytes ?: 0) > 0 } }
        }
        m.cancel(id)
        val op = await(m, id)
        assertEquals(OperationStatus.CANCELLED, op.status)
        Thread.sleep(200)
        assertTrue("Nothing is left behind: ${dst.list()?.toList()}", dst.listFiles()!!.isEmpty())
        assertTrue(big.exists())
    }

    @Test fun copiesLargeFilesIntact() {
        val src = temp.newFolder("src")
        val data = ByteArray(24_000_000) { (it * 31).toByte() }
        val big = File(src, "video.mp4").apply { writeBytes(data) }
        val dst = temp.newFolder("dst")
        val m = manager()
        val op = await(m, m.transfer(listOf(item(big)), dst.absolutePath, move = false, policy = ConflictPolicy.KEEP_BOTH))
        assertEquals(OperationStatus.COMPLETED, op.status)
        assertArrayEquals(data, File(dst, "video.mp4").readBytes())
        assertEquals(big.lastModified() / 1000, File(dst, "video.mp4").lastModified() / 1000)
    }

    /** Reads slowly so a test can cancel in the middle of a copy. */
    private class SlowFileSystem(private val inner: LocalFileSystem) : FileSystem by inner {
        override fun openInput(id: String): InputStream = object : FilterInputStream(inner.openInput(id)) {
            override fun read(b: ByteArray, off: Int, len: Int): Int {
                Thread.sleep(20)
                return super.read(b, off, minOf(len, 64 * 1024))
            }
        }
    }
}
