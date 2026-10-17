package com.webtecit.devicepilot.ui.settings

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.PrivacyTip
import androidx.compose.material3.FilledTonalButton
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.webtecit.devicepilot.BuildConfig
import com.webtecit.devicepilot.R
import com.webtecit.devicepilot.system.SystemSettings
import com.webtecit.devicepilot.ui.Routes
import com.webtecit.devicepilot.ui.common.DpCard
import com.webtecit.devicepilot.ui.common.ScreenList

const val DEVELOPER_NAME = "MD. AHOSHAN HABIB NAYON"
const val DEVELOPER_WEBSITE = "https://webtecit.com/"

@Composable
fun AboutScreen(navigate: (String) -> Unit) {
    val context = LocalContext.current
    var showLicenses by remember { mutableStateOf(false) }
    ScreenList {
        item {
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                Spacer(Modifier.height(8.dp))
                Box(Modifier.size(84.dp).clip(RoundedCornerShape(22.dp))
                    .background(Brush.linearGradient(listOf(Color(0xFF2A7BFF), Color(0xFF0B1B3F))))) {
                    Image(painterResource(R.drawable.ic_launcher_foreground), null, Modifier.size(84.dp))
                }
                Spacer(Modifier.height(10.dp))
                Text(stringResource(R.string.app_name), style = MaterialTheme.typography.headlineSmall)
                Text(stringResource(R.string.app_tagline), style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(stringResource(R.string.settings_version, BuildConfig.VERSION_NAME), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        item {
            DpCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Image(
                        painterResource(R.drawable.developer_photo), stringResource(R.string.about_developer_photo),
                        Modifier.size(72.dp).clip(CircleShape).border(BorderStroke(2.dp, MaterialTheme.colorScheme.primary), CircleShape),
                        contentScale = ContentScale.Crop,
                    )
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Text(stringResource(R.string.about_developer), style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(DEVELOPER_NAME, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        Text(stringResource(R.string.about_website) + ": " + DEVELOPER_WEBSITE,
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                    }
                }
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilledTonalButton(onClick = { SystemSettings.url(context, DEVELOPER_WEBSITE) }) {
                        Icon(Icons.Outlined.Language, null, Modifier.size(16.dp)); Spacer(Modifier.width(6.dp))
                        Text(stringResource(R.string.about_visit_website))
                    }
                    OutlinedButton(onClick = { navigate(Routes.PRIVACY) }) {
                        Icon(Icons.Outlined.PrivacyTip, null, Modifier.size(16.dp)); Spacer(Modifier.width(6.dp))
                        Text(stringResource(R.string.title_privacy))
                    }
                }
            }
        }
        item {
            DpCard {
                Text(stringResource(R.string.about_text), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(8.dp))
                OutlinedButton(onClick = { showLicenses = true }) { Text(stringResource(R.string.settings_licenses)) }
            }
        }
        item {
            Text(stringResource(R.string.about_copyright), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        }
    }
    if (showLicenses) LicensesDialog { showLicenses = false }
}

@Composable
fun PrivacyScreen() {
    ScreenList {
        listOf(
            R.string.privacy_s1_title to R.string.privacy_s1_text,
            R.string.privacy_s2_title to R.string.privacy_s2_text,
            R.string.privacy_s3_title to R.string.privacy_s3_text,
            R.string.privacy_s4_title to R.string.privacy_s4_text,
            R.string.privacy_s5_title to R.string.privacy_s5_text,
            R.string.privacy_s6_title to R.string.privacy_s6_text,
        ).forEach { (t, b) ->
            item {
                DpCard {
                    Text(stringResource(t), style = MaterialTheme.typography.titleSmall)
                    Spacer(Modifier.height(4.dp))
                    Text(stringResource(b), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}
