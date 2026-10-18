package com.webtecit.nayon.data.downloads

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.text.format.Formatter
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.webtecit.nayon.MainActivity
import com.webtecit.nayon.NayonApp
import com.webtecit.nayon.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.sample
import kotlinx.coroutines.launch

/**
 * Keeps downloads running while the app is in the background and shows their progress.
 * It stops itself as soon as nothing is downloading.
 */
class DownloadService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var started = false

    override fun onBind(intent: Intent?): IBinder? = null

    @SuppressLint("MissingPermission") // checked by canNotify() right before notify()
    @OptIn(kotlinx.coroutines.FlowPreview::class)
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val engine = (application as NayonApp).container.downloadEngine
        if (intent?.action == ACTION_PAUSE_ALL) engine.pauseAll()
        try {
            ServiceCompat.startForeground(
                this, NOTIFICATION_ID, progressNotification(this, 0, 0, 0, 1),
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC else 0,
            )
        } catch (e: Exception) {
            // Background start not allowed (Android 12+): downloads continue while the app is open.
        }
        if (!started) {
            started = true
            scope.launch {
                combine(engine.live, engine.activeCount) { live, active -> live to active }
                    .sample(700)
                    .collect { (live, active) ->
                        if (active == 0) {
                            ServiceCompat.stopForeground(this@DownloadService, ServiceCompat.STOP_FOREGROUND_REMOVE)
                            stopSelf()
                            return@collect
                        }
                        val done = live.values.sumOf { it.downloaded }
                        val total = live.values.sumOf { if (it.total > 0) it.total else 0 }
                        val speed = live.values.sumOf { it.bytesPerSecond }
                        if (canNotify(this@DownloadService)) {
                            NotificationManagerCompat.from(this@DownloadService)
                                .notify(NOTIFICATION_ID, progressNotification(this@DownloadService, done, total, speed, active))
                        }
                    }
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        const val CHANNEL_PROGRESS = "downloads_progress"
        const val CHANNEL_DONE = "downloads_done"
        private const val NOTIFICATION_ID = 4100
        private const val ACTION_PAUSE_ALL = "com.webtecit.nayon.PAUSE_ALL_DOWNLOADS"

        /** Android 13+ needs the user's permission to show notifications. */
        fun canNotify(context: Context): Boolean =
            Build.VERSION.SDK_INT < 33 ||
                ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) ==
                android.content.pm.PackageManager.PERMISSION_GRANTED

        fun start(context: Context) {
            runCatching { ContextCompat.startForegroundService(context, Intent(context, DownloadService::class.java)) }
        }

        fun createChannels(context: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val nm = context.getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_PROGRESS, context.getString(R.string.notif_channel_progress), NotificationManager.IMPORTANCE_LOW),
            )
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_DONE, context.getString(R.string.notif_channel_done), NotificationManager.IMPORTANCE_DEFAULT),
            )
        }

        private fun openDownloadsIntent(context: Context): PendingIntent = PendingIntent.getActivity(
            context, 1,
            Intent(context, MainActivity::class.java).setAction(MainActivity.ACTION_SHOW_DOWNLOADS)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        private fun progressNotification(context: Context, done: Long, total: Long, speed: Long, active: Int) =
            NotificationCompat.Builder(context, CHANNEL_PROGRESS)
                .setSmallIcon(R.drawable.ic_stat_download)
                .setContentTitle(context.resources.getQuantityString(R.plurals.notif_downloading, active, active))
                .setContentText(
                    if (total > 0) "${Formatter.formatShortFileSize(context, done)} / ${Formatter.formatShortFileSize(context, total)} · " +
                        "${Formatter.formatShortFileSize(context, speed)}/s"
                    else "${Formatter.formatShortFileSize(context, speed)}/s",
                )
                .setProgress(100, if (total > 0) (done * 100 / total).toInt() else 0, total <= 0)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(openDownloadsIntent(context))
                .addAction(
                    0, context.getString(R.string.downloads_pause_all),
                    PendingIntent.getService(
                        context, 2, Intent(context, DownloadService::class.java).setAction(ACTION_PAUSE_ALL),
                        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
                    ),
                )
                .build()

        /** "Download complete" notification; tapping opens the file. */
        @SuppressLint("MissingPermission") // checked by canNotify() right before notify()
        fun notifyFinished(context: Context, record: DownloadRecord, success: Boolean) {
            val tap = if (success && record.destUri != null) {
                val open = DownloadFiles.viewIntent(context, record)
                PendingIntent.getActivity(context, record.id.toInt(), open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            } else {
                openDownloadsIntent(context)
            }
            val n = NotificationCompat.Builder(context, CHANNEL_DONE)
                .setSmallIcon(R.drawable.ic_stat_download)
                .setContentTitle(record.fileName)
                .setContentText(context.getString(if (success) R.string.notif_done else R.string.notif_failed))
                .setAutoCancel(true)
                .setContentIntent(tap)
                .build()
            if (canNotify(context)) NotificationManagerCompat.from(context).notify(5000 + record.id.toInt(), n)
        }
    }
}
