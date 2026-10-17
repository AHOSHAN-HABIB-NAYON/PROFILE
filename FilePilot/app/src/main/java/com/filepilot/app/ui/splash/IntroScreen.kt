package com.filepilot.app.ui.splash

import android.provider.Settings
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.shape.RoundedCornerShape
import com.filepilot.app.R
import com.filepilot.app.ui.theme.Brand
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.coroutineScope

/**
 * Continues the system splash with a short brand moment (about one second): the logo scales
 * and fades in, a light sweep crosses it, and the wordmark rises into place. No fake loading.
 * When system animations are turned off it finishes immediately.
 */
@Composable
fun IntroScreen(onFinished: () -> Unit) {
    val context = LocalContext.current
    val finish by rememberUpdatedState(onFinished)
    val animationsOff = remember {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
    val logoScale = remember { Animatable(if (animationsOff) 1f else 0.82f) }
    val logoAlpha = remember { Animatable(if (animationsOff) 1f else 0f) }
    val glow = remember { Animatable(0f) }
    val sweep = remember { Animatable(-0.6f) }
    val wordAlpha = remember { Animatable(if (animationsOff) 1f else 0f) }
    val wordShift = remember { Animatable(if (animationsOff) 0f else 14f) }

    LaunchedEffect(Unit) {
        if (animationsOff) {
            finish()
            return@LaunchedEffect
        }
        coroutineScope {
            launch { logoAlpha.animateTo(1f, tween(320, easing = LinearOutSlowInEasing)) }
            launch { logoScale.animateTo(1f, tween(520, easing = FastOutSlowInEasing)) }
            launch {
                glow.animateTo(1f, tween(520))
                glow.animateTo(0.55f, tween(500))
            }
            launch {
                delay(260)
                sweep.animateTo(1.6f, tween(700, easing = FastOutSlowInEasing))
            }
            launch {
                delay(380)
                listOf(
                    async { wordAlpha.animateTo(1f, tween(380)) },
                    async { wordShift.animateTo(0f, tween(420, easing = FastOutSlowInEasing)) },
                ).awaitAll()
            }
        }
        delay(180)
        finish()
    }

    val bg = MaterialTheme.colorScheme.background
    Box(
        Modifier
            .fillMaxSize()
            .background(bg)
            .semantics { contentDescription = "FilePilot" },
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(contentAlignment = Alignment.Center) {
                // Soft brand glow behind the mark.
                Box(
                    Modifier
                        .size(220.dp)
                        .graphicsLayer { alpha = glow.value * 0.55f }
                        .background(
                            Brush.radialGradient(listOf(Brand.Violet.copy(alpha = 0.35f), Color.Transparent)),
                        ),
                )
                Image(
                    painter = painterResource(R.drawable.ic_logo_mark),
                    contentDescription = null,
                    modifier = Modifier
                        .size(92.dp)
                        .graphicsLayer {
                            scaleX = logoScale.value
                            scaleY = logoScale.value
                            alpha = logoAlpha.value
                            compositingStrategy = CompositingStrategy.Offscreen
                        }
                        .clip(RoundedCornerShape(26.dp))
                        .drawWithContent {
                            drawContent()
                            // Diagonal light sweep, clipped to the logo.
                            val w = size.width
                            val x = sweep.value * w
                            drawRect(
                                brush = Brush.linearGradient(
                                    colors = listOf(Color.Transparent, Color.White.copy(alpha = 0.42f), Color.Transparent),
                                    start = Offset(x - w * 0.35f, 0f),
                                    end = Offset(x + w * 0.05f, size.height),
                                ),
                                blendMode = BlendMode.SrcAtop,
                            )
                        },
                )
            }
            Spacer(Modifier.height(4.dp))
            Text(
                "FilePilot",
                style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier.graphicsLayer {
                    alpha = wordAlpha.value
                    translationY = wordShift.value * density
                },
            )
            Spacer(Modifier.height(4.dp))
            Text(
                "Your files, clearly navigated",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.graphicsLayer {
                    alpha = wordAlpha.value * 0.9f
                    translationY = wordShift.value * 1.4f * density
                },
            )
        }
        com.filepilot.app.ui.components.DeveloperWatermark(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(bottom = 20.dp)
                .graphicsLayer { alpha = wordAlpha.value },
        )
    }
}
