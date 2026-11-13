package com.webtecit.filepilot

import android.app.Application
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import coil3.request.crossfade
import com.webtecit.filepilot.core.preferences.ThemeMirror
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.launch

@HiltAndroidApp
class FilePilotApp : Application(), SingletonImageLoader.Factory {

    @javax.inject.Inject lateinit var recycleBin: com.webtecit.filepilot.core.cleaning.RecycleBin

    @javax.inject.Inject @com.webtecit.filepilot.core.common.ApplicationScope
    lateinit var appScope: kotlinx.coroutines.CoroutineScope

    override fun onCreate() {
        super.onCreate()
        // Apply the saved theme before the first window is created, so the splash matches it.
        ThemeMirror.applyStored(this)
        // Remove Recycle Bin items older than 30 days.
        appScope.launch { runCatching { recycleBin.purgeExpired() } }
    }

    override fun newImageLoader(context: PlatformContext): ImageLoader =
        ImageLoader.Builder(context).crossfade(true).build()
}
