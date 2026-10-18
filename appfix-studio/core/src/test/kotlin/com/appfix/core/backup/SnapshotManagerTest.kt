package com.appfix.core.backup

import com.appfix.core.TestFixtures
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class SnapshotManagerTest {
    @Test
    fun `backup and restore round trip`() {
        val root = TestFixtures.tempDir()
        val ws = File(root, "workspace")
        TestFixtures.copySample().copyRecursively(ws)
        File(ws, "app/build/tmp").mkdirs()
        File(ws, "app/build/tmp/junk.bin").writeBytes(ByteArray(100))
        val mgr = SnapshotManager(ws, File(root, "backups"))
        val snap = mgr.create("Before edits")
        assertTrue(snap.fileCount > 10)
        val manifest = File(ws, "app/src/main/AndroidManifest.xml")
        val original = manifest.readText()
        manifest.writeText("broken")
        File(ws, "extra.txt").writeText("new file")

        mgr.restore(snap.id)
        assertEquals(original, manifest.readText())
        assertFalse(File(ws, "extra.txt").exists())
        assertFalse("build outputs are not backed up", File(ws, "app/build").exists())
        assertEquals(listOf(snap.id), mgr.list().map { it.id })
        mgr.delete(snap.id)
        assertTrue(mgr.list().isEmpty())
    }
}
