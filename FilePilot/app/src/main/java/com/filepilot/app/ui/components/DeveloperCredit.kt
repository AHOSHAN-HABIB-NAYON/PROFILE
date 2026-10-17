package com.filepilot.app.ui.components

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.filepilot.app.R

object Developer {
    const val NAME = "MD. AHOSHAN HABIB NAYON"
    const val WEBSITE = "https://webtecit.com/"
    const val WEBSITE_LABEL = "webtecit.com"

    /** Opens the developer's website in the user's browser (FilePilot itself has no internet access). */
    fun openWebsite(context: Context): Boolean = try {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(WEBSITE)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
    } catch (_: ActivityNotFoundException) {
        false
    }
}

@Composable
fun DeveloperPhoto(size: Dp, modifier: Modifier = Modifier) {
    Image(
        painter = painterResource(R.drawable.developer_photo),
        contentDescription = "Photo of ${Developer.NAME}",
        contentScale = ContentScale.Crop,
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .border(2.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.35f), CircleShape),
    )
}

/** Full developer card for About and Settings. */
@Composable
fun DeveloperCard(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    Surface(
        modifier = modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            DeveloperPhoto(64.dp)
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text("Developer", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                Text(Developer.NAME, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
                Spacer(Modifier.padding(top = 6.dp))
                OutlinedButton(
                    onClick = { Developer.openWebsite(context) },
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                ) {
                    Icon(Icons.Rounded.Language, null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(Developer.WEBSITE_LABEL, style = MaterialTheme.typography.labelLarge)
                }
            }
        }
    }
}

/** Subtle developer watermark line with a small photo; tapping opens the website. */
@Composable
fun DeveloperWatermark(modifier: Modifier = Modifier, color: Color = MaterialTheme.colorScheme.onSurfaceVariant) {
    val context = LocalContext.current
    Row(
        modifier
            .clip(MaterialTheme.shapes.small)
            .clickable { Developer.openWebsite(context) }
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        DeveloperPhoto(22.dp)
        Spacer(Modifier.width(8.dp))
        Column {
            Text(
                "Developer: ${Developer.NAME}",
                style = MaterialTheme.typography.labelSmall,
                color = color.copy(alpha = 0.85f),
            )
            Text(
                Developer.WEBSITE_LABEL,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary.copy(alpha = 0.85f),
            )
        }
    }
}
