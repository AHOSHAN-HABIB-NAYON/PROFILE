package com.webtecit.nayon.feature.about

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.core.net.toUri
import com.webtecit.nayon.R

/** Opens a link in another app. Shows a message instead of crashing if no app can handle it. */
fun Context.openExternalLink(url: String) {
    try {
        startActivity(Intent(Intent.ACTION_VIEW, url.toUri()).addCategory(Intent.CATEGORY_BROWSABLE))
    } catch (e: ActivityNotFoundException) {
        Toast.makeText(this, R.string.error_no_app_to_open_link, Toast.LENGTH_SHORT).show()
    }
}
