package com.webtecit.devicepilot.domain

enum class PermissionStatus { GRANTED, DENIED, NOT_REQUIRED }

object PermissionLogic {
    // Same values as android.app.AppOpsManager.MODE_* (kept local for unit tests).
    const val MODE_ALLOWED = 0
    const val MODE_IGNORED = 1
    const val MODE_ERRORED = 2
    const val MODE_DEFAULT = 3

    /**
     * Usage Access is an app-op. MODE_DEFAULT means "fall back to the manifest permission
     * grant", which some devices use after the user toggles the switch.
     */
    fun usageAccess(appOpMode: Int, permissionGranted: Boolean): PermissionStatus = when (appOpMode) {
        MODE_ALLOWED -> PermissionStatus.GRANTED
        MODE_DEFAULT -> if (permissionGranted) PermissionStatus.GRANTED else PermissionStatus.DENIED
        else -> PermissionStatus.DENIED
    }

    /** POST_NOTIFICATIONS only exists on Android 13 (API 33) and newer. */
    fun notifications(sdkInt: Int, granted: Boolean): PermissionStatus = when {
        sdkInt < 33 -> PermissionStatus.NOT_REQUIRED
        granted -> PermissionStatus.GRANTED
        else -> PermissionStatus.DENIED
    }

    /** Before Android 8 "unknown sources" was a single global switch the app cannot query reliably. */
    fun installSources(sdkInt: Int, canRequestInstalls: Boolean): PermissionStatus = when {
        sdkInt < 26 -> PermissionStatus.NOT_REQUIRED
        canRequestInstalls -> PermissionStatus.GRANTED
        else -> PermissionStatus.DENIED
    }
}
