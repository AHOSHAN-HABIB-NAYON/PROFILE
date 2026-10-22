package com.oryzenx.app.push

import android.Manifest
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.oryzenx.app.MainActivity
import com.oryzenx.app.R
import com.oryzenx.app.ui.AppState
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch

/**
 * Shows account notifications sent by the server (FCM HTTP v1). Payloads never contain balances or
 * other sensitive values; the text is a short summary and the details stay behind sign-in.
 */
class OryzenMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        MainScope().launch { PushRegistrar.send(token) }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.notification?.title ?: message.data["title"] ?: return
        val body = message.notification?.body ?: message.data["body"] ?: ""
        AppState.unread = AppState.unread + 1
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED &&
            android.os.Build.VERSION.SDK_INT >= 33
        ) return
        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP).putExtra("open", "notifications"),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = NotificationCompat.Builder(this, "account_updates")
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setContentIntent(open)
            .build()
        NotificationManagerCompat.from(this).notify((message.messageId ?: title).hashCode(), n)
    }
}
