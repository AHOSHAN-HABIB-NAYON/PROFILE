package com.webtecit.filepilot.core.operations

import com.webtecit.filepilot.core.storage.FileTypes
import com.webtecit.filepilot.core.storage.NameRules

enum class CaseMode(val label: String) { KEEP("Keep"), LOWER("lowercase"), UPPER("UPPERCASE") }

/**
 * A batch rename rule. [pattern] may contain {name} (original name without extension),
 * {n} (counter) and {ext} (extension). Find/replace is applied to {name} first.
 */
data class BatchRenameRule(
    val pattern: String = "{name}",
    val find: String = "",
    val replace: String = "",
    val ignoreCase: Boolean = true,
    val startNumber: Int = 1,
    val padding: Int = 2,
    val caseMode: CaseMode = CaseMode.KEEP,
    val keepExtension: Boolean = true,
)

data class RenamePreview(val oldName: String, val newName: String, val error: String?) {
    val changed: Boolean get() = oldName != newName
}

object BatchRename {

    fun apply(name: String, isDirectory: Boolean, index: Int, rule: BatchRenameRule): String {
        val ext = FileTypes.extensionOf(name, isDirectory).let { if (it.isEmpty()) "" else name.takeLast(it.length) }
        var base = if (ext.isEmpty()) name else name.dropLast(ext.length + 1)
        if (rule.find.isNotEmpty()) base = base.replace(rule.find, rule.replace, ignoreCase = rule.ignoreCase)
        val number = (rule.startNumber + index).toString().padStart(rule.padding.coerceIn(0, 8), '0')
        var result = rule.pattern
            .replace("{name}", base)
            .replace("{n}", number)
            .replace("{ext}", ext)
        result = when (rule.caseMode) {
            CaseMode.KEEP -> result
            CaseMode.LOWER -> result.lowercase()
            CaseMode.UPPER -> result.uppercase()
        }
        result = result.trim()
        val patternHasExt = rule.pattern.contains("{ext}")
        return if (rule.keepExtension && ext.isNotEmpty() && !patternHasExt) "$result.$ext" else result
    }

    /**
     * Previews new names for [names] (with folder flags). [otherNames] are names in the same
     * folder that are not being renamed; a new name may not collide with them or with another new name.
     */
    fun preview(
        names: List<Pair<String, Boolean>>,
        rule: BatchRenameRule,
        otherNames: Collection<String>,
    ): List<RenamePreview> {
        val others = otherNames.mapTo(HashSet()) { it.lowercase() }
        val newNames = names.mapIndexed { i, (name, dir) -> apply(name, dir, i, rule) }
        val counts = newNames.groupingBy { it.lowercase() }.eachCount()
        return names.mapIndexed { i, (old, _) ->
            val new = newNames[i]
            val error = NameRules.validate(new)
                ?: if ((counts[new.lowercase()] ?: 0) > 1) "Two items would get this name." else null
                ?: if (new.lowercase() in others) "An item with this name already exists." else null
            RenamePreview(old, new, error)
        }
    }
}
