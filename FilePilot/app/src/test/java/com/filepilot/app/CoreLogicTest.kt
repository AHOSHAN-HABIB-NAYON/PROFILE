package com.filepilot.app

import com.filepilot.app.core.model.NaturalOrder
import com.filepilot.app.core.util.FileNames
import com.filepilot.app.data.archive.ZipArchives
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class CoreLogicTest {

    @Test
    fun zipSlipEntriesAreRejected() {
        assertNull(ZipArchives.safeSegments("../evil.txt"))
        assertNull(ZipArchives.safeSegments("a/../../evil.txt"))
        assertNull(ZipArchives.safeSegments("/etc/passwd"))
        assertNull(ZipArchives.safeSegments("..\\..\\evil.txt"))
        assertNull(ZipArchives.safeSegments("C:\\Windows\\evil.dll"))
        assertNull(ZipArchives.safeSegments(""))
    }

    @Test
    fun normalZipEntriesAreKept() {
        assertEquals(listOf("docs", "readme.md"), ZipArchives.safeSegments("docs/readme.md"))
        assertEquals(listOf("a", "b"), ZipArchives.safeSegments("./a//b/"))
        assertEquals(listOf("win", "file.txt"), ZipArchives.safeSegments("win\\file.txt"))
        assertNotNull(ZipArchives.safeSegments("..hidden-but-fine"))
    }

    @Test
    fun fileNameValidation() {
        assertNotNull(FileNames.validate(""))
        assertNotNull(FileNames.validate("   "))
        assertNotNull(FileNames.validate(".."))
        assertNotNull(FileNames.validate("a/b"))
        assertNotNull(FileNames.validate("x".repeat(256)))
        assertNull(FileNames.validate("Report 2024.pdf"))
    }

    @Test
    fun uniqueNamesNeverOverwrite() {
        val existing = setOf("report.pdf", "report (1).pdf", "Photos")
        assertEquals("report (2).pdf", FileNames.unique("report.pdf", false) { it in existing })
        assertEquals("Photos (1)", FileNames.unique("Photos", true) { it in existing })
        assertEquals("new.txt", FileNames.unique("new.txt", false) { it in existing })
    }

    @Test
    fun naturalSortOrdersNumbersByValue() {
        val sorted = listOf("file10", "File2", "file1", "file02b").sortedWith(NaturalOrder)
        assertEquals(listOf("file1", "File2", "file02b", "file10"), sorted)
    }
}
