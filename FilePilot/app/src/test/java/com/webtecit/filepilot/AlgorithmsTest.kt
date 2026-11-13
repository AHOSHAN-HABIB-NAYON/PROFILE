package com.webtecit.filepilot

import com.webtecit.filepilot.core.operations.BatchRename
import com.webtecit.filepilot.core.operations.BatchRenameRule
import com.webtecit.filepilot.core.operations.CaseMode
import com.webtecit.filepilot.core.operations.Checksums
import com.webtecit.filepilot.core.operations.DiffType
import com.webtecit.filepilot.core.operations.HashAlgorithm
import com.webtecit.filepilot.core.operations.LineDiff
import com.webtecit.filepilot.feature.browser.ListPagingSource
import androidx.paging.PagingSource
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AlgorithmsTest {

    @Test fun checksumsMatchKnownValues() = runBlocking {
        val data = "abc".toByteArray()
        assertEquals("900150983cd24fb0d6963f7d28e17f72", Checksums.compute(data.inputStream(), HashAlgorithm.MD5))
        assertEquals("a9993e364706816aba3e25717850c26c9cd0d89d", Checksums.compute(data.inputStream(), HashAlgorithm.SHA1))
        assertEquals(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            Checksums.compute(data.inputStream(), HashAlgorithm.SHA256),
        )
    }

    @Test fun batchRenameAppliesPatternCounterAndCase() {
        val rule = BatchRenameRule(pattern = "Trip_{n}", startNumber = 1, padding = 3)
        assertEquals("Trip_001.jpg", BatchRename.apply("IMG_4410.jpg", false, 0, rule))
        assertEquals("Trip_002.JPG", BatchRename.apply("IMG_4411.JPG", false, 1, rule))
        val replace = BatchRenameRule(find = "draft", replace = "final", caseMode = CaseMode.UPPER)
        // The case option changes the name; the original extension is kept as it was.
        assertEquals("REPORT FINAL.pdf", BatchRename.apply("report draft.pdf", false, 0, replace))
        val withExt = BatchRenameRule(pattern = "{name}-copy.{ext}")
        assertEquals("a-copy.txt", BatchRename.apply("a.txt", false, 0, withExt))
        assertEquals("Holiday", BatchRename.apply("Holiday", true, 0, BatchRenameRule()))
    }

    @Test fun batchRenameReportsCollisions() {
        val previews = BatchRename.preview(
            listOf("a.txt" to false, "b.txt" to false),
            BatchRenameRule(pattern = "same"),
            otherNames = emptyList(),
        )
        assertTrue(previews.all { it.error != null })
        val clash = BatchRename.preview(listOf("a.txt" to false), BatchRenameRule(pattern = "keep"), listOf("KEEP.txt"))
        assertNotNull(clash.single().error)
        val ok = BatchRename.preview(listOf("a.txt" to false, "b.txt" to false), BatchRenameRule(pattern = "p{n}"), listOf("x"))
        assertTrue(ok.all { it.error == null })
        assertEquals(listOf("p01.txt", "p02.txt"), ok.map { it.newName })
    }

    @Test fun diffOfIdenticalFilesHasNoChanges() {
        val lines = listOf("a", "b", "c")
        val result = LineDiff.diff(lines, lines)!!
        assertTrue(result.identical)
        assertEquals(3, result.lines.size)
    }

    @Test fun diffFindsInsertionsDeletionsAndReplacements() {
        val left = listOf("one", "two", "three", "four")
        val right = listOf("zero", "one", "three", "FOUR", "five")
        val result = LineDiff.diff(left, right)!!
        assertEquals(3, result.added)
        assertEquals(2, result.removed)
        // Reconstruct both sides from the diff.
        assertEquals(left, result.lines.filter { it.type != DiffType.ADDED }.map { it.text })
        assertEquals(right, result.lines.filter { it.type != DiffType.REMOVED }.map { it.text })
        // Line numbers count each side independently.
        assertEquals(4, result.lines.mapNotNull { it.leftNumber }.max())
        assertEquals(5, result.lines.mapNotNull { it.rightNumber }.max())
    }

    @Test fun diffHandlesEmptySidesAndLimits() {
        assertEquals(2, LineDiff.diff(emptyList(), listOf("a", "b"))!!.added)
        assertEquals(2, LineDiff.diff(listOf("a", "b"), emptyList())!!.removed)
        val a = (1..200).map { "a$it" }
        val b = (1..200).map { "b$it" }
        assertNull(LineDiff.diff(a, b, maxEdits = 50))
        val full = LineDiff.diff(a, b)!!
        assertEquals(200, full.added)
        assertEquals(200, full.removed)
    }

    @Test fun diffIsCorrectForRandomEdits() {
        val random = java.util.Random(42)
        repeat(50) {
            val left = List(random.nextInt(60)) { "l${random.nextInt(8)}" }
            val right = List(random.nextInt(60)) { "l${random.nextInt(8)}" }
            val result = LineDiff.diff(left, right)!!
            assertEquals(left, result.lines.filter { it.type != DiffType.ADDED }.map { it.text })
            assertEquals(right, result.lines.filter { it.type != DiffType.REMOVED }.map { it.text })
        }
    }

    @Test fun pagingSourceServesPagesWithPlaceholders() = runBlocking {
        val source = ListPagingSource((0 until 250).toList())
        val first = source.load(PagingSource.LoadParams.Refresh(null, 100, true)) as PagingSource.LoadResult.Page
        assertEquals(0, first.data.first())
        assertEquals(100, first.data.size)
        assertNull(first.prevKey)
        assertEquals(100, first.nextKey)
        assertEquals(150, first.itemsAfter)
        val middle = source.load(PagingSource.LoadParams.Refresh(120, 50, true)) as PagingSource.LoadResult.Page
        assertEquals(120, middle.data.first())
        assertEquals(120, middle.itemsBefore)
        val before = source.load(PagingSource.LoadParams.Prepend(120, 50, true)) as PagingSource.LoadResult.Page
        assertEquals((70 until 120).toList(), before.data)
        val end = source.load(PagingSource.LoadParams.Append(200, 100, true)) as PagingSource.LoadResult.Page
        assertEquals(50, end.data.size)
        assertNull(end.nextKey)
        val empty = ListPagingSource(emptyList<Int>()).load(PagingSource.LoadParams.Refresh(null, 50, true)) as PagingSource.LoadResult.Page
        assertTrue(empty.data.isEmpty())
    }
}
