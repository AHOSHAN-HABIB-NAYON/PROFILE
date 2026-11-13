package com.webtecit.devicepilot.feature.settings

import com.webtecit.devicepilot.core.common.AppInfo

/** In-app copies of the legal documents. Keep docs/ in the repository in sync with these. */
object LegalTexts {
    private const val UPDATED = "13 November 2026"

    val privacy = """
        Privacy Policy — ${AppInfo.NAME}
        Last updated: $UPDATED

        ${AppInfo.NAME} ("the app") is developed by ${AppInfo.DEVELOPER} (${AppInfo.COMPANY}, ${AppInfo.WEBSITE}). This policy explains what the app accesses and what happens to that information.

        1. Summary
        • No account, no sign-in, no advertising and no analytics or tracking SDKs.
        • Device information is processed on your phone and is not sent to us or to anyone else.
        • The app only connects to the internet when you start a speed test or ask to see your public IP address.

        2. Information the app reads on your device
        • Device and system information: model, manufacturer, Android version, processor, memory, storage, display, sensors, cameras (technical characteristics only — the camera is never opened), battery status and network status. No permission is required for these.
        • Photos, videos and audio (only if you grant media permission): file names, sizes, dates and contents are read to measure storage and to find large or identical (duplicate) files. Duplicate detection calculates a checksum on the device. Files are not uploaded.
        • Folders you pick with the system folder picker: file names, sizes and types are read to find APK files, temporary files and empty folders. Access is limited to the folder you choose, and you can revoke it at any time.
        • Usage access (optional special access you turn on in system settings): app usage time and app storage sizes, shown in the App Manager and Speed Up screens.
        • Installed apps with a launcher icon: names, versions, install dates and requested permissions, shown in the App Manager.

        3. Information stored on your device
        • Settings (theme, refresh interval, notification choices).
        • Charging history: start/end time, battery level, power source and peak temperature of each charging session, kept for 90 days. You can clear it in the Charging screen or in Settings.
        • Exported reports are saved only where you choose.
        The app does not use cloud backup for this data.

        4. Internet connections
        • Speed test: when you tap Start, the app downloads and uploads test data from speed.cloudflare.com (Cloudflare, Inc.). Ping is measured by opening a connection to 1.1.1.1. Cloudflare receives your IP address as part of any internet connection; its privacy policy applies to that service.
        • Public IP: only when you tap "Show public IP", the app requests speed.cloudflare.com/cdn-cgi/trace and displays your IP address, country code and nearest server. This is not stored or sent anywhere else.
        No device information, file information or identifiers are included in these requests.

        5. Deleting files
        Files are only deleted after you select them and confirm. Android may show its own confirmation for files created by other apps. Deleted files cannot be recovered by the app.

        6. Notifications
        If you allow notifications, the app shows local alerts about charging, high temperature and low storage. They are generated on the device.

        7. Children
        The app is a general utility and is not directed at children under 13. It collects no personal information from anyone.

        8. Your choices
        You can deny or revoke any permission in Android settings; the related feature then shows "Permission Required". Uninstalling the app removes all of its stored data.

        9. Changes
        If this policy changes, the new version will be included in an app update with a new "Last updated" date.

        10. Contact
        ${AppInfo.DEVELOPER} — ${AppInfo.COMPANY}
        Website: ${AppInfo.WEBSITE}
    """.trimIndent()

    val terms = """
        Terms & Conditions — ${AppInfo.NAME}
        Last updated: $UPDATED

        1. Acceptance
        By using ${AppInfo.NAME} you agree to these terms. If you do not agree, please uninstall the app.

        2. What the app does
        The app displays information that Android reports about your device, helps you find and delete files you choose, runs hardware tests you start, and links to Android settings. It does not change system settings on its own.

        3. Your responsibility
        • You decide which files to delete. Review selections carefully; deleted files cannot be restored by the app.
        • Hardware tests (flashlight, vibration, speaker, full-screen colours) are used at your own discretion. Do not look directly into the flashlight.
        • Speed tests use mobile data when you are not on Wi-Fi.

        4. Accuracy
        Values come from your device's hardware and Android. Manufacturers implement these differently, so some values may be unavailable, estimated or inaccurate. Estimated values are labelled. The health score is an indicator, not a professional diagnosis.

        5. Licence
        You are granted a personal, non-exclusive, non-transferable licence to use the app. You may not resell, decompile for redistribution, or misrepresent the app.

        6. No warranty
        The app is provided "as is" without warranties of any kind, to the extent permitted by law.

        7. Limitation of liability
        To the maximum extent permitted by law, the developer is not liable for any loss of data, damage to devices or other damages arising from the use of the app.

        8. Changes
        These terms may be updated with new versions of the app.

        9. Contact
        ${AppInfo.DEVELOPER} — ${AppInfo.COMPANY} — ${AppInfo.WEBSITE}
    """.trimIndent()

    val disclaimer = """
        Disclaimer — ${AppInfo.NAME}
        Last updated: $UPDATED

        • ${AppInfo.NAME} cannot physically cool your phone, increase its hardware speed or repair a battery. It shows real readings and explains actions you can take.
        • Android manages memory automatically. The app does not "kill" apps, because doing so usually makes a phone slower.
        • Android does not let apps clear other apps' caches or read other apps' private data. The app does not claim to.
        • Battery cycle count, battery health, CPU temperature, CPU usage and charging current are not available on every device. When a value is not provided by your phone, the app shows "Not Available", "Not Supported", "Permission Required" or "Restricted by Android" instead of guessing.
        • Estimated values (marked "est.") are calculated from other readings and may differ from the true value.
        • Speed test results depend on the test server, your network and other apps using the connection at the same time.
        • ${AppInfo.NAME} is not affiliated with Google or with any phone manufacturer. Android is a trademark of Google LLC.
    """.trimIndent()

    val licenses = listOf(
        "AndroidX (Core, Activity, Lifecycle, Navigation, Room, DataStore, WorkManager, Hilt integration)" to "Apache License 2.0",
        "Jetpack Compose & Material 3" to "Apache License 2.0",
        "Kotlin & kotlinx.coroutines" to "Apache License 2.0",
        "Dagger / Hilt" to "Apache License 2.0",
    )
}
