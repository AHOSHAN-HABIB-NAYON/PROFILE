package com.webtecit.filepilot.core.storage

enum class SortField(val label: String) { NAME("Name"), SIZE("Size"), DATE("Date modified"), TYPE("Type") }

data class SortOrder(
    val field: SortField = SortField.NAME,
    val ascending: Boolean = true,
    val foldersFirst: Boolean = true,
)

/** Compares names the way people expect: case-insensitive, "file2" before "file10". */
object NaturalOrderComparator : Comparator<String> {
    override fun compare(a: String, b: String): Int {
        var i = 0
        var j = 0
        while (i < a.length && j < b.length) {
            val ca = a[i]
            val cb = b[j]
            if (ca.isDigit() && cb.isDigit()) {
                val startA = i
                val startB = j
                while (i < a.length && a[i].isDigit()) i++
                while (j < b.length && b[j].isDigit()) j++
                val numA = a.substring(startA, i).trimStart('0')
                val numB = b.substring(startB, j).trimStart('0')
                if (numA.length != numB.length) return numA.length - numB.length
                val cmp = numA.compareTo(numB)
                if (cmp != 0) return cmp
            } else {
                val cmp = ca.lowercaseChar().compareTo(cb.lowercaseChar())
                if (cmp != 0) return cmp
                i++
                j++
            }
        }
        val remaining = (a.length - i) - (b.length - j)
        return if (remaining != 0) remaining else a.compareTo(b)
    }
}

object FileSorting {
    fun comparator(order: SortOrder): Comparator<FileItem> {
        val byName = Comparator<FileItem> { x, y -> NaturalOrderComparator.compare(x.name, y.name) }
        val primary: Comparator<FileItem> = when (order.field) {
            SortField.NAME -> byName
            SortField.SIZE -> compareBy<FileItem> { it.size }.then(byName)
            SortField.DATE -> compareBy<FileItem> { it.lastModified }.then(byName)
            SortField.TYPE -> compareBy<FileItem> { it.extension }.then(byName)
        }
        val directed = if (order.ascending) primary else primary.reversed()
        return if (order.foldersFirst) compareBy<FileItem> { !it.isDirectory }.then(directed) else directed
    }

    fun sort(items: List<FileItem>, order: SortOrder): List<FileItem> = items.sortedWith(comparator(order))
}
