package com.webtecit.filepilot.feature.splash

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp
import com.webtecit.filepilot.core.designsystem.AppLogo
import com.webtecit.filepilot.core.designsystem.LocalAnimationsEnabled
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.coroutineScope

/** Branded launch animation: the logo settles in, then the name and the developer brand appear. */
@Composable
fun SplashScreen(onFinished: () -> Unit) {
    val animations = LocalAnimationsEnabled.current
    val finished = rememberUpdatedState(onFinished)
    val logoScale = remember { Animatable(if (animations) 0.72f else 1f) }
    val logoAlpha = remember { Animatable(if (animations) 0f else 1f) }
    val textAlpha = remember { Animatable(if (animations) 0f else 1f) }
    val textOffset = remember { Animatable(if (animations) 16f else 0f) }

    LaunchedEffect(Unit) {
        if (animations) {
            coroutineScope {
                launch { logoAlpha.animateTo(1f, tween(320)) }
                launch { logoScale.animateTo(1f, tween(520, easing = FastOutSlowInEasing)) }
                launch {
                    delay(260)
                    launch { textAlpha.animateTo(1f, tween(360)) }
                    textOffset.animateTo(0f, tween(420, easing = FastOutSlowInEasing))
                }
            }
            delay(320)
        } else {
            delay(150)
        }
        finished.value()
    }

    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            AppLogo(
                112.dp,
                Modifier.graphicsLayer {
                    scaleX = logoScale.value
                    scaleY = logoScale.value
                    alpha = logoAlpha.value
                },
            )
            Spacer(Modifier.height(24.dp))
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.graphicsLayer {
                    alpha = textAlpha.value
                    translationY = textOffset.value * density
                },
            ) {
                Text("FilePilot", style = MaterialTheme.typography.headlineMedium)
                Text("Manage everything. Edit anything.", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
            }
        }
        Text(
            "by Webtecit Apps",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(bottom = 32.dp)
                .graphicsLayer { alpha = textAlpha.value },
        )
    }
}
