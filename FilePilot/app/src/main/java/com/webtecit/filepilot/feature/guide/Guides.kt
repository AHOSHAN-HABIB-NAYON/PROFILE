package com.webtecit.filepilot.feature.guide

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.CleaningServices
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.ContentPaste
import androidx.compose.material.icons.rounded.Construction
import androidx.compose.material.icons.rounded.Devices
import androidx.compose.material.icons.rounded.DonutLarge
import androidx.compose.material.icons.rounded.Fingerprint
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.FolderZip
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.SelectAll
import androidx.compose.material.icons.rounded.Sync
import androidx.compose.material.icons.rounded.Terminal
import androidx.compose.material.icons.rounded.TouchApp

/** The walkthrough for each screen, shown once. */
object Guides {
    val HOME = "home" to listOf(
        GuideStep(Icons.Rounded.Home, "Welcome to FilePilot", "Home shows your storage, file categories and every tool at a glance."),
        GuideStep(Icons.Rounded.AutoAwesome, "Smart search", "Tap the search bar and type naturally, like \"large videos from last week\" or \"pdf invoice\"."),
        GuideStep(Icons.Rounded.Folder, "Bottom menu", "Files opens your storage, Tools has every utility, Library keeps favorites and recent files."),
        GuideStep(Icons.Rounded.Sync, "Work in the background", "Copies, scans and extractions keep running while you use other screens; progress shows here and in notifications."),
    )
    val BROWSER = "browser" to listOf(
        GuideStep(Icons.Rounded.TouchApp, "Open and act", "Tap to open. Use ⋮ on any item for rename, details, ZIP, Secure Folder and more."),
        GuideStep(Icons.Rounded.SelectAll, "Select many", "Long-press to start selecting, then copy, move, share or delete several items at once."),
        GuideStep(Icons.Rounded.ContentPaste, "Multi copy-paste", "Copy from several folders: items are added to the clipboard. Open any folder and tap Paste here — paste again elsewhere if you like."),
    )
    val TOOLS = "tools" to listOf(
        GuideStep(Icons.Rounded.Construction, "All tools in one place", "Storage, developer and security tools. Each one explains itself the first time you open it."),
    )
    val EDITOR = "editor" to listOf(
        GuideStep(Icons.Rounded.Code, "Code Studio", "Tabs, syntax highlighting, folding and bracket matching. Unsaved work is kept as a draft."),
        GuideStep(Icons.Rounded.Search, "Find & replace", "Search with match case, whole word or regular expressions, and replace one or all — or across the whole project."),
        GuideStep(Icons.Rounded.PlayArrow, "Run websites", "On HTML files tap ▶ to run. Turn your phone sideways for a desktop-style side-by-side editor and preview."),
    )
    val PREVIEW = "preview" to listOf(
        GuideStep(Icons.Rounded.Devices, "Real device widths", "Switch Mobile, Tablet or Desktop. Desktop really renders at 1280px+ and is scaled to fit your screen."),
        GuideStep(Icons.Rounded.Terminal, "Console", "See console.log output and loading errors from your page."),
    )
    val ANALYZER = "analyzer" to listOf(
        GuideStep(Icons.Rounded.DonutLarge, "See what fills your phone", "The scan runs in the background. Tap a folder or file to open it."),
    )
    val CLEANER = "cleaner" to listOf(
        GuideStep(Icons.Rounded.CleaningServices, "Review before cleaning", "Nothing is removed until you confirm. With the Recycle Bin on, files can be restored for 30 days."),
    )
    val VAULT = "vault" to listOf(
        GuideStep(Icons.Rounded.Lock, "Encrypted Secure Folder", "Files are encrypted with AES-256 and kept private on this device."),
        GuideStep(Icons.Rounded.Fingerprint, "Unlock your way", "Use your PIN or fingerprint. Keep backups: clearing app data deletes the keys."),
    )
    val ARCHIVE = "archive" to listOf(
        GuideStep(Icons.Rounded.FolderZip, "Every archive", "Open ZIP, RAR, 7z, TAR and GZ. Browse folders inside, extract selected items or everything, and use passwords."),
    )

    val ALL = listOf(HOME, BROWSER, TOOLS, EDITOR, PREVIEW, ANALYZER, CLEANER, VAULT, ARCHIVE).map { it.first }
}
