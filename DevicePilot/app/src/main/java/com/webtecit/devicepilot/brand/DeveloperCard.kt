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
    Box(
        modifier.size(size + 8.dp).clip(CircleShape)
            .background(Brush.sweepGradient(listOf(Color(0xFF22D3EE), Color.White, Color(0xFF1E6BFF), Color(0xFF22D3EE)))),
        contentAlignment = Alignment.Center,
    ) {
        if (bmp != null) Image(
            bmp.asImageBitmap(), stringResource(R.string.about_developer_photo),
            Modifier.size(size).clip(CircleShape).border(BorderStroke(2.dp, Color.White), CircleShape),
            contentScale = ContentScale.Crop,
        )
    }
}

/** Large branded card: photo, name, role and website button. */
@Composable
fun DeveloperCard(modifier: Modifier = Modifier, large: Boolean = false) {
    val context = LocalContext.current
    Box(modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(CardGradient)) {
        Box(Modifier.align(Alignment.TopEnd).padding(top = 0.dp).size(140.dp).clip(CircleShape)
            .background(Color.White.copy(alpha = 0.07f)))
        Box(Modifier.align(Alignment.BottomStart).size(90.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.05f)))
        Column(Modifier.fillMaxWidth().padding(18.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            DeveloperPhoto(if (large) 112.dp else 84.dp)
            Spacer(Modifier.height(12.dp))
            Text(stringResource(R.string.dev_designed_by), style = MaterialTheme.typography.labelMedium,
                color = Color.White.copy(alpha = 0.8f))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(Attribution.developerName, style = if (large) MaterialTheme.typography.headlineSmall else MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold, color = Color.White, textAlign = TextAlign.Center)
                Spacer(Modifier.width(6.dp))
                Icon(Icons.Filled.Verified, null, tint = Color(0xFF7DF9FF), modifier = Modifier.size(20.dp))
            }
            Text(stringResource(R.string.dev_role), style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.85f), textAlign = TextAlign.Center)
            Spacer(Modifier.height(14.dp))
            Button(
                onClick = { SystemSettings.url(context, Attribution.website) },
                colors = ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = Color(0xFF0B1B3F)),
            ) {
                Icon(Icons.Outlined.Language, null, Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text(Attribution.websiteLabel, fontWeight = FontWeight.SemiBold)
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
