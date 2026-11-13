package com.webtecit.filepilot.core.operations

enum class DiffType { EQUAL, ADDED, REMOVED }

data class DiffLine(val type: DiffType, val text: String, val leftNumber: Int?, val rightNumber: Int?)

data class DiffResult(val lines: List<DiffLine>, val added: Int, val removed: Int) {
    val identical: Boolean get() = added == 0 && removed == 0
}

/** Line-based diff using Myers' O(ND) algorithm, after trimming the common prefix and suffix. */
object LineDiff {

    /** Returns null when the files differ in more than [maxEdits] lines (too different to show). */
    fun diff(left: List<String>, right: List<String>, maxEdits: Int = 4000): DiffResult? {
        var prefix = 0
        while (prefix < left.size && prefix < right.size && left[prefix] == right[prefix]) prefix++
        var suffix = 0
        while (suffix < left.size - prefix && suffix < right.size - prefix &&
            left[left.size - 1 - suffix] == right[right.size - 1 - suffix]
        ) suffix++

        val a = left.subList(prefix, left.size - suffix)
        val b = right.subList(prefix, right.size - suffix)
        val middle = myers(a, b, maxEdits) ?: return null

        val ops = ArrayList<Pair<DiffType, String>>(left.size + right.size)
        for (i in 0 until prefix) ops += DiffType.EQUAL to left[i]
        ops += middle
        for (i in left.size - suffix until left.size) ops += DiffType.EQUAL to left[i]

        var l = 0
        var r = 0
        var added = 0
        var removed = 0
        val lines = ops.map { (type, text) ->
            when (type) {
                DiffType.EQUAL -> { l++; r++; DiffLine(type, text, l, r) }
                DiffType.REMOVED -> { l++; removed++; DiffLine(type, text, l, null) }
                DiffType.ADDED -> { r++; added++; DiffLine(type, text, null, r) }
            }
        }
        return DiffResult(lines, added, removed)
    }

    private fun myers(a: List<String>, b: List<String>, maxEdits: Int): List<Pair<DiffType, String>>? {
        val n = a.size
        val m = b.size
        if (n == 0) return b.map { DiffType.ADDED to it }
        if (m == 0) return a.map { DiffType.REMOVED to it }
        val max = n + m
        val limit = minOf(max, maxEdits)
        val offset = max + 1
        val v = IntArray(2 * max + 3)
        // trace[d] holds v[-d..d] after step d.
        val trace = ArrayList<IntArray>()
        var found = -1
        loop@ for (d in 0..limit) {
            var k = -d
            while (k <= d) {
                var x = if (k == -d || (k != d && v[offset + k - 1] < v[offset + k + 1])) v[offset + k + 1]
                else v[offset + k - 1] + 1
                var y = x - k
                while (x < n && y < m && a[x] == b[y]) { x++; y++ }
                v[offset + k] = x
                if (x >= n && y >= m) {
                    trace += v.copyOfRange(offset - d, offset + d + 1)
                    found = d
                    break@loop
                }
                k += 2
            }
            trace += v.copyOfRange(offset - d, offset + d + 1)
        }
        if (found < 0) return null

        val out = ArrayList<Pair<DiffType, String>>(n + m)
        var x = n
        var y = m
        for (d in found downTo 1) {
            val prev = trace[d - 1]
            fun at(k: Int) = prev[k + (d - 1)]
            val k = x - y
            val prevK = if (k == -d || (k != d && at(k - 1) < at(k + 1))) k + 1 else k - 1
            val prevX = at(prevK)
            val prevY = prevX - prevK
            while (x > prevX && y > prevY) {
                out += DiffType.EQUAL to a[x - 1]
                x--; y--
            }
            if (x == prevX) out += DiffType.ADDED to b[y - 1] else out += DiffType.REMOVED to a[x - 1]
            x = prevX
            y = prevY
        }
        while (x > 0 && y > 0) {
            out += DiffType.EQUAL to a[x - 1]
            x--; y--
        }
        out.reverse()
        return out
    }
}
