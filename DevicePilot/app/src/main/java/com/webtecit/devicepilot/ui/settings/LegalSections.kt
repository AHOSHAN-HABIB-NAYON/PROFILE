package com.webtecit.devicepilot.ui.settings

import com.webtecit.devicepilot.BuildConfig
import com.webtecit.devicepilot.R

/** Privacy Policy and Disclaimer sections (title, body). Firewall / phone / install parts exist only in the full edition. */
object LegalSections {
    val privacy: List<Pair<Int, Int>> = listOfNotNull(
        R.string.privacy_s1_title to R.string.privacy_s1_text,
        R.string.privacy_s2_title to R.string.privacy_s2_text,
        R.string.privacy_s3_title to R.string.privacy_s3_text,
        if (BuildConfig.FULL) R.string.privacy_s4_title to R.string.privacy_s4_text else null,
        R.string.privacy_s5_title to R.string.privacy_s5_text,
        (if (BuildConfig.FULL) R.string.privacy_s6_title else R.string.privacy_s6_title_play) to
            (if (BuildConfig.FULL) R.string.privacy_s6_text else R.string.privacy_s6_text_play),
        if (BuildConfig.FULL) R.string.privacy_s7_title to R.string.privacy_s7_text else null,
        R.string.privacy_s8_title to R.string.privacy_s8_text,
    )

    val disclaimer: List<Pair<Int, Int>> = listOfNotNull(
        R.string.disc_s1_title to R.string.disc_s1_text,
        R.string.disc_s2_title to R.string.disc_s2_text,
        R.string.disc_s3_title to R.string.disc_s3_text,
        if (BuildConfig.FULL) R.string.disc_s4_title to R.string.disc_s4_text else null,
        if (BuildConfig.FULL) R.string.disc_s5_title to R.string.disc_s5_text else null,
        R.string.disc_s6_title to R.string.disc_s6_text,
    )
}
