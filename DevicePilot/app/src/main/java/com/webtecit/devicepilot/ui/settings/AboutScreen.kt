package com.webtecit.devicepilot.ui.settings

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Gavel
import androidx.compose.material.icons.outlined.PrivacyTip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.webtecit.devicepilot.BuildConfig
import com.webtecit.devicepilot.R
import com.webtecit.devicepilot.brand.Attribution
import com.webtecit.devicepilot.brand.DeveloperCard
import com.webtecit.devicepilot.ui.Routes
import com.webtecit.devicepilot.ui.common.DpCard
import com.webtecit.devicepilot.ui.common.IconBadge
import com.webtecit.devicepilot.ui.common.ScreenList

@Composable
fun AboutScreen(navigate: (String) -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current
    var showLicenses by remember { mutableStateOf(false) }
    ScreenList {
        item {
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                Spacer(Modifier.height(4.dp))
                Box(Modifier.size(80.dp).clip(RoundedCornerShape(22.dp))
                    .background(Brush.linearGradient(listOf(Color(0xFF2A7BFF), Color(0xFF0B1B3F))))) {
                    Image(painterResource(R.drawable.ic_launcher_foreground), null, Modifier.size(80.dp))
                }
                Spacer(Modifier.height(8.dp))
                Text(stringResource(R.string.app_name), style = MaterialTheme.typography.headlineSmall)
                Text(stringResource(R.string.app_tagline) + " · " + stringResource(R.string.settings_version, BuildConfig.VERSION_NAME),
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        item { DeveloperCard(large = true) }
        item {
            DpCard {
                Text(stringResource(R.string.about_text), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { navigate(Routes.PRIVACY) }) { Text(stringResource(R.string.title_privacy)) }
                    OutlinedButton(onClick = { navigate(Routes.DISCLAIMER) }) { Text(stringResource(R.string.title_disclaimer)) }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { com.webtecit.devicepilot.brand.Links.emailSupport(context) }) {
                        Text(stringResource(R.string.contact_support))
                    }
                    OutlinedButton(onClick = { showLicenses = true }) { Text(stringResource(R.string.settings_licenses)) }
                }
            }
        }
        item {
            Text("© ${Attribution.developerName} · ${Attribution.websiteLabel}", style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        }
    }
    if (showLicenses) LicensesDialog { showLicenses = false }
}

@Composable
private fun LegalSection(icon: ImageVector, title: Int, body: Int) {
    DpCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconBadge(icon, size = 30.dp)
            Spacer(Modifier.width(10.dp))
            Text(stringResource(title), style = MaterialTheme.typography.titleSmall)
        }
        Spacer(Modifier.height(6.dp))
        Text(stringResource(body), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun PrivacyScreen(navigate: (String) -> Unit) {
    ScreenList {
        item {
            DpCard(color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.PrivacyTip, null, tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(10.dp))
                    Text(stringResource(R.string.privacy_headline), style = MaterialTheme.typography.titleMedium)
                }
                Spacer(Modifier.height(4.dp))
                Text(stringResource(R.string.privacy_updated), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        LegalSections.privacy.forEach { (t, b) -> item { LegalSection(Icons.Outlined.PrivacyTip, t, b) } }
        item {
            Text(stringResource(R.string.privacy_contact, Attribution.developerName,
                com.webtecit.devicepilot.brand.Links.SUPPORT_EMAIL),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        item {
            val ctx = androidx.compose.ui.platform.LocalContext.current
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { navigate(Routes.DISCLAIMER) }) { Text(stringResource(R.string.title_disclaimer)) }
                OutlinedButton(onClick = { com.webtecit.devicepilot.system.SystemSettings.url(ctx, com.webtecit.devicepilot.brand.Links.PRIVACY) }) {
                    Text(stringResource(R.string.open_web_version))
                }
            }
        }
    }
}

@Composable
fun DisclaimerScreen(navigate: (String) -> Unit) {
    ScreenList {
        item {
            DpCard(color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.Gavel, null, tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(10.dp))
                    Text(stringResource(R.string.disc_headline), style = MaterialTheme.typography.titleMedium)
                }
            }
        }
        LegalSections.disclaimer.forEach { (t, b) -> item { LegalSection(Icons.Outlined.Gavel, t, b) } }
        item {
            val ctx = androidx.compose.ui.platform.LocalContext.current
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { navigate(Routes.PRIVACY) }) { Text(stringResource(R.string.title_privacy)) }
                OutlinedButton(onClick = { com.webtecit.devicepilot.system.SystemSettings.url(ctx, com.webtecit.devicepilot.brand.Links.DISCLAIMER) }) {
                    Text(stringResource(R.string.open_web_version))
                }
            }
        }
    }
}
