package com.filepilot.app.core.model

enum class FileCategory(val title: String) {
    RECENT("Recent files"),
    IMAGES("Images"),
    VIDEOS("Videos"),
    AUDIO("Audio"),
    DOCUMENTS("Documents"),
    DOWNLOADS("Downloads"),
    APKS("APK files"),
    ARCHIVES("Archives"),
    FAVORITES("Favorites"),
    LARGE("Large files");

    /** Images, videos and audio can be read with media permissions alone. */
    val isMedia: Boolean get() = this == IMAGES || this == VIDEOS || this == AUDIO
}

enum class SortField(val label: String) { NAME("Name"), DATE("Date modified"), SIZE("Size"), TYPE("Type") }

data class SortOrder(val field: SortField = SortField.NAME, val ascending: Boolean = true)

enum class ViewMode { LIST, GRID }

enum class ThemeMode(val label: String) { SYSTEM("System default"), LIGHT("Light"), DARK("Dark") }

/** Folders first, then the chosen order. Name comparison is case-insensitive and natural for numbers. */
fun List<FileItem>.sortedWith(order: SortOrder, foldersFirst: Boolean = true): List<FileItem> {
    val base: Comparator<FileItem> = when (order.field) {
        SortField.NAME -> Comparator { a, b -> NaturalOrder.compare(a.name, b.name) }
        SortField.DATE -> compareBy<FileItem> { it.lastModified }.thenComparator { a, b -> NaturalOrder.compare(a.name, b.name) }
        SortField.SIZE -> compareBy<FileItem> { if (it.isDirectory) it.childCount.toLong() else it.size }
            .thenComparator { a, b -> NaturalOrder.compare(a.name, b.name) }
        SortField.TYPE -> compareBy<FileItem> { it.extension }.thenComparator { a, b -> NaturalOrder.compare(a.name, b.name) }
    }
    val directed = if (order.ascending) base else base.reversed()
    return if (foldersFirst) sortedWith(compareByDescending<FileItem> { it.isDirectory }.then(directed)) else sortedWith(directed)
}

/** "file2" sorts before "file10". */
object NaturalOrder : Comparator<String> {
    override fun compare(a: String, b: String): Int {
        var i = 0
        var j = 0
        while (i < a.length && j < b.length) {
            val ca = a[i]
            val cb = b[j]
            if (ca.isDigit() && cb.isDigit()) {
                val si = i
                val sj = j
                while (i < a.length && a[i].isDigit()) i++
                while (j < b.length && b[j].isDigit()) j++
                val na = a.substring(si, i).trimStart('0')
                val nb = b.substring(sj, j).trimStart('0')
                if (na.length != nb.length) return na.length - nb.length
                val c = na.compareTo(nb)
                if (c != 0) return c
            } else {
                val c = ca.lowercaseChar().compareTo(cb.lowercaseChar())
                if (c != 0) return c
                i++
                j++
            }
        }
        return (a.length - i) - (b.length - j)
    }
}
