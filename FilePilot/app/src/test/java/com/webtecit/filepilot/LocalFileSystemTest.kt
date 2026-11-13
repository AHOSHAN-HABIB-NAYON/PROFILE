package com.webtecit.filepilot

import com.webtecit.filepilot.core.storage.FsError
import com.webtecit.filepilot.core.storage.FsException
import com.webtecit.filepilot.core.storage.LocalFileSystem
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class LocalFileSystemTest {
    @get:Rule val temp = TemporaryFolder()

    private val nio = LocalFileSystem(Dispatchers.IO, useNio = true)
    private val legacy = LocalFileSystem(Dispatchers.IO, useNio = false)

    @Test fun listsFilesWithMetadataInBothModes() = runBlocking {
        val root = temp.newFolder("root")
        File(root, "a.txt").writeText("hello")
        File(root, "sub").mkdir()
        File(root, ".hidden").writeText("x")
        for (fs in listOf(nio, legacy)) {
            val items = fs.list(root.absolutePath).associateBy { it.name }
            assertEquals(3, items.size)
            assertEquals(5L, items.getValue("a.txt").size)
            assertTrue(items.getValue("sub").isDirectory)
            assertTrue(items.getValue(".hidden").isHidden)
            assertEquals("text/plain", items.getValue("a.txt").mimeType)
        }
    }

    @Test fun reportsMissingFolders() = runBlocking {
        try {
            nio.list(File(temp.root, "missing").absolutePath)
            fail("expected an error")
        } catch (e: FsException) {
            assertEquals(FsError.NOT_FOUND, e.error)
        }
    }

    @Test fun createsRenamesAndDeletes() = runBlocking {
        val root = temp.newFolder("work").absolutePath
        val dir = nio.createDirectory(root, "Docs")
        val file = nio.createFile(dir.id, "notes.txt")
        assertTrue(File(file.id).exists())
        try {
            nio.createFile(dir.id, "notes.txt")
            fail("expected a conflict")
        } catch (e: FsException) {
            assertEquals(FsError.ALREADY_EXISTS, e.error)
        }
        try {
            nio.createFile(dir.id, "bad/name")
            fail("expected an invalid name")
        } catch (e: FsException) {
            assertEquals(FsError.INVALID_NAME, e.error)
        }
        val renamed = nio.rename(file.id, "todo.txt")
        assertEquals("todo.txt", renamed.name)
        assertFalse(File(file.id).exists())
        // Changing only the letter case works on case-insensitive storage too.
        val upper = nio.rename(renamed.id, "TODO.txt")
        assertEquals("TODO.txt", upper.name)
        assertTrue(File(dir.id, "TODO.txt").exists())
        nio.delete(upper.id)
        assertNull(nio.stat(upper.id))
        nio.delete(dir.id)
        assertNull(nio.stat(dir.id))
    }

    @Test fun refusesToDeleteNonEmptyFolderDirectly() = runBlocking {
        val dir = temp.newFolder("full")
        File(dir, "keep.txt").writeText("data")
        try {
            nio.delete(dir.absolutePath)
            fail("expected an error")
        } catch (e: FsException) {
            assertTrue(File(dir, "keep.txt").exists())
        }
    }

    @Test fun movesFastWithinTheSameVolume() = runBlocking {
        val a = temp.newFolder("a")
        val b = temp.newFolder("b")
        val f = File(a, "x.bin").apply { writeBytes(ByteArray(10)) }
        val item = nio.stat(f.absolutePath)!!
        val moved = nio.moveFast(item, b.absolutePath, "y.bin")!!
        assertEquals(File(b, "y.bin").absolutePath, moved.id)
        assertFalse(f.exists())
    }

    @Test fun detectsAncestors() {
        assertTrue(nio.isAncestor("/a/b", "/a/b/c"))
        assertTrue(nio.isAncestor("/a/b", "/a/b"))
        assertFalse(nio.isAncestor("/a/b", "/a/bc"))
        assertEquals("/a", nio.parentId("/a/b"))
    }

    @Test fun listsLargeFoldersQuickly() = runBlocking {
        val dir = temp.newFolder("large")
        repeat(10_000) { File(dir, "file_$it.txt").writeText("") }
        val start = System.nanoTime()
        val items = nio.list(dir.absolutePath)
        val ms = (System.nanoTime() - start) / 1_000_000
        assertEquals(10_000, items.size)
        assertTrue("Listing 10,000 files took $ms ms", ms < 10_000)
    }
}
