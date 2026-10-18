package com.webtecit.nayon.feature.about

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import com.webtecit.nayon.R
import com.webtecit.nayon.core.designsystem.component.GroupDivider
import com.webtecit.nayon.core.designsystem.component.ScreenScaffold
import com.webtecit.nayon.core.designsystem.component.SettingsGroup
import com.webtecit.nayon.core.designsystem.component.SettingsRow

private const val APACHE_2_URL = "https://www.apache.org/licenses/LICENSE-2.0"

/** Direct dependencies shipped in the APK. Keep in sync with gradle/libs.versions.toml. */
private val libraries = listOf(
    "Kotlin Standard Library & Coroutines" to "JetBrains",
    "Jetpack Compose UI & Foundation" to "Google / AndroidX",
    "Compose Material 3 & Material Icons" to "Google / AndroidX",
    "AndroidX Core & Core SplashScreen" to "Google / AndroidX",
    "AndroidX Activity" to "Google / AndroidX",
    "AndroidX Lifecycle" to "Google / AndroidX",
    "AndroidX Navigation" to "Google / AndroidX",
    "AndroidX DataStore" to "Google / AndroidX",
)

@Composable
fun LicensesScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val license = stringResource(R.string.licenses_apache)
    ScreenScaffold(title = stringResource(R.string.licenses_title), onBack = onBack) {
        item {
            Text(stringResource(R.string.licenses_intro), style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        item {
            SettingsGroup {
                libraries.forEachIndexed { i, (name, owner) ->
                    if (i > 0) GroupDivider()
                    SettingsRow(
                        title = name,
                        subtitle = "$owner · $license",
                        icon = Icons.Outlined.Code,
                        onClick = { context.openExternalLink(APACHE_2_URL) },
                    )
                }
            }
        }
    }
}
