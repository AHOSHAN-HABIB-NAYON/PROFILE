package com.webtecit.devicepilot.brand

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.GppBad
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.webtecit.devicepilot.R
import com.webtecit.devicepilot.system.SystemSettings

private val CardGradient = Brush.linearGradient(listOf(Color(0xFF1E6BFF), Color(0xFF12B5E5), Color(0xFF0B1B3F)))

@Composable
fun DeveloperPhoto(size: Dp, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val bmp = remember { Attribution.photo(context) }
    androidx.compose.material3.Surface(
        modifier.size(size + 8.dp), shape = CircleShape, color = Color.White, shadowElevation = 4.dp,
    ) {
        Box(contentAlignment = Alignment.Center) {
            if (bmp != null) Image(
                bmp.asImageBitmap(), stringResource(R.string.about_developer_photo),
                Modifier.size(size).clip(CircleShape).border(BorderStroke(1.dp, Color(0x1F0B1B3F)), CircleShape),
                contentScale = ContentScale.Crop,
            )
        }
    }
}

/** Branded developer card: gradient band, overlapping portrait, name, role and website. */
@Composable
fun DeveloperCard(modifier: Modifier = Modifier, large: Boolean = false) {
    val context = LocalContext.current
    val photo = if (large) 116.dp else 96.dp
    val band = if (large) 92.dp else 76.dp
    androidx.compose.material3.Surface(
        modifier.fillMaxWidth(),
        shape = RoundedCornerShape(22.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shadowElevation = 2.dp,
    ) {
        Box {
            Box(Modifier.fillMaxWidth().height(band).background(CardGradient)) {
                Box(Modifier.align(Alignment.TopEnd).size(120.dp).padding(start = 40.dp).clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.08f)))
                Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Verified, null, tint = Color.White, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(stringResource(R.string.dev_badge), style = MaterialTheme.typography.labelMedium, color = Color.White)
                }
            }
            Column(
                Modifier.fillMaxWidth().padding(top = band - photo / 2, bottom = 18.dp, start = 18.dp, end = 18.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                DeveloperPhoto(photo)
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(Attribution.developerName, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center)
                    Spacer(Modifier.width(6.dp))
                    Icon(Icons.Filled.Verified, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                }
                Text(stringResource(R.string.dev_role), style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
                Spacer(Modifier.height(12.dp))
                Row(
                    Modifier.clip(RoundedCornerShape(50)).background(MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.6f))
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Outlined.Language, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(Attribution.websiteLabel, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                }
                Spacer(Modifier.height(14.dp))
                Button(
                    onClick = { SystemSettings.url(context, Attribution.website) },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                ) {
                    Text(stringResource(R.string.about_visit_website), fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

/** Compact one-line credit used in footers. */
@Composable
fun DeveloperCredit(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    Row(
        modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f)).padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        DeveloperPhoto(40.dp)
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(stringResource(R.string.about_developer), style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(Attribution.developerName, style = MaterialTheme.typography.titleSmall)
        }
        Text(Attribution.websiteLabel, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
        androidx.compose.material3.IconButton(onClick = { SystemSettings.url(context, Attribution.website) }) {
            Icon(Icons.Outlined.Language, stringResource(R.string.about_visit_website), tint = MaterialTheme.colorScheme.primary)
        }
    }
}

/** Shown instead of the app when the attribution was modified. */
@Composable
fun TamperedScreen() {
    Column(
        Modifier.fillMaxSize().background(Color(0xFF0B1B3F)).padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Outlined.GppBad, null, tint = Color(0xFFFF8A80), modifier = Modifier.size(64.dp))
        Spacer(Modifier.height(16.dp))
        Text(stringResource(R.string.tamper_title), style = MaterialTheme.typography.titleLarge, color = Color.White,
            textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        Text(stringResource(R.string.tamper_text), style = MaterialTheme.typography.bodyMedium,
            color = Color.White.copy(alpha = 0.8f), textAlign = TextAlign.Center)
    }
}
