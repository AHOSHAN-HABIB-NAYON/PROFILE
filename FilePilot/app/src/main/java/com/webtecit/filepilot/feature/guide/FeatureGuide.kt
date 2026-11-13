package com.webtecit.filepilot.feature.guide

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.webtecit.filepilot.core.preferences.PreferencesRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class GuideStep(val icon: ImageVector, val title: String, val text: String)

@HiltViewModel
class GuideViewModel @Inject constructor(private val prefs: PreferencesRepository) : ViewModel() {
    /** Null until loaded, so a guide never flashes for users who have already seen it. */
    val seen = prefs.preferences.map { it.seenGuides as Set<String>? }.stateIn(viewModelScope, SharingStarted.Eagerly, null)
    fun markSeen(key: String) = viewModelScope.launch { prefs.markGuideSeen(key) }
}

/**
 * A one-time walkthrough for a screen. It appears the first time the user opens that screen,
 * can be skipped, and is never shown again (Settings → Show tips again resets it).
 */
@Composable
fun FeatureGuide(key: String, steps: List<GuideStep>, viewModel: GuideViewModel = hiltViewModel()) {
    val seen by viewModel.seen.collectAsStateWithLifecycle()
    var dismissed by remember { mutableStateOf(false) }
    val show = seen != null && key !in seen!! && !dismissed && steps.isNotEmpty()
    var index by remember { mutableIntStateOf(0) }
    fun close() {
        dismissed = true
        viewModel.markSeen(key)
    }
    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(show) { visible = show }

    AnimatedVisibility(visible, enter = fadeIn(tween(250)), exit = fadeOut(tween(200))) {
        Box(
            Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.45f))
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { }
                .testTag("feature_guide"),
            contentAlignment = Alignment.BottomCenter,
        ) {
            AnimatedVisibility(
                visible,
                enter = slideInVertically(tween(380, easing = FastOutSlowInEasing)) { it / 2 } + fadeIn(),
                exit = slideOutVertically { it / 2 } + fadeOut(),
            ) {
                Surface(
                    shape = RoundedCornerShape(28.dp),
                    color = MaterialTheme.colorScheme.surface,
                    shadowElevation = 16.dp,
                    modifier = Modifier.navigationBarsPadding().padding(16.dp).widthIn(max = 520.dp).fillMaxWidth(),
                ) {
                    Column(Modifier.padding(24.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                "TIP ${index + 1} OF ${steps.size}",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.weight(1f),
                            )
                            TextButton(onClick = ::close) { Text("Skip") }
                        }
                        AnimatedContent(
                            targetState = index,
                            transitionSpec = {
                                (slideInHorizontally { it / 3 } + fadeIn()) togetherWith (slideOutHorizontally { -it / 3 } + fadeOut())
                            },
                            label = "guideStep",
                        ) { i ->
                            val step = steps[i]
                            Row(verticalAlignment = Alignment.Top) {
                                PulsingIcon(step.icon)
                                Spacer(Modifier.size(16.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(step.title, style = MaterialTheme.typography.titleLarge)
                                    Spacer(Modifier.height(6.dp))
                                    Text(step.text, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                        Spacer(Modifier.height(20.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                steps.indices.forEach { i ->
                                    Box(
                                        Modifier.size(width = if (i == index) 22.dp else 8.dp, height = 8.dp).clip(CircleShape)
                                            .background(if (i <= index) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant),
                                    )
                                }
                            }
                            if (index > 0) TextButton(onClick = { index-- }) { Text("Back") }
                            Button(onClick = { if (index < steps.lastIndex) index++ else close() }) {
                                Text(if (index < steps.lastIndex) "Next" else "Got it")
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PulsingIcon(icon: ImageVector) {
    val t = rememberInfiniteTransition(label = "pulse")
    val s by t.animateFloat(1f, 1.08f, infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "s")
    Box(
        Modifier.size(56.dp).graphicsLayer { scaleX = s; scaleY = s }.clip(RoundedCornerShape(18.dp))
            .background(Brush.linearGradient(listOf(MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.tertiary))),
        contentAlignment = Alignment.Center,
    ) { Icon(icon, null, tint = Color.White, modifier = Modifier.size(28.dp)) }
}
