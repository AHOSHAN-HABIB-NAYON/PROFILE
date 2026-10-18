package com.webtecit.nayon.feature.appearance

import androidx.annotation.StringRes
import com.webtecit.nayon.R
import com.webtecit.nayon.core.designsystem.theme.ThemeFamily
import com.webtecit.nayon.core.designsystem.theme.ThemeMode

@StringRes fun ThemeFamily.nameRes(): Int = when (this) {
    ThemeFamily.AURORA -> R.string.theme_aurora
    ThemeFamily.OBSIDIAN -> R.string.theme_obsidian
    ThemeFamily.EMERALD -> R.string.theme_emerald
    ThemeFamily.CYBER_NEON -> R.string.theme_cyber_neon
    ThemeFamily.WARM_MINIMAL -> R.string.theme_warm_minimal
    ThemeFamily.DEVICE -> R.string.theme_device
}

@StringRes fun ThemeFamily.descriptionRes(): Int = when (this) {
    ThemeFamily.AURORA -> R.string.theme_aurora_desc
    ThemeFamily.OBSIDIAN -> R.string.theme_obsidian_desc
    ThemeFamily.EMERALD -> R.string.theme_emerald_desc
    ThemeFamily.CYBER_NEON -> R.string.theme_cyber_neon_desc
    ThemeFamily.WARM_MINIMAL -> R.string.theme_warm_minimal_desc
    ThemeFamily.DEVICE -> R.string.theme_device_desc
}

@StringRes fun ThemeMode.nameRes(): Int = when (this) {
    ThemeMode.SYSTEM -> R.string.appearance_mode_system
    ThemeMode.LIGHT -> R.string.appearance_mode_light
    ThemeMode.DARK -> R.string.appearance_mode_dark
    ThemeMode.AMOLED -> R.string.appearance_mode_amoled
    ThemeMode.SCHEDULED -> R.string.appearance_mode_scheduled
}

@StringRes fun ThemeMode.descriptionRes(): Int = when (this) {
    ThemeMode.SYSTEM -> R.string.appearance_mode_system_desc
    ThemeMode.LIGHT -> R.string.appearance_mode_light_desc
    ThemeMode.DARK -> R.string.appearance_mode_dark_desc
    ThemeMode.AMOLED -> R.string.appearance_mode_amoled_desc
    ThemeMode.SCHEDULED -> R.string.appearance_mode_scheduled_desc
}
