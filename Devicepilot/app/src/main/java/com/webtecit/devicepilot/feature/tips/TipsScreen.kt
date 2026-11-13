package com.webtecit.devicepilot.feature.tips

import android.content.Context
import android.provider.Settings
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Animation
import androidx.compose.material.icons.filled.Apps
import androidx.compose.material.icons.filled.BatteryFull
import androidx.compose.material.icons.filled.DeveloperMode
import androidx.compose.material.icons.filled.RestartAlt
import androidx.compose.material.icons.filled.ScreenshotMonitor
import androidx.compose.material.icons.filled.SdStorage
import androidx.compose.material.icons.filled.SyncDisabled
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.webtecit.devicepilot.core.common.SystemIntents
import com.webtecit.devicepilot.core.designsystem.DpCard
import com.webtecit.devicepilot.core.designsystem.DpScaffold
import com.webtecit.devicepilot.core.designsystem.ExpandableSection
import com.webtecit.devicepilot.core.designsystem.InfoRow
import com.webtecit.devicepilot.core.designsystem.NoteText
import com.webtecit.devicepilot.core.designsystem.Spacing
import com.webtecit.devicepilot.core.designsystem.StatusChip
import com.webtecit.devicepilot.core.designsystem.Tone
import java.util.Locale

data class Tip(
    val icon: ImageVector,
    val title: String,
    val explanation: String,
    val benefits: List<String>,
    val downsides: List<String>,
    val steps: List<String>,
    val buttonLabel: String?,
    val open: ((Context) -> Unit)?,
)

private val tips = listOf(
    Tip(
        Icons.Default.DeveloperMode, "Enable Developer Options",
        "Developer Options is a hidden settings menu. It is needed to change animation speeds.",
        listOf("Unlocks animation scale settings"),
        listOf("Contains advanced settings — change only what you understand", "Some banking apps warn when it is on; you can turn it off again"),
        listOf("Open Settings › About phone", "Tap \"Build number\" seven times (on Xiaomi: \"MIUI/OS version\"; on Samsung: Software information › Build number)", "Enter your PIN if asked", "Developer Options now appears in Settings › System (or Additional settings)"),
        "Open About phone", { SystemIntents.aboutPhone(it) },
    ),
    Tip(
        Icons.Default.Animation, "Set animations to 0.5x",
        "Android plays animations when opening apps and switching screens. Halving their length makes the phone feel quicker without affecting real performance.",
        listOf("Apps and menus appear faster", "No battery cost"),
        listOf("Transitions look less smooth", "Turning animations fully off can make some apps behave oddly — 0.5x is a safe middle"),
        listOf("Open Developer Options", "Set Window animation scale to 0.5x", "Set Transition animation scale to 0.5x", "Set Animator duration scale to 0.5x"),
        "Open Developer Options", { SystemIntents.developerOptions(it) },
    ),
    Tip(
        Icons.Default.SdStorage, "Keep free storage",
        "Flash storage slows down when nearly full, and Android needs space for updates and app caches.",
        listOf("Faster app installs and updates", "Fewer slowdowns and crashes"),
        listOf("You may need to move photos to cloud or a computer"),
        listOf("Keep at least 10–15% of storage free", "Use Devicepilot's Large files and Duplicates tools", "Delete old downloads and APK files"),
        "Open storage settings", { SystemIntents.storage(it) },
    ),
    Tip(
        Icons.Default.Apps, "Uninstall unused apps",
        "Installed apps can run background jobs, receive notifications and keep storage busy even when you don't open them.",
        listOf("More free storage and memory", "Better battery life"),
        listOf("You'll need to reinstall an app if you want it back"),
        listOf("Open Settings › Apps", "Sort by size or last used", "Uninstall or disable apps you don't need"),
        "Open apps list", { SystemIntents.apps(it) },
    ),
    Tip(
        Icons.Default.SystemUpdate, "Update Android and apps",
        "Updates fix bugs, improve performance and close security holes.",
        listOf("Security fixes", "Performance improvements"),
        listOf("Large downloads — use Wi-Fi", "The first boot after a major update can be slower for a day while apps are optimised"),
        listOf("Open Settings › System › System update (or Software update)", "Install any available update", "Update apps from the Play Store"),
        "Check for updates", { SystemIntents.systemUpdate(it) },
    ),
    Tip(
        Icons.Default.BatteryFull, "Review battery usage",
        "Android shows which apps used the most battery since the last full charge.",
        listOf("Find apps that drain battery in the background"),
        listOf("Restricting an app may delay its notifications"),
        listOf("Open Settings › Battery › Battery usage", "Tap an app with unusually high use", "Choose \"Restricted\" or \"Optimised\" background usage"),
        "Open battery usage", { SystemIntents.batteryUsage(it) },
    ),
    Tip(
        Icons.Default.SyncDisabled, "Reduce background activity",
        "Auto-sync, location and many widgets wake the phone regularly.",
        listOf("Longer battery life", "Less heat"),
        listOf("Some data updates less often"),
        listOf("Turn on Battery Saver when you need it", "Remove widgets you don't use", "Turn off auto-sync for accounts you don't need"),
        "Battery Saver", { SystemIntents.batterySaver(it) },
    ),
    Tip(
        Icons.Default.ScreenshotMonitor, "Use high refresh rate when supported",
        "90/120 Hz displays make scrolling look smoother.",
        listOf("Smoother scrolling and animations"),
        listOf("Uses more battery than 60 Hz"),
        listOf("Open Settings › Display", "Find \"Smooth display\", \"Motion smoothness\" or \"Refresh rate\"", "Choose the high or adaptive option"),
        "Open display settings", { SystemIntents.display(it) },
    ),
    Tip(
        Icons.Default.RestartAlt, "Restart occasionally",
        "A restart clears temporary state and stops stuck background processes.",
        listOf("Fixes many slowdowns and glitches"),
        listOf("Takes a minute", "Not needed every day — Android manages memory itself"),
        listOf("Press and hold the power button (or power + volume up on some phones)", "Tap Restart"),
        null, null,
    ),
)

@Composable
fun TipsScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val scales = remember {
        listOf(
            "Window animation" to Settings.Global.WINDOW_ANIMATION_SCALE,
            "Transition animation" to Settings.Global.TRANSITION_ANIMATION_SCALE,
            "Animator duration" to Settings.Global.ANIMATOR_DURATION_SCALE,
        ).map { (l, k) -> l to runCatching { Settings.Global.getFloat(context.contentResolver, k) }.getOrDefault(1f) }
    }
    val devOn = remember {
        runCatching { Settings.Global.getInt(context.contentResolver, Settings.Global.DEVELOPMENT_SETTINGS_ENABLED) == 1 }.getOrDefault(false)
    }
    DpScaffold("Phone Speed Tips", onBack) { padding ->
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = Spacing.lg, end = Spacing.lg, top = padding.calculateTopPadding() + Spacing.sm, bottom = Spacing.xxl),
            verticalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            item {
                DpCard {
                    Text("Your current settings", style = MaterialTheme.typography.titleSmall)
                    InfoRow("Developer Options", if (devOn) "On" else "Off")
                    scales.forEach { (l, v) -> InfoRow(l, String.format(Locale.US, "%.1fx", v)) }
                    NoteText("Devicepilot only reads these values. You change them yourself in system settings.")
                }
            }
            items(tips, key = { it.title }) { tip ->
                ExpandableSection(tip.title, tip.icon) {
                    Text(tip.explanation, style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(Spacing.sm))
                    StatusChip("Benefits", Tone.GOOD)
                    tip.benefits.forEach { Text("• $it", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 2.dp)) }
                    Spacer(Modifier.height(Spacing.sm))
                    StatusChip("Possible downsides", Tone.WARNING)
                    tip.downsides.forEach { Text("• $it", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 2.dp)) }
                    Spacer(Modifier.height(Spacing.sm))
                    Text("Steps", style = MaterialTheme.typography.titleSmall)
                    tip.steps.forEachIndexed { i, s -> Text("${i + 1}. $s", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 2.dp)) }
                    if (tip.buttonLabel != null && tip.open != null) {
                        Spacer(Modifier.height(Spacing.sm))
                        Row { OutlinedButton(onClick = { tip.open.invoke(context) }) { Text(tip.buttonLabel) } }
                    }
                }
            }
        }
    }
}
