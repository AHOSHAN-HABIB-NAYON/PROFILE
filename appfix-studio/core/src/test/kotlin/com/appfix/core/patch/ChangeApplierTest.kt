package com.appfix.core.patch

import com.appfix.core.TestFixtures
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.File

class ChangeApplierTest {
    private val root = TestFixtures.tempDir()
    private val ws = File(root, "ws").apply { mkdirs() }
    private val applier = ChangeApplier(ws, File(root, "history"))

    @Test
    fun `apply and undo modify, create and delete`() {
        File(ws, "a.txt").writeText("one\ntwo\n")
        File(ws, "gone.txt").writeText("bye")
        val set = ChangeSet(title = "t", source = "test", changes = listOf(
            FileChange("a.txt", "one\ntwo\n", "one\n2\n"),
            FileChange("new/dir/b.txt", null, "hello"),
            FileChange("gone.txt", "bye", null),
        ))
        applier.apply(set)
        assertEquals("one\n2\n", File(ws, "a.txt").readText())
        assertEquals("hello", File(ws, "new/dir/b.txt").readText())
        assertFalse(File(ws, "gone.txt").exists())
        assertEquals(ChangeState.APPLIED, applier.history().single().state)

        applier.undo(set.id)
        assertEquals("one\ntwo\n", File(ws, "a.txt").readText())
        assertFalse(File(ws, "new").exists())
        assertEquals("bye", File(ws, "gone.txt").readText())
        assertEquals(ChangeState.UNDONE, applier.history().single().state)
    }

    @Test
    fun `stale proposals are rejected instead of overwriting newer edits`() {
        File(ws, "a.txt").writeText("edited elsewhere")
        val set = ChangeSet(title = "t", source = "test", changes = listOf(FileChange("a.txt", "original", "proposal")))
        try { applier.apply(set); fail() } catch (e: ChangeConflictException) {
            assertTrue(e.message!!.contains("changed since"))
        }
        assertEquals("edited elsewhere", File(ws, "a.txt").readText())
    }

    @Test
    fun `undo refuses when the file was edited after the change`() {
        File(ws, "a.txt").writeText("v1")
        val set = ChangeSet(title = "t", source = "test", changes = listOf(FileChange("a.txt", "v1", "v2")))
        applier.apply(set)
        File(ws, "a.txt").writeText("v3")
        try { applier.undo(set.id); fail() } catch (e: ChangeConflictException) {}
        applier.undo(set.id, force = true)
        assertEquals("v1", File(ws, "a.txt").readText())
    }

    @Test
    fun `paths outside the workspace are rejected`() {
        for (p in listOf("../escape.txt", "/etc/passwd", "a/../../x", "C:\\x")) {
            val set = ChangeSet(title = "t", source = "ai", changes = listOf(FileChange(p, null, "x")))
            assertTrue(p, applier.validate(set).any { it.startsWith("Unsafe path") })
            try { applier.apply(set); fail(p) } catch (e: ChangeConflictException) {}
        }
        assertFalse(File(root, "escape.txt").exists())
    }

    @Test
    fun `binary changes are supported`() {
        val bytes = byteArrayOf(1, 2, 3, 0, 5)
        val b64 = java.util.Base64.getEncoder().encodeToString(bytes)
        val set = ChangeSet(title = "icon", source = "test", changes = listOf(FileChange("res/icon.png", null, b64, isBinary = true)))
        applier.apply(set)
        assertTrue(File(ws, "res/icon.png").readBytes().contentEquals(bytes))
        assertTrue(Diff.unified(set).startsWith("Binary file"))
    }

    @Test
    fun `diffs describe the change`() {
        val change = FileChange("a.kt", "a\nb\nc\nd\ne\nf\ng\nh\ni\nj", "a\nb\nC\nd\ne\nf\ng\nh\ni\nj\nk")
        val d = Diff.structured(change, context = 1)
        assertEquals(2, d.added)
        assertEquals(1, d.removed)
        assertEquals(2, d.lines.count { it.type == DiffLine.Type.HUNK })
        val unified = Diff.unified(change)
        assertTrue(unified, unified.contains("--- a/a.kt") && unified.contains("-c") && unified.contains("+C") && unified.contains("+k"))
    }
}
