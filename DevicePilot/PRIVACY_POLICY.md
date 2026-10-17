# DevicePilot Privacy Policy

_Last updated: 2026-10-17_

DevicePilot ("the app") is developed by **MD. AHOSHAN HABIB NAYON** (https://webtecit.com/). This policy describes what the app actually does with information.

## Summary

* No account, login, advertising or analytics.
* No backend server. The app does not send any personal or device data to the developer or to third parties.
* Everything the app shows is read on your device and stays on your device.

## Information the app reads (on device only)

| Information | Purpose | Permission |
|---|---|---|
| Device model, Android version, memory, storage, battery and thermal status | Display monitoring information and the health score | none / normal |
| Installed app list and app details | Apps manager, uninstall and firewall rule screens | `QUERY_ALL_PACKAGES` |
| App usage time, network usage per app, app storage sizes | Network, Apps and Optimize screens | Usage Access (you enable it) |
| SIM state, carrier name, IMEI (Android 9 and older only) | Device details page | `READ_PHONE_STATE` (optional) |
| Recent app activity events | Running apps page | Usage Access (you enable it) |
| Files you pick with the system file picker | Inspect, install, share or delete APK files; review large files | granted per file by you |

## Information the app stores

Stored only in the app's private storage on your device:

* Your settings (theme, temperature unit, refresh interval, alert choices and thresholds).
* Firewall rules (package names you chose to block on Wi-Fi and/or mobile data).
* Links to APK files you added to the APK manager.

Temperature history is kept in memory only and is lost when the app closes. Uninstalling the app deletes all stored data. Android cloud backup is disabled for the app.

## Firewall (VpnService)

The firewall uses Android's `VpnService` entirely on the device. Only apps you block are routed into it, and their packets are discarded. No traffic is forwarded to any server, recorded, or inspected.

## Installing, uninstalling and deleting

Installs and uninstalls always use Android's own confirmation screens. Files are deleted only after you confirm.

## Notifications

Optional alerts are generated on the device. They are off by default.

## Children

The app is not directed at children and collects no personal data from anyone.

## Changes

Changes to this policy will be published with app updates.

## Contact

Website: https://webtecit.com/
