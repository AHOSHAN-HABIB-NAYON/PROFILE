package com.appfix.core.util

/** Thrown when a long-running operation notices that the caller cancelled it. */
class OperationCancelledException(message: String = "Operation cancelled") : RuntimeException(message)

/**
 * Cooperative cancellation check that core code polls inside loops.
 * Android callers usually pass `{ !coroutineContext.isActive }`.
 */
fun interface CancelToken {
    fun isCancelled(): Boolean

    fun throwIfCancelled() {
        if (isCancelled()) throw OperationCancelledException()
    }

    companion object {
        val NONE = CancelToken { false }
    }
}

/** Progress callback: [done] and [total] are in bytes (or items); total is -1 when unknown. */
fun interface ProgressListener {
    fun onProgress(done: Long, total: Long, label: String)

    companion object {
        val NONE = ProgressListener { _, _, _ -> }
    }
}
