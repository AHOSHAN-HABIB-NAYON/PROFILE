@file:OptIn(ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.settings

import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.size
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.Mail
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.webtecit.filepilot.BuildConfig
import com.webtecit.filepilot.brand.Brand
import com.webtecit.filepilot.core.common.copyText
import com.webtecit.filepilot.core.designsystem.AppCard
import com.webtecit.filepilot.core.designsystem.AppLogo
import com.webtecit.filepilot.core.designsystem.IconTile
import com.webtecit.filepilot.core.designsystem.SettingsRow
import kotlinx.coroutines.launch

@Composable
fun AboutScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    fun show(message: String?) {
        if (message != null) scope.launch { snackbar.showSnackbar(message) }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("About") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back") } },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(8.dp))
            AppLogo(88.dp)
            Text(Brand.APP_NAME, style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center)
            Text(Brand.STORE_NAME, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            Text(
                "Version ${BuildConfig.VERSION_NAME} · Build ${BuildConfig.VERSION_CODE}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                "A fast, private file manager that works offline. Your files never leave your device.",
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            AppCard(modifier = Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    androidx.compose.foundation.Image(
                        androidx.compose.ui.res.painterResource(com.webtecit.filepilot.R.drawable.developer_photo),
                        contentDescription = "Photo of ${Brand.DEVELOPER}",
                        contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                        modifier = Modifier.size(72.dp).clip(androidx.compose.foundation.shape.CircleShape),
                    )
                    Spacer(Modifier.width(14.dp))
                    Column {
                        Text("Developer", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(Brand.DEVELOPER, style = MaterialTheme.typography.titleMedium)
                        Text(Brand.BRAND, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
                    }
                }
            }

            AppCard(modifier = Modifier.fillMaxWidth(), contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 4.dp)) {
                SettingsRow("Visit website", subtitle = "webtecit.com", icon = Icons.Rounded.Language, onClick = {
                    show(Brand.openUrl(context, Brand.WEBSITE))
                })
                SettingsRow("Contact developer", subtitle = Brand.SUPPORT_EMAIL, icon = Icons.Rounded.Mail, onClick = {
                    show(Brand.email(context, "${Brand.APP_NAME}: question"))
                })
                SettingsRow("Copy email address", icon = Icons.Rounded.ContentCopy, onClick = {
                    copyText(context, "Email", Brand.SUPPORT_EMAIL)
                    Toast.makeText(context, "Email address copied", Toast.LENGTH_SHORT).show()
                })
                SettingsRow("Share app", icon = Icons.Rounded.Share, onClick = { show(Brand.shareApp(context)) })
                SettingsRow("Privacy Policy", icon = Icons.Rounded.Language, onClick = { show(Brand.openUrl(context, Brand.PRIVACY_URL)) })
                SettingsRow("Terms & Conditions", icon = Icons.Rounded.Language, onClick = { show(Brand.openUrl(context, Brand.TERMS_URL)) })
                SettingsRow("Disclaimer", icon = Icons.Rounded.Language, onClick = { show(Brand.openUrl(context, Brand.DISCLAIMER_URL)) })
            }

            Text(
                "© 2026 ${Brand.DEVELOPER} · ${Brand.BRAND}. All rights reserved.",
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
