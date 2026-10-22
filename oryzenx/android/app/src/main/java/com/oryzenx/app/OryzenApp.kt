package com.oryzenx.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import com.oryzenx.app.data.Api
import com.oryzenx.app.data.I18n
import com.oryzenx.app.data.SessionStore

class OryzenApp : Application() {
    lateinit var session: SessionStore
        private set
    lateinit var api: Api
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this
        session = SessionStore(this)
        I18n.init(this, session.locale)
        api = Api(session)
        val channel = NotificationChannel(
            "account_updates",
            getString(R.string.channel_account_updates),
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = getString(R.string.channel_account_updates_desc)
            lockscreenVisibility = android.app.Notification.VISIBILITY_PRIVATE
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    companion object {
        lateinit var instance: OryzenApp
            private set
    }
}
