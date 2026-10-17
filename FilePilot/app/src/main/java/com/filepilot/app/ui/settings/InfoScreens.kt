package com.filepilot.app.ui.settings

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.filepilot.app.BuildConfig
import com.filepilot.app.R
import com.filepilot.app.ui.components.BackTopBar
import com.filepilot.app.ui.navigation.LocalNavigator
import com.filepilot.app.ui.navigation.Routes

@Composable
fun AboutScreen() {
    val navigator = LocalNavigator.current
    Scaffold(topBar = { BackTopBar("About FilePilot", navigator::back) }) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Image(painterResource(R.drawable.ic_logo_mark), contentDescription = null, modifier = Modifier.size(84.dp))
            Spacer(Modifier.height(12.dp))
            Text("FilePilot", style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold))
            Text(
                "Version ${BuildConfig.VERSION_NAME} (build ${BuildConfig.VERSION_CODE})",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(20.dp))
            Text(
                "A fast, offline file manager for Android. Browse storage, preview images, video, audio, text and PDFs, " +
                    "work with ZIP archives and keep your storage tidy — all on your device.",
                style = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(16.dp))
            com.filepilot.app.ui.components.DeveloperCard()
            Spacer(Modifier.height(8.dp))
            Fact("Works offline", "No account, no server, no internet permission.")
            Fact("Private by design", "No analytics, ads or tracking. Settings, favorites and history stay on this device.")
            Fact("Respects Android security", "Uses MediaStore, the Storage Access Framework and All files access as Android intends.")
            Fact("Known limits", "No recycle bin: deletes are permanent after confirmation. RAR and 7z archives open in other apps. Password-protected PDFs and ZIPs aren't supported in the built-in viewers.")
            Spacer(Modifier.height(12.dp))
            TextButton(onClick = { navigator.go(Routes.PRIVACY) }) { Text("Privacy policy") }
            TextButton(onClick = { navigator.go(Routes.LICENSES) }) { Text("Open-source licenses") }
        }
    }
}

@Composable
private fun Fact(title: String, body: String) {
    Column(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
        Text(title, style = MaterialTheme.typography.titleSmall)
        Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

private val privacySections = listOf(
    "Summary" to "FilePilot is an offline file manager. It does not collect, upload, sell or share your files or personal data. It has no internet permission, so it cannot send data off your device.",
    "Files" to "FilePilot reads and changes files only when you use it: browsing, opening, copying, moving, renaming, deleting, compressing or extracting. All processing — including thumbnails, search, duplicate detection and archive handling — happens on your device. FilePilot does not scan your storage in the background.",
    "Permissions" to "FilePilot asks only for storage access. On Android 11 and later it can use “All files access” to work as a full file manager; you can choose media-only access or individual folders instead. On Android 13 and later, media access is split into photos, videos and audio. You can change or revoke access in Android Settings at any time.",
    "Data stored on your device" to "Your settings, favorites, recently opened files, search history, picked folders and the operation history are stored in FilePilot's private app storage. They are excluded from cloud backup and device-to-device transfer and are deleted when you uninstall the app. You can clear them in Settings.",
    "Sharing with other apps" to "When you choose Open with or Share, Android hands that specific file to the app you pick, with temporary read access. FilePilot does not control what the other app does with it.",
    "Analytics and ads" to "FilePilot contains no analytics, advertising, crash-reporting or tracking SDKs.",
    "Logs" to "FilePilot does not write file contents to system logs.",
    "Children" to "FilePilot does not knowingly collect any information from anyone, including children.",
    "Changes" to "If this policy changes, the updated version will ship inside a new version of the app.",
)

@Composable
fun PrivacyScreen() {
    val navigator = LocalNavigator.current
    Scaffold(topBar = { BackTopBar("Privacy policy", navigator::back) }) { padding ->
        LazyColumn(contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = padding.calculateTopPadding() + 8.dp, bottom = 32.dp)) {
            items(privacySections) { (title, body) ->
                Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 14.dp, bottom = 4.dp))
                Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

private data class License(val name: String, val owner: String, val license: String)

private val licenses = listOf(
    License("AndroidX Core, Activity, Lifecycle, Navigation", "The Android Open Source Project", "Apache License 2.0"),
    License("Jetpack Compose (UI, Foundation, Material 3, Material Icons)", "The Android Open Source Project", "Apache License 2.0"),
    License("AndroidX DataStore", "The Android Open Source Project", "Apache License 2.0"),
    License("AndroidX Core SplashScreen", "The Android Open Source Project", "Apache License 2.0"),
    License("AndroidX DocumentFile", "The Android Open Source Project", "Apache License 2.0"),
    License("AndroidX Media3 (ExoPlayer, UI)", "The Android Open Source Project", "Apache License 2.0"),
    License("Coil (coil-compose, coil-video)", "Coil Contributors", "Apache License 2.0"),
    License("Kotlin Standard Library & kotlinx.coroutines", "JetBrains s.r.o. and contributors", "Apache License 2.0"),
)

@Composable
fun LicensesScreen() {
    val navigator = LocalNavigator.current
    Scaffold(topBar = { BackTopBar("Open-source licenses", navigator::back) }) { padding ->
        LazyColumn(contentPadding = PaddingValues(top = padding.calculateTopPadding(), bottom = 32.dp)) {
            items(licenses) { l ->
                Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp)) {
                    Text(l.name, style = MaterialTheme.typography.bodyLarge)
                    Text("${l.owner} · ${l.license}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                HorizontalDivider(Modifier.padding(horizontal = 20.dp), color = MaterialTheme.colorScheme.outlineVariant)
            }
            item {
                Text(
                    APACHE_NOTICE,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(20.dp),
                )
            }
        }
    }
}

private const val APACHE_NOTICE = """Licensed under the Apache License, Version 2.0 (the "License"); you may not use these files except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License."""
