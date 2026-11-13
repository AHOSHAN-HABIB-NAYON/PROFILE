package com.webtecit.filepilot.feature.onboarding

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Android
import androidx.compose.material.icons.rounded.CleaningServices
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.DonutLarge
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.PictureAsPdf
import androidx.compose.material.icons.rounded.PhoneAndroid
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material.icons.rounded.TabletAndroid
import androidx.compose.material.icons.rounded.Computer
import androidx.compose.material.icons.rounded.Movie
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.webtecit.filepilot.core.designsystem.LocalAnimationsEnabled
import com.webtecit.filepilot.core.preferences.PreferencesRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlin.math.absoluteValue
import kotlin.math.cos
import kotlin.math.sin
import kotlinx.coroutines.launch

@HiltViewModel
class OnboardingViewModel @Inject constructor(private val preferences: PreferencesRepository) : ViewModel() {
    fun finish(then: () -> Unit) {
        viewModelScope.launch {
            preferences.setOnboardingDone()
            then()
        }
    }
}

private data class Page(val title: String, val text: String, val features: List<String>)

private val pages = listOf(
    Page(
        "Manage everything",
        "Phone storage, SD cards and USB drives in one fast, private file manager.",
        listOf("Copy · Move · Rename", "Images · Videos · Docs", "Search & favorites", "Recycle Bin", "ZIP & archives", "Batch rename"),
    ),
    Page(
        "Code & run websites",
        "A real code editor and an offline website runner with device previews.",
        listOf("Code Studio", "HTML live preview", "Mobile · Tablet · Desktop", "APK Toolkit", "HEX & SQLite", "Terminal"),
    ),
    Page(
        "Clean, secure, analyze",
        "Know what fills your storage, free up space and protect private files.",
        listOf("Storage Analyzer", "Cleaner", "Duplicate finder", "Secure Folder", "PDF tools", "Checksums"),
    ),
)

@Composable
fun OnboardingScreen(onFinished: () -> Unit, viewModel: OnboardingViewModel = hiltViewModel()) {
    val pager = rememberPagerState { pages.size }
    val scope = rememberCoroutineScope()
    val animations = LocalAnimationsEnabled.current
    val last = pager.currentPage == pages.lastIndex
    val primary = MaterialTheme.colorScheme.primary
    val tertiary = MaterialTheme.colorScheme.tertiary

    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        AmbientBackground(animations, primary, tertiary)
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(horizontal = 24.dp, vertical = 8.dp)) {
            Row(Modifier.fillMaxWidth().height(52.dp), verticalAlignment = Alignment.CenterVertically) {
                com.webtecit.filepilot.core.designsystem.AppLogo(32.dp)
                Spacer(Modifier.width(10.dp))
                Text("FilePilot", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                if (!last) TextButton(onClick = { viewModel.finish(onFinished) }) { Text("Skip") }
            }
            HorizontalPager(state = pager, modifier = Modifier.weight(1f).fillMaxWidth().testTag("onboarding_pager")) { index ->
                val offset = pageOffset(pager, index)
                val settled = 1f - offset.absoluteValue.coerceAtMost(1f)
                Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
                    // The illustration scales to the space available, so it fits any phone or tablet.
                    androidx.compose.foundation.layout.BoxWithConstraints(
                        Modifier.weight(1f).fillMaxWidth(),
                        contentAlignment = Alignment.Center,
                    ) {
                        val scale = (minOf(maxWidth.value, maxHeight.value) / 300f).coerceIn(0.55f, 1.6f)
                        Box(
                            Modifier.size(280.dp).graphicsLayer {
                                scaleX = scale * (0.85f + 0.15f * settled)
                                scaleY = scale * (0.85f + 0.15f * settled)
                                translationX = offset * size.width * 0.4f
                                alpha = 0.3f + 0.7f * settled
                            },
                            contentAlignment = Alignment.Center,
                        ) {
                            when (index) {
                                0 -> FilesScene(animations)
                                1 -> CodeScene(animations)
                                else -> SecureScene(animations)
                            }
                        }
                    }
                    Column(
                        Modifier.fillMaxWidth().widthIn(max = 520.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(
                            pages[index].title,
                            style = MaterialTheme.typography.headlineMedium,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.graphicsLayer { alpha = settled; translationY = (1f - settled) * 40f },
                        )
                        Spacer(Modifier.height(10.dp))
                        Text(
                            pages[index].text,
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.graphicsLayer { alpha = settled; translationY = (1f - settled) * 70f },
                        )
                        Spacer(Modifier.height(16.dp))
                        Box(Modifier.graphicsLayer { alpha = settled; translationY = (1f - settled) * 100f }) {
                            FeatureChips(pages[index].features)
                        }
                        Spacer(Modifier.height(8.dp))
                    }
                }
            }
            Row(Modifier.fillMaxWidth().padding(vertical = 14.dp), horizontalArrangement = Arrangement.Center) {
                pages.indices.forEach { i ->
                    val selected = i == pager.currentPage
                    val width by animateDpAsState(if (selected) 32.dp else 8.dp, label = "dot")
                    val color by animateColorAsState(
                        if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant, label = "dotColor",
                    )
                    Box(Modifier.padding(horizontal = 4.dp).size(width = width, height = 8.dp).background(color, CircleShape))
                }
            }
            Box(
                Modifier
                    .fillMaxWidth()
                    .widthIn(max = 520.dp)
                    .align(Alignment.CenterHorizontally)
                    .height(56.dp)
                    .clip(RoundedCornerShape(18.dp))
                    .background(Brush.horizontalGradient(listOf(primary, tertiary)))
                    .clickable {
                        if (last) viewModel.finish(onFinished)
                        else scope.launch {
                            if (animations) pager.animateScrollToPage(pager.currentPage + 1) else pager.scrollToPage(pager.currentPage + 1)
                        }
                    },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    if (last) "Get started" else "Next",
                    style = MaterialTheme.typography.titleMedium,
                    color = Color.White,
                )
            }
            Spacer(Modifier.height(6.dp))
        }
    }
}

/** Two soft, slowly drifting colour shapes behind the intro. */
@Composable
private fun AmbientBackground(animations: Boolean, a: Color, b: Color) {
    val t = loop(animations, 7000)
    androidx.compose.foundation.Canvas(Modifier.fillMaxSize()) {
        drawCircle(
            Brush.radialGradient(listOf(a.copy(alpha = 0.16f), Color.Transparent), center = androidx.compose.ui.geometry.Offset(size.width * (0.15f + 0.2f * t), size.height * 0.18f), radius = size.minDimension * 0.75f),
            radius = size.minDimension * 0.75f,
            center = androidx.compose.ui.geometry.Offset(size.width * (0.15f + 0.2f * t), size.height * 0.18f),
        )
        drawCircle(
            Brush.radialGradient(listOf(b.copy(alpha = 0.14f), Color.Transparent), center = androidx.compose.ui.geometry.Offset(size.width * (0.9f - 0.2f * t), size.height * (0.62f + 0.08f * t)), radius = size.minDimension * 0.7f),
            radius = size.minDimension * 0.7f,
            center = androidx.compose.ui.geometry.Offset(size.width * (0.9f - 0.2f * t), size.height * (0.62f + 0.08f * t)),
        )
    }
}

private fun pageOffset(pager: PagerState, page: Int): Float =
    (pager.currentPage - page) + pager.currentPageOffsetFraction

@Composable
private fun FeatureChips(features: List<String>) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        features.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { f ->
                    Text(
                        f,
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                        modifier = Modifier.clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.7f))
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                    )
                }
            }
        }
    }
}

/** Animation clock: a 0→1 loop, or a still frame when animations are off. */
@Composable
private fun loop(animations: Boolean, millis: Int, reverse: Boolean = true): Float {
    if (!animations) return 0.5f
    val t = rememberInfiniteTransition(label = "loop")
    val v by t.animateFloat(
        0f, 1f,
        infiniteRepeatable(tween(millis, easing = if (reverse) FastOutSlowInEasing else LinearEasing), if (reverse) RepeatMode.Reverse else RepeatMode.Restart),
        label = "v",
    )
    return v
}

@Composable
private fun HeroTile(icon: ImageVector, size: Dp, colors: List<Color>, modifier: Modifier = Modifier) {
    Box(
        modifier.size(size).clip(RoundedCornerShape(size * 0.3f)).background(Brush.linearGradient(colors)),
        contentAlignment = Alignment.Center,
    ) { Icon(icon, null, tint = Color.White, modifier = Modifier.size(size * 0.5f)) }
}

@Composable
private fun Satellite(icon: ImageVector, tint: Color, modifier: Modifier) {
    Box(
        modifier.size(52.dp).clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(16.dp)),
        contentAlignment = Alignment.Center,
    ) { Icon(icon, null, tint = tint, modifier = Modifier.size(26.dp)) }
}

/** Page 1: a folder with file types orbiting around it. */
@Composable
private fun BoxScope.FilesScene(animations: Boolean) {
    val orbit = loop(animations, 9000, reverse = false)
    val float = loop(animations, 1800)
    val primary = MaterialTheme.colorScheme.primary
    Box(Modifier.size(280.dp).clip(CircleShape).background(primary.copy(alpha = 0.06f)))
    Box(Modifier.size(200.dp).clip(CircleShape).border(1.dp, primary.copy(alpha = 0.18f), CircleShape))
    val items = listOf(
        Icons.Rounded.Image to Color(0xFFDB2777), Icons.Rounded.Movie to Color(0xFFDC2626),
        Icons.Rounded.MusicNote to Color(0xFFEA580C), Icons.Rounded.PictureAsPdf to Color(0xFFB91C1C),
        Icons.Rounded.Android to Color(0xFF16A34A),
    )
    items.forEachIndexed { i, (icon, tint) ->
        val angle = (orbit + i / items.size.toFloat()) * 2 * Math.PI
        Satellite(icon, tint, Modifier.offset(x = (cos(angle) * 108).dp, y = (sin(angle) * 108).dp))
    }
    HeroTile(
        Icons.Rounded.Folder, 112.dp, listOf(Color(0xFF3D6BFF), Color(0xFF1A3BB8)),
        Modifier.offset(y = (-6 + float * 12).dp),
    )
}

/** Page 2: code that "types" itself next to three device previews. */
@Composable
private fun BoxScope.CodeScene(animations: Boolean) {
    val typing = loop(animations, 2600, reverse = false)
    val float = loop(animations, 2000)
    val dark = Color(0xFF111827)
    Box(Modifier.size(280.dp).clip(CircleShape).background(MaterialTheme.colorScheme.tertiary.copy(alpha = 0.07f)))
    Column(
        Modifier.width(210.dp).clip(RoundedCornerShape(18.dp)).background(dark).padding(14.dp)
            .offset(y = (-4 + float * 8).dp),
    ) {
        Row { listOf(Color(0xFFEF4444), Color(0xFFF59E0B), Color(0xFF22C55E)).forEach { Box(Modifier.padding(end = 6.dp).size(9.dp).background(it, CircleShape)) } }
        Spacer(Modifier.height(12.dp))
        val widths = listOf(0.55f, 0.8f, 0.65f, 0.9f, 0.45f)
        val colors = listOf(Color(0xFF60A5FA), Color(0xFF2DD4BF), Color(0xFFF472B6), Color(0xFFA78BFA), Color(0xFFFBBF24))
        widths.forEachIndexed { i, w ->
            val shown = ((typing * widths.size) - i).coerceIn(0f, 1f)
            Box(
                Modifier.padding(vertical = 4.dp).fillMaxWidth(w * shown.coerceAtLeast(0.02f)).height(8.dp)
                    .clip(CircleShape).background(colors[i]),
            )
        }
    }
    Row(Modifier.align(Alignment.BottomCenter).offset(y = (-6 - float * 6).dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        listOf(Icons.Rounded.PhoneAndroid, Icons.Rounded.TabletAndroid, Icons.Rounded.Computer).forEach {
            Satellite(it, MaterialTheme.colorScheme.primary, Modifier)
        }
    }
    HeroTile(Icons.Rounded.Code, 64.dp, listOf(Color(0xFF14B8A6), Color(0xFF0F766E)), Modifier.align(Alignment.TopEnd).offset(x = (-8).dp, y = (10 + float * 10).dp))
    Satellite(Icons.Rounded.Language, Color(0xFF2563EB), Modifier.align(Alignment.TopStart).offset(x = 6.dp, y = (24 - float * 10).dp))
}

/** Page 3: a shield with a pulsing ring and the analyzer, cleaner and lock around it. */
@Composable
private fun BoxScope.SecureScene(animations: Boolean) {
    val pulse = loop(animations, 1600, reverse = false)
    val float = loop(animations, 2200)
    val primary = MaterialTheme.colorScheme.primary
    Box(Modifier.size(280.dp).clip(CircleShape).background(primary.copy(alpha = 0.06f)))
    Box(
        Modifier.size((130 + pulse * 120).dp).clip(CircleShape)
            .border(2.dp, primary.copy(alpha = (1f - pulse) * 0.35f), CircleShape),
    )
    HeroTile(Icons.Rounded.Shield, 112.dp, listOf(Color(0xFF6366F1), Color(0xFF1A3BB8)), Modifier.offset(y = (-5 + float * 10).dp))
    Satellite(Icons.Rounded.DonutLarge, Color(0xFFEA580C), Modifier.align(Alignment.TopStart).offset(x = 20.dp, y = (40 + float * 8).dp))
    Satellite(Icons.Rounded.CleaningServices, Color(0xFF0369A1), Modifier.align(Alignment.TopEnd).offset(x = (-20).dp, y = (56 - float * 8).dp))
    Satellite(Icons.Rounded.Lock, Color(0xFFDB2777), Modifier.align(Alignment.BottomCenter).offset(y = (-18 + float * 6).dp))
}
