package com.webtecit.filepilot.core.tasks

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.webtecit.filepilot.MainActivity
import com.webtecit.filepilot.R
import com.webtecit.filepilot.core.common.Formatters
import com.webtecit.filepilot.core.operations.FileOperationManager
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * Keeps FilePilot running while copies, moves, deletes, scans or extractions are in progress,
 * and shows their progress in the notification bar. It stops itself when the work is done.
 */
@AndroidEntryPoint
class TaskService : Service() {
    @Inject lateinit var operations: FileOperationManager
    @Inject lateinit var tasks: BackgroundTasks

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var watcher: Job? = null
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        createChannel(this)
        if (intent?.action == ACTION_STOP) {
            operations.operations.value.filter { !it.status.finished }.forEach { operations.cancel(it.id) }
            tasks.cancelAll()
        }
        val first = build("Working…", null)
        ServiceCompat.startForeground(
            this, NOTIFICATION_ID, first,
            if (Build.VERSION.SDK_INT >= 29) ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC else 0,
        )
        if (wakeLock == null) {
            wakeLock = (getSystemService(POWER_SERVICE) as PowerManager)
                .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "FilePilot:work").apply { acquire(6 * 60 * 60 * 1000L) }
        }
        if (watcher == null) {
            watcher = scope.launch {
                // Give a just-started job a moment to register before deciding there is nothing to do.
                delay(1500)
                combine(operations.operations, tasks.tasks) { ops, bg -> ops to bg }.collect { (ops, bg) ->
                    val running = ops.filter { !it.status.finished }
                    val runningBg = bg.filter { !it.finished }
                    if (running.isEmpty() && runningBg.isEmpty()) {
                        stopSelf()
                        return@collect
                    }
                    val title: String
                    val progress: Float?
                    if (running.isNotEmpty()) {
                        val op = running.first()
                        title = op.title + if (running.size + runningBg.size > 1) " (+${running.size + runningBg.size - 1})" else ""
                        progress = op.progress
                        notify(title, "${op.summary}${if (op.currentName.isNotBlank()) " · ${op.currentName}" else ""}", progress)
                    } else {
                        val t = runningBg.first()
                        title = t.title + if (runningBg.size > 1) " (+${runningBg.size - 1})" else ""
                        progress = t.progress
                        notify(title, t.detail, progress)
                    }
                }
            }
        }
        return START_NOT_STICKY
    }

    private fun notify(title: String, text: String, progress: Float?) {
        getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, build(title, progress, text))
    }

    private fun build(title: String, progress: Float?, text: String = "") = NotificationCompat.Builder(this, CHANNEL)
        .setSmallIcon(R.drawable.ic_notification)
        .setContentTitle(title + (progress?.let { " · ${Formatters.percent(it)}" } ?: ""))
        .setContentText(text)
        .setOnlyAlertOnce(true)
        .setOngoing(true)
        .setSilent(true)
        .setProgress(100, ((progress ?: 0f) * 100).toInt(), progress == null)
        .addAction(
            0, "Stop all",
            PendingIntent.getService(this, 1, Intent(this, TaskService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE),
        )
        .setContentIntent(
            PendingIntent.getActivity(
                this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            ),
        )
        .build()

    override fun onDestroy() {
        scope.cancel()
        runCatching { wakeLock?.takeIf { it.isHeld }?.release() }
        super.onDestroy()
    }

    companion object {
        private const val CHANNEL = "work"
        private const val NOTIFICATION_ID = 42
        private const val ACTION_STOP = "com.webtecit.filepilot.STOP_ALL"

        fun createChannel(context: Context) {
            if (Build.VERSION.SDK_INT >= 26) {
                context.getSystemService(NotificationManager::class.java).createNotificationChannel(
                    NotificationChannel(CHANNEL, "File operations and scans", NotificationManager.IMPORTANCE_LOW).apply {
                        description = "Progress of copies, moves, scans and extractions"
                        setShowBadge(false)
                    },
                )
            }
        }

        fun ensureRunning(context: Context) = startService(context, Intent(context, TaskService::class.java))
    }
}
