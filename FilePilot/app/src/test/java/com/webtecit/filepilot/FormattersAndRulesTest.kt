package com.webtecit.filepilot

import com.webtecit.filepilot.core.common.Formatters
import com.webtecit.filepilot.core.storage.FileItem
import com.webtecit.filepilot.core.storage.FileKind
import com.webtecit.filepilot.core.storage.FileSorting
import com.webtecit.filepilot.core.storage.FileTypes
import com.webtecit.filepilot.core.storage.NameRules
import com.webtecit.filepilot.core.storage.NaturalOrderComparator
import com.webtecit.filepilot.core.storage.SortField
import com.webtecit.filepilot.core.storage.SortOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class FormattersAndRulesTest {

    @Test fun formatsSizesWithDecimalUnits() {
        assertEquals("0 B", Formatters.size(0))
        assertEquals("999 B", Formatters.size(999))
        assertEquals("1.0 KB", Formatters.size(1000))
        assertEquals("1.5 MB", Formatters.size(1_500_000))
        assertEquals("128 GB", Formatters.size(128_000_000_000))
        assertEquals("—", Formatters.size(-1))
    }

    @Test fun formatsCountsAndDurations() {
        assertEquals("1 item", Formatters.count(1, "item"))
        assertEquals("3 items", Formatters.count(3, "item"))
        assertEquals("1:05", Formatters.duration(65_000))
        assertEquals("1:01:01", Formatters.duration(3_661_000))
    }

    @Test fun validatesNames() {
        assertNull(NameRules.validate("report.pdf"))
        assertNull(NameRules.validate(".nomedia"))
        assertNotNull(NameRules.validate(""))
        assertNotNull(NameRules.validate("   "))
        assertNotNull(NameRules.validate("a/b"))
        assertNotNull(NameRules.validate(".."))
        assertNotNull(NameRules.validate("x".repeat(256)))
        assertNull(NameRules.validate("x".repeat(255)))
    }

    @Test fun generatesUniqueNames() {
        assertEquals("photo.jpg", NameRules.uniqueName("photo.jpg", listOf("other.jpg")))
        assertEquals("photo (1).jpg", NameRules.uniqueName("photo.jpg", listOf("photo.jpg")))
        assertEquals("photo (2).jpg", NameRules.uniqueName("photo.jpg", listOf("PHOTO.JPG", "photo (1).jpg")))
        assertEquals("photo (2).jpg", NameRules.uniqueName("photo (1).jpg", listOf("photo (1).jpg")))
        assertEquals("archive (1).tar.gz", NameRules.uniqueName("archive.tar.gz", listOf("archive.tar.gz")))
        assertEquals("my.folder (1)", NameRules.uniqueName("my.folder", listOf("my.folder"), isDirectory = true))
        assertEquals(".bashrc (1)", NameRules.uniqueName(".bashrc", listOf(".bashrc")))
    }

    @Test fun detectsTypes() {
        assertEquals("", FileTypes.extensionOf(".nomedia"))
        assertEquals("jpg", FileTypes.extensionOf("IMG.JPG"))
        assertEquals("", FileTypes.extensionOf("folder.d", isDirectory = true))
        assertEquals(FileKind.IMAGE, FileTypes.kindOf("a.png", false))
        assertEquals(FileKind.CODE, FileTypes.kindOf("index.html", false))
        assertEquals(FileKind.APK, FileTypes.kindOf("app.apk", false))
        assertEquals(FileKind.ARCHIVE, FileTypes.kindOf("x.7z", false))
        assertEquals(FileKind.FOLDER, FileTypes.kindOf("x.png", true))
        assertEquals("application/pdf", FileTypes.mimeOf("doc.PDF"))
        assertEquals(FileTypes.FALLBACK_MIME, FileTypes.mimeOf("unknown.zzz"))
    }

    @Test fun hidesExtensionOnlyWhenAsked() {
        val f = item("song.mp3", dir = false)
        assertEquals("song.mp3", f.displayName(true))
        assertEquals("song", f.displayName(false))
        assertEquals("v1.2", item("v1.2", dir = true).displayName(false))
    }

    @Test fun naturalOrderSortsNumbersByValue() {
        val sorted = listOf("file10", "File2", "file1", "file02b", "alpha").sortedWith(NaturalOrderComparator)
        assertEquals(listOf("alpha", "file1", "File2", "file02b", "file10"), sorted)
    }

    @Test fun sortsFoldersFirstAndBySize() {
        val items = listOf(
            item("b.txt", false, size = 10),
            item("a", true),
            item("c.txt", false, size = 5),
            item("z", true),
        )
        val byName = FileSorting.sort(items, SortOrder())
        assertEquals(listOf("a", "z", "b.txt", "c.txt"), byName.map { it.name })
        val bySizeDesc = FileSorting.sort(items, SortOrder(SortField.SIZE, ascending = false, foldersFirst = false))
        assertEquals("b.txt", bySizeDesc.first().name)
        val noFoldersFirst = FileSorting.sort(items, SortOrder(SortField.NAME, true, foldersFirst = false))
        assertEquals(listOf("a", "b.txt", "c.txt", "z"), noFoldersFirst.map { it.name })
    }

    private fun item(name: String, dir: Boolean, size: Long = 0) =
        FileItem("/x/$name", name, dir, size, 0, if (dir) FileTypes.DIRECTORY_MIME else FileTypes.mimeOf(name))
}
