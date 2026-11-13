package com.webtecit.devicepilot.brand

import android.content.Context
import android.content.Intent
import android.net.Uri
import com.webtecit.devicepilot.system.SystemSettings

/** Public web pages (GitHub Pages) and the support address. */
object Links {
    private const val BASE = "https://ahoshan-habib-nayon.github.io/PROFILE/devicepilot-app/"
    const val HOME = BASE + "index.html"
    const val PRIVACY = BASE + "privacy.html"
    const val TERMS = BASE + "terms.html"
    const val DISCLAIMER = BASE + "disclaimer.html"
    const val SUPPORT_EMAIL = "support.webtecit@gmail.com"

    fun emailSupport(context: Context) {
        SystemSettings.open(
            context,
            Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:$SUPPORT_EMAIL"))
                .putExtra(Intent.EXTRA_SUBJECT, "DevicePilot support"),
        )
    }
}
