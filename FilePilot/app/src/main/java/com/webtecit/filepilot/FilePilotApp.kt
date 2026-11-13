package com.webtecit.filepilot

import android.app.Application
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import coil3.request.crossfade
import com.webtecit.filepilot.core.preferences.ThemeMirror
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class FilePilotApp : Application(), SingletonImageLoader.Factory {

    override fun onCreate() {
        super.onCreate()
        // Apply the saved theme before the first window is created, so the splash matches it.
        ThemeMirror.applyStored(this)
    }

    override fun newImageLoader(context: PlatformContext): ImageLoader =
        ImageLoader.Builder(context).crossfade(true).build()
}
