package com.appfix.core.analysis

/** Version helpers and the AGP → minimum Gradle compatibility table (from the AGP release notes). */
object GradleCompat {
    private val agpMinGradle = listOf(
        "9.0" to "9.0.0", "8.13" to "8.13", "8.12" to "8.13", "8.11" to "8.13", "8.10" to "8.11.1", "8.9" to "8.11.1",
        "8.8" to "8.10.2", "8.7" to "8.9", "8.6" to "8.7", "8.5" to "8.7", "8.4" to "8.6", "8.3" to "8.4",
        "8.2" to "8.2", "8.1" to "8.0", "8.0" to "8.0", "7.4" to "7.5", "7.3" to "7.4", "7.2" to "7.3.3",
        "7.1" to "7.2", "7.0" to "7.0", "4.2" to "6.7.1", "4.1" to "6.5", "4.0" to "6.1.1",
    )

    /** Minimum Gradle version for an AGP version, or null if unknown. */
    fun minGradleFor(agp: String): String? {
        val mm = majorMinor(agp) ?: return null
        agpMinGradle.firstOrNull { it.first == mm }?.let { return it.second }
        // Newer than the table: assume the newest known requirement.
        val newest = agpMinGradle.first()
        return if (compare(agp, newest.first) > 0) newest.second else null
    }

    fun majorMinor(v: String): String? = Regex("^(\\d+)\\.(\\d+)").find(v)?.let { "${it.groupValues[1]}.${it.groupValues[2]}" }

    fun major(v: String?): Int? = v?.let { Regex("^(\\d+)").find(it)?.groupValues?.get(1)?.toIntOrNull() }

    /** Compares dotted versions numerically, ignoring qualifiers such as -rc1. */
    fun compare(a: String, b: String): Int {
        val pa = a.split('.', '-').map { it.toIntOrNull() }
        val pb = b.split('.', '-').map { it.toIntOrNull() }
        for (i in 0 until maxOf(pa.size, pb.size)) {
            val x = pa.getOrNull(i) ?: 0
            val y = pb.getOrNull(i) ?: 0
            if (pa.getOrNull(i) == null && pb.getOrNull(i) == null) break
            if (x != y) return x.compareTo(y)
        }
        return 0
    }
}
