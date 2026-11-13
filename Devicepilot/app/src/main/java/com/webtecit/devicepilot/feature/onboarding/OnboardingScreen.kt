package com.webtecit.devicepilot.feature.onboarding

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BatteryChargingFull
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.CleaningServices
import androidx.compose.material.icons.filled.Insights
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.PermMedia
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.QueryStats
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material.icons.filled.TouchApp
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.webtecit.devicepilot.core.common.AppInfo
import com.webtecit.devicepilot.core.common.SystemIntents
import com.webtecit.devicepilot.core.designsystem.AppLogo
import com.webtecit.devicepilot.core.designsystem.DpCard
import com.webtecit.devicepilot.core.designsystem.IconBadge
import com.webtecit.devicepilot.core.designsystem.Spacing
import com.webtecit.devicepilot.core.designsystem.StatusChip
import com.webtecit.devicepilot.core.designsystem.Tone
import com.webtecit.devicepilot.core.permissions.Permissions
import com.webtecit.devicepilot.core.permissions.rememberOnResumeCheck
import com.webtecit.devicepilot.core.permissions.rememberPermissionGroup
import com.webtecit.devicepilot.data.local.SettingsRepository
import com.webtecit.devicepilot.data.repository.AppsRepository
import com.webtecit.devicepilot.data.repository.MediaAccess
import com.webtecit.devicepilot.data.repository.StorageScanRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class OnboardingViewModel @Inject constructor(
    private val settings: SettingsRepository,
    val storage: StorageScanRepository,
    val apps: AppsRepository,
) : ViewModel() {
    fun finish(notificationsGranted: Boolean) {
        viewModelScope.launch {
            settings.setNotificationsEnabled(notificationsGranted)
            settings.setOnboardingDone(true)
        }
    }
}

@Composable
fun OnboardingScreen(onOpenLegal: (String) -> Unit, viewModel: OnboardingViewModel = hiltViewModel()) {
    val pager = rememberPagerState { 4 }
    val scope = rememberCoroutineScope()
    var agreed by rememberSaveable { mutableStateOf(false) }
    val context = LocalContext.current

    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).statusBarsPadding().navigationBarsPadding()) {
        HorizontalPager(
            state = pager,
            userScrollEnabled = pager.currentPage < 2 || agreed,
            modifier = Modifier.weight(1f),
        ) { page ->
            when (page) {
                0 -> WelcomePage()
                1 -> FeaturesPage()
                2 -> PrivacyPage(agreed, { agreed = it }, onOpenLegal)
                else -> PermissionsPage(viewModel)
            }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = Spacing.xl, vertical = Spacing.lg), verticalAlignment = Alignment.CenterVertically) {
            Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                repeat(4) { i ->
                    val active = i == pager.currentPage
                    Box(
                        Modifier.height(8.dp).width(if (active) 22.dp else 8.dp).clip(CircleShape)
                            .background(if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline),
                    )
                }
            }
            val page = pager.currentPage
            Button(
                enabled = page != 2 || agreed,
                onClick = {
                    if (page < 3) scope.launch { pager.animateScrollToPage(page + 1) }
                    else viewModel.finish(Permissions.notificationPermission?.let { Permissions.isGranted(context, it) } ?: true)
                },
            ) {
                Text(when (page) { 0 -> "Get Started"; 1 -> "Next"; 2 -> "I agree, continue"; else -> "Go to dashboard" })
            }
        }
    }
}

@Composable
private fun WelcomePage() {
    val transition = rememberInfiniteTransition(label = "logo")
    val scale by transition.animateFloat(1f, 1.06f, infiniteRepeatable(tween(1400, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "scale")
    Column(
        Modifier.fillMaxSize().padding(Spacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        AppLogo(112.dp, Modifier.scale(scale))
        Spacer(Modifier.height(Spacing.xl))
        Text(AppInfo.NAME, style = MaterialTheme.typography.displaySmall, color = MaterialTheme.colorScheme.onBackground)
        Text(AppInfo.SUBTITLE, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(Spacing.lg))
        Text(
            "Check your phone's health, see what is using your storage and test your hardware. " +
                "Everything runs on your device and works offline.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun FeaturesPage() {
    val features = listOf(
        Triple(Icons.Default.PhoneAndroid, "Device Information", "Model, Android version, processor, memory, display and sensors"),
        Triple(Icons.Default.BatteryChargingFull, "Battery Health", "Level, temperature, voltage, health status and charging history"),
        Triple(Icons.Default.Storage, "Storage Analyzer", "Large files, duplicates and storage by category"),
        Triple(Icons.Default.QueryStats, "Performance Monitor", "Live memory, CPU frequency, temperature and network activity"),
        Triple(Icons.Default.CleaningServices, "Smart Cleaner", "Find old APKs, temporary files and empty folders, delete only what you choose"),
        Triple(Icons.Default.TouchApp, "Hardware Diagnostics", "Touch, display, speaker, vibration, flashlight and sensor tests"),
    )
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(Spacing.xl)) {
        Text("What you can do", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(Spacing.lg))
        features.forEach { (icon, title, text) ->
            Row(Modifier.padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                IconBadge(icon, MaterialTheme.colorScheme.primary, 44.dp)
                Spacer(Modifier.width(Spacing.lg))
                Column {
                    Text(title, style = MaterialTheme.typography.titleSmall)
                    Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun PrivacyPage(agreed: Boolean, onAgree: (Boolean) -> Unit, onOpenLegal: (String) -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(Spacing.xl)) {
        IconBadge(Icons.Default.Security, MaterialTheme.colorScheme.secondary, 52.dp)
        Spacer(Modifier.height(Spacing.md))
        Text("Your privacy", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(Spacing.sm))
        Text(
            "Devicepilot has no account, no ads and no analytics. Device information stays on your phone and is never uploaded.",
            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(Spacing.lg))
        DpCard {
            Text("What the app reads", style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(Spacing.sm))
            PrivacyLine("Battery, memory, storage, display and sensor values from Android")
            PrivacyLine("Photos, videos and audio — only if you allow it, to find large and duplicate files")
            PrivacyLine("Folders you pick yourself — to find APKs, temporary files and empty folders")
            PrivacyLine("App usage time — only if you turn on Usage access, to show app sizes and activity")
            PrivacyLine("Internet — only when you start a speed test (uses speed.cloudflare.com)")
        }
        Spacer(Modifier.height(Spacing.lg))
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            TextButton(onClick = { onOpenLegal("privacy") }) { Text("Privacy Policy") }
            TextButton(onClick = { onOpenLegal("terms") }) { Text("Terms") }
            TextButton(onClick = { onOpenLegal("disclaimer") }) { Text("Disclaimer") }
        }
        Row(
            Modifier.fillMaxWidth().clip(MaterialTheme.shapes.medium).clickable { onAgree(!agreed) }.padding(vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Checkbox(checked = agreed, onCheckedChange = onAgree)
            Text("I have read and agree to the Privacy Policy, Terms & Conditions and Disclaimer.", style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun PrivacyLine(text: String) {
    Row(Modifier.padding(vertical = 4.dp)) {
        Text("•", color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(end = 8.dp))
        Text(text, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun PermissionsPage(viewModel: OnboardingViewModel) {
    val context = LocalContext.current
    val notif = Permissions.notificationPermission?.let { rememberPermissionGroup(arrayOf(it)) }
    val media = rememberPermissionGroup(viewModel.storage.mediaPermissions())
    val mediaAccess = rememberOnResumeCheck { viewModel.storage.mediaAccess() != MediaAccess.NONE }
    val usage = rememberOnResumeCheck { viewModel.apps.hasUsageAccess() }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(Spacing.xl)) {
        Text("Optional permissions", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(Spacing.xs))
        Text(
            "Each one is optional. You can skip them now — features ask again only when you open them, and you can change them later in Settings.",
            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(Spacing.lg))
        if (notif != null) {
            PermissionCard(Icons.Default.Notifications, "Notifications", "Charger, full-charge, overheating and low-storage alerts.", notif.granted) { notif.request() }
            Spacer(Modifier.height(Spacing.md))
        }
        PermissionCard(Icons.Default.PermMedia, "Photos, videos & audio", "Lets the Storage Analyzer measure media and find large or duplicate files. Nothing is uploaded.", mediaAccess || media.granted) { media.request() }
        Spacer(Modifier.height(Spacing.md))
        PermissionCard(Icons.Default.BarChart, "Usage access", "Shows app sizes and which apps you used most. Granted in system settings.", usage) { SystemIntents.usageAccess(context) }
        Spacer(Modifier.height(Spacing.md))
        PermissionCard(Icons.Default.Insights, "Device information", "Battery, memory, storage and sensors need no permission.", true) {}
    }
}

@Composable
private fun PermissionCard(icon: ImageVector, title: String, text: String, granted: Boolean, onAllow: () -> Unit) {
    DpCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconBadge(icon, MaterialTheme.colorScheme.primary)
            Spacer(Modifier.width(Spacing.md))
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleSmall)
                Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Spacer(Modifier.height(Spacing.md))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.CenterVertically) {
            if (granted) StatusChip("Allowed", Tone.GOOD)
            else {
                OutlinedButton(onClick = onAllow) { Text("Allow") }
            }
        }
    }
}

