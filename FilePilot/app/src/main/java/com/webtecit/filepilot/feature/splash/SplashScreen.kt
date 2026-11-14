package com.webtecit.filepilot.feature.splash

import android.app.Activity
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import com.webtecit.filepilot.core.designsystem.AppLogo
import com.webtecit.filepilot.core.designsystem.LocalAnimationsEnabled
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val SplashBlue = Color(0xFF2F6BFF)

/**
 * Branded launch screen in the app's blue, shown for about half a second after the system splash
 * (which uses the same blue, so the hand-over is seamless): the logo settles, then the name appears.
 */
@Composable
fun SplashScreen(onFinished: () -> Unit) {
    val animations = LocalAnimationsEnabled.current
    val finished = rememberUpdatedState(onFinished)
    val logoScale = remember { Animatable(if (animations) 0.86f else 1f) }
    val textAlpha = remember { Animatable(if (animations) 0f else 1f) }
    val textOffset = remember { Animatable(if (animations) 10f else 0f) }

    // White status/navigation icons on the blue background, restored when leaving.
    val view = LocalView.current
    DisposableEffect(Unit) {
        val window = (view.context as? Activity)?.window
        val controller = window?.let { WindowCompat.getInsetsController(it, view) }
        val light = controller?.isAppearanceLightStatusBars
        val lightNav = controller?.isAppearanceLightNavigationBars
        controller?.isAppearanceLightStatusBars = false
        controller?.isAppearanceLightNavigationBars = false
        onDispose {
            if (light != null) controller.isAppearanceLightStatusBars = light
            if (lightNav != null) controller.isAppearanceLightNavigationBars = lightNav
        }
    }

    LaunchedEffect(Unit) {
        if (animations) {
            coroutineScope {
                launch { logoScale.animateTo(1f, tween(260, easing = FastOutSlowInEasing)) }
                launch {
                    delay(90)
                    launch { textAlpha.animateTo(1f, tween(220)) }
                    textOffset.animateTo(0f, tween(260, easing = FastOutSlowInEasing))
                }
            }
            delay(160)
        } else {
            delay(120)
        }
        finished.value()
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(Brush.radialGradient(listOf(Color(0xFF4F86FF), SplashBlue, Color(0xFF1A45C9), Color(0xFF12308F))))
            .testTag("splash"),
        contentAlignment = Alignment.Center,
    ) {
        // Soft rings behind the logo.
        Box(Modifier.size(300.dp).border(1.dp, Color.White.copy(alpha = 0.12f), CircleShape))
        Box(Modifier.size(420.dp).border(1.dp, Color.White.copy(alpha = 0.08f), CircleShape))

        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Box(
                Modifier
                    .graphicsLayer { scaleX = logoScale.value; scaleY = logoScale.value }
                    .size(108.dp)
                    .shadow(22.dp, RoundedCornerShape(32.dp), ambientColor = Color(0xFF051450), spotColor = Color(0xFF051450))
                    .clip(RoundedCornerShape(32.dp))
                    .background(Color.White),
                contentAlignment = Alignment.Center,
            ) {
                AppLogo(70.dp)
            }
            Spacer(Modifier.height(24.dp))
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.graphicsLayer {
                    alpha = textAlpha.value
                    translationY = textOffset.value * density
                },
            ) {
                Text("FilePilot", color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.ExtraBold)
                Spacer(Modifier.height(4.dp))
                Text("CODING PRO", color = Color.White.copy(alpha = 0.8f), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 2.5.sp)
            }
        }

        Row(
            Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(bottom = 36.dp)
                .graphicsLayer { alpha = textAlpha.value },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(22.dp).clip(RoundedCornerShape(7.dp)).background(Color.White), contentAlignment = Alignment.Center) {
                Text("W", color = Color(0xFF1A45C9), fontSize = 13.sp, fontWeight = FontWeight.ExtraBold)
            }
            Spacer(Modifier.width(8.dp))
            Text("Webtecit Apps", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold)
        }
    }
}
