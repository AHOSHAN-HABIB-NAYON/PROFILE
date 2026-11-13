package com.webtecit.filepilot.core.tasks

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.concurrent.atomic.AtomicLong
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

data class BgTask(
    val id: Long,
    val title: String,
    val detail: String,
    val progress: Float? = null,
    val finished: Boolean = false,
)

/**
 * Long jobs other than file operations (scans, extractions, encryption). They keep running when
 * the user leaves the screen; progress is shown in the app and in a notification.
 */
@Singleton
class BackgroundTasks @Inject constructor(@ApplicationContext private val context: Context) {
    private val _tasks = MutableStateFlow<List<BgTask>>(emptyList())
    val tasks: StateFlow<List<BgTask>> = _tasks.asStateFlow()
    private val ids = AtomicLong(1)
    private val jobs = java.util.concurrent.ConcurrentHashMap<Long, kotlinx.coroutines.Job>()

    /** Starts tracking a task; pass its [job] so the user can stop it. */
    fun start(title: String, detail: String, job: kotlinx.coroutines.Job? = null): Long {
        val task = BgTask(ids.getAndIncrement(), title, detail)
        if (job != null) jobs[task.id] = job
        _tasks.update { list -> list.filterNot { it.title == title } + task }
        TaskService.ensureRunning(context)
        return task.id
    }

    fun update(title: String, detail: String, progress: Float?) {
        _tasks.update { list -> list.map { if (it.title == title && !it.finished) it.copy(detail = detail, progress = progress) else it } }
    }

    fun finish(id: Long, result: String) {
        jobs.remove(id)
        _tasks.update { list -> list.map { if (it.id == id) it.copy(detail = result, progress = 1f, finished = true) else it } }
    }

    fun clearAll(title: String) {
        _tasks.update { list -> list.filterNot { it.title == title } }
    }

    fun dismiss(id: Long) {
        jobs.remove(id)
        _tasks.update { list -> list.filterNot { it.id == id } }
    }

    /** Stops a running task. */
    fun cancel(id: Long) {
        jobs.remove(id)?.cancel()
        _tasks.update { list -> list.filterNot { it.id == id } }
    }

    fun cancelAll() {
        _tasks.value.filter { !it.finished }.forEach { cancel(it.id) }
    }

    /** Runs [block] as a tracked task; [report] updates the detail line and progress. */
    suspend fun <T> run(title: String, detail: String, block: suspend (report: (String, Float?) -> Unit) -> T): T {
        val id = start(title, detail)
        try {
            val result = block { d, p -> update(title, d, p) }
            finish(id, "Done")
            return result
        } catch (e: Throwable) {
            dismiss(id)
            throw e
        }
    }
}

internal fun startService(context: Context, intent: Intent) {
    runCatching { ContextCompat.startForegroundService(context, intent) }
}
