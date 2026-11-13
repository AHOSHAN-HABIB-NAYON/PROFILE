package com.webtecit.filepilot.core.storage

object NameRules {
    private const val MAX_NAME_BYTES = 255

    /** Returns a message explaining why [name] can't be used, or null when it is valid. */
    fun validate(name: String): String? = when {
        name.isBlank() -> "Enter a name."
        name == "." || name == ".." -> "This name is reserved by Android."
        name.contains('/') -> "Names can't contain \"/\"."
        name.contains('\u0000') -> "Names can't contain hidden control characters."
        name.toByteArray(Charsets.UTF_8).size > MAX_NAME_BYTES -> "This name is too long. Use up to 255 characters."
        name != name.trim() && name.trim().isEmpty() -> "Enter a name."
        else -> null
    }

    /**
     * A name that is not in [taken] (compared case-insensitively, as Android shared storage is):
     * "photo.jpg" → "photo (1).jpg", "photo (1).jpg" → "photo (2).jpg", "folder" → "folder (1)".
     */
    fun uniqueName(name: String, taken: Collection<String>, isDirectory: Boolean = false): String {
        val lowerTaken = taken.mapTo(HashSet()) { it.lowercase() }
        if (name.lowercase() !in lowerTaken) return name
        val ext = if (isDirectory) "" else FileTypes.fullExtensionOf(name)
        val base = if (ext.isEmpty()) name else name.dropLast(ext.length + 1)
        val match = Regex("""^(.*) \((\d+)\)$""").find(base)
        val stem = match?.groupValues?.get(1) ?: base
        var n = match?.groupValues?.get(2)?.toIntOrNull()?.plus(1) ?: 1
        while (true) {
            val candidate = if (ext.isEmpty()) "$stem ($n)" else "$stem ($n).$ext"
            if (candidate.lowercase() !in lowerTaken) return candidate
            n++
        }
    }
}
