package com.webtecit.filepilot.brand

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri

/** Developer and support details shown in About and used by support actions. */
object Brand {
    const val APP_NAME = "FilePilot"
    /** Full title used for the Google Play listing. */
    const val STORE_NAME = "FilePilot: Coding Pro"
    const val DEVELOPER = "MD AHOSHAN HABIB NAYON"
    const val BRAND = "Webtecit Apps"
    const val WEBSITE = "https://webtecit.com"
    const val SUPPORT_EMAIL = "support.webtecit@gmail.com"

    /** Legal pages, published with GitHub Pages from this repository's filepilot-app folder. */
    private const val PAGES = "https://ahoshan-habib-nayon.github.io/PROFILE/filepilot-app/"
    const val PRIVACY_URL = PAGES + "privacy.html"
    const val TERMS_URL = PAGES + "terms.html"
    const val DISCLAIMER_URL = PAGES + "disclaimer.html"

    val openSourceLicenses = listOf(
        "CodeMirror 5" to "MIT License · © Marijn Haverbeke and others",
        "AndroidX (Compose, Room, Paging, Navigation, WebKit, Biometric, DataStore)" to "Apache License 2.0 · © The Android Open Source Project",
        "Kotlin, kotlinx.coroutines, kotlinx.serialization" to "Apache License 2.0 · © JetBrains s.r.o.",
        "Dagger / Hilt" to "Apache License 2.0 · © The Dagger Authors",
        "Coil" to "Apache License 2.0 · © Coil Contributors",
        "Material Design icons" to "Apache License 2.0 · © Google",
    )

    fun playStoreUrl(packageName: String) = "https://play.google.com/store/apps/details?id=$packageName"

    /** Returns null on success, or a message to show. */
    fun openUrl(context: Context, url: String): String? = start(context, Intent(Intent.ACTION_VIEW, Uri.parse(url)), "No browser is installed.")

    fun email(context: Context, subject: String, body: String = ""): String? {
        val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:")).apply {
            putExtra(Intent.EXTRA_EMAIL, arrayOf(SUPPORT_EMAIL))
            putExtra(Intent.EXTRA_SUBJECT, subject)
            if (body.isNotEmpty()) putExtra(Intent.EXTRA_TEXT, body)
        }
        return start(context, intent, "No email app is installed. Write to $SUPPORT_EMAIL.")
    }

    fun shareApp(context: Context): String? {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, APP_NAME)
            putExtra(Intent.EXTRA_TEXT, "Try $STORE_NAME by $BRAND: ${playStoreUrl(context.packageName.removeSuffix(".debug"))}")
        }
        return start(context, Intent.createChooser(intent, "Share $APP_NAME"), "No app can share text.")
    }

    private fun start(context: Context, intent: Intent, failure: String): String? = try {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        null
    } catch (_: ActivityNotFoundException) {
        failure
    }
}
