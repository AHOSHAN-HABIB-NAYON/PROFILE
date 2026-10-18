package com.webtecit.nayon.core.designsystem.component

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.webtecit.nayon.R

/** Brand colours of the NAYON mark. Identical in every theme, like the launcher icon. */
object NayonBrand {
    val cyan = Color(0xFF22D3EE)
    val blue = Color(0xFF3B82F6)
    val indigo = Color(0xFF6366F1)
    val violet = Color(0xFF8B5CF6)
    val magenta = Color(0xFFD946EF)
    val navy = Color(0xFF0B1026)
    val deepNavy = Color(0xFF05061A)

    val gradient: Brush get() = Brush.linearGradient(listOf(cyan, indigo, magenta))
    val nightGradient: Brush get() = Brush.linearGradient(listOf(Color(0xFF2B2F86), Color(0xFF121640), deepNavy))
}

/** The NAYON "N" mark with its orbit, without background. */
@Composable
fun NayonLogo(modifier: Modifier = Modifier, size: Dp = 48.dp) {
    Image(
        painter = painterResource(R.drawable.ic_nayon_mark),
        contentDescription = null,
        modifier = modifier.size(size),
    )
}

/** The full app icon (mark on the night-sky background) as a rounded badge. */
@Composable
fun NayonLogoBadge(modifier: Modifier = Modifier, size: Dp = 72.dp) {
    Image(
        painter = painterResource(R.drawable.ic_nayon_logo),
        contentDescription = null,
        modifier = modifier.size(size).clip(RoundedCornerShape(size * 0.27f)),
    )
}
