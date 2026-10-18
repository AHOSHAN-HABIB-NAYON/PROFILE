package com.webtecit.nayon.feature.browser

import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.SystemClock

/**
 * Opens Google Lens straight into its camera, the way Chrome's Lens button does.
 * Tries the known Lens entry points in order and reports whether one started; when none
 * exists (no Google app), the caller falls back to the photo / gallery sheet.
 */
object LensLauncher {
    const val GOOGLE_APP = "com.google.android.googlequicksearchbox"
    private const val LENS_APP = "com.google.ar.lens"
    private const val LENS_APP_ACTIVITY = "com.google.vr.apps.ornament.app.lens.LensLauncherActivity"

    /** Exported Lens activities of the Google app that open the Lens camera. */
    private val GOOGLE_APP_LENS_ACTIVITIES = listOf("LensExportedActivity", "LensLauncherActivity", "LensActivity")

    fun launchCamera(context: Context): Boolean = candidates(context).any { start(context, it) }

    private fun candidates(context: Context): List<Intent> {
        val flags = Intent.FLAG_ACTIVITY_NEW_TASK
        val list = mutableListOf<Intent>()
        // 1. The Google Lens app (a launcher that hands over to the Google app's Lens).
        list += Intent(Intent.ACTION_MAIN).setComponent(ComponentName(LENS_APP, LENS_APP_ACTIVITY)).addFlags(flags)
        // 2. An exported Lens activity of the Google app, found at runtime (names change between versions).
        googleAppLensActivity(context)?.let {
            list += Intent(Intent.ACTION_MAIN).setComponent(ComponentName(GOOGLE_APP, it)).addFlags(flags)
        }
        // 3. The Google app's Lens deep links, as used by Chrome and Android launchers.
        list += Intent(Intent.ACTION_VIEW, Uri.parse("googleapp://lens?ActivityLaunchTimestampNanos=${SystemClock.elapsedRealtimeNanos()}&IncognitoUriKey=false"))
            .setPackage(GOOGLE_APP).addFlags(flags)
        list += Intent(Intent.ACTION_VIEW, Uri.parse("google://lens")).setPackage(GOOGLE_APP).addFlags(flags)
        return list
    }

    private fun start(context: Context, intent: Intent): Boolean {
        if (intent.resolveActivity(context.packageManager) == null) return false
        return try {
            context.startActivity(intent)
            true
        } catch (e: ActivityNotFoundException) {
            false
        } catch (e: SecurityException) {
            false
        }
    }

    @Suppress("DEPRECATION")
    private fun googleAppLensActivity(context: Context): String? = try {
        context.packageManager.getPackageInfo(GOOGLE_APP, PackageManager.GET_ACTIVITIES).activities
            ?.filter { it.exported && it.enabled }
            ?.map { it.name }
            ?.let { names -> GOOGLE_APP_LENS_ACTIVITIES.firstNotNullOfOrNull { suffix -> names.firstOrNull { it.endsWith(".$suffix") } } }
    } catch (e: PackageManager.NameNotFoundException) {
        null
    } catch (e: RuntimeException) {
        null
    }
}
