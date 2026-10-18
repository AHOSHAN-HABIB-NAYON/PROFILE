package com.webtecit.nayon.core.designsystem.component

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.foundation.shape.RoundedCornerShape
import com.webtecit.nayon.data.browser.rememberFavicon
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.webtecit.nayon.core.browser.UrlResolver
import kotlin.math.abs

/**
 * A site's favicon, or a coloured letter avatar when no favicon is known.
 * Favicons are never fetched separately — only icons WebView already received are shown.
 */
@Composable
fun SiteIcon(
    url: String?,
    title: String,
    modifier: Modifier = Modifier,
    favicon: Bitmap? = null,
    size: Dp = 40.dp,
    background: Color? = null,
    /** Fetch a missing icon from the site itself (home-page shortcuts only). */
    downloadIcon: Boolean = false,
) {
    val stored by rememberFavicon(url, download = downloadIcon)
    val icon = favicon ?: stored
    if (icon != null) {
        val image = remember(icon) { icon.asImageBitmap() }
        Box(
            modifier.size(size).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceContainerLowest),
            contentAlignment = Alignment.Center,
        ) {
            Image(image, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.size(size * 0.62f).clip(RoundedCornerShape(size * 0.12f)))
        }
        return
    }
    val host = UrlResolver.displayHost(url)
    val letter = (title.ifBlank { host }.firstOrNull { it.isLetterOrDigit() } ?: '•').uppercaseChar().toString()
    val palette = avatarColors()
    val (bg, fg) = if (background != null) background to Color.White else palette[abs(host.hashCode()) % palette.size]
    Box(modifier.size(size).clip(CircleShape).background(bg), contentAlignment = Alignment.Center) {
        Text(letter, color = fg, fontWeight = FontWeight.SemiBold, fontSize = (size.value * 0.42f).sp)
    }
}

@Composable
private fun avatarColors(): List<Pair<Color, Color>> {
    val s = MaterialTheme.colorScheme
    return listOf(
        s.primaryContainer to s.onPrimaryContainer,
        s.secondaryContainer to s.onSecondaryContainer,
        s.tertiaryContainer to s.onTertiaryContainer,
        s.surfaceContainerHighest to s.onSurface,
    )
}
