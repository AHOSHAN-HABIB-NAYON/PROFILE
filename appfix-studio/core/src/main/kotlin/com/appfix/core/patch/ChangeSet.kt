package com.appfix.core.patch

import kotlinx.serialization.Serializable
import java.util.UUID

/**
 * One proposed file change. `before == null` creates a file, `after == null` deletes it.
 * For binary files, both values are Base64-encoded and [isBinary] is true.
 */
@Serializable
data class FileChange(
    val path: String,
    val before: String?,
    val after: String?,
    val isBinary: Boolean = false,
) {
    val kind: Kind get() = when {
        before == null -> Kind.CREATE
        after == null -> Kind.DELETE
        else -> Kind.MODIFY
    }

    enum class Kind { CREATE, MODIFY, DELETE }
}

/** A reviewable group of file changes produced by a repair, generator, editor or AI patch. */
@Serializable
data class ChangeSet(
    val id: String = UUID.randomUUID().toString(),
    val title: String,
    val description: String = "",
    val source: String,
    val changes: List<FileChange>,
    /** Steps the user should do or verify after applying, e.g. "Rebuild to confirm". */
    val followUps: List<String> = emptyList(),
) {
    val isEmpty: Boolean get() = changes.none { it.before != it.after }
}

@Serializable
enum class ChangeState { APPLIED, UNDONE }

@Serializable
data class ChangeRecord(
    val changeSet: ChangeSet,
    val appliedAt: Long,
    val state: ChangeState,
    val undoneAt: Long? = null,
)
