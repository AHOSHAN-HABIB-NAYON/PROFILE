package com.webtecit.filepilot.feature.onboarding

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.Android
import androidx.compose.material.icons.rounded.Category
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.CleaningServices
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.DriveFileMove
import androidx.compose.material.icons.rounded.EditNote
import androidx.compose.material.icons.rounded.FileCopy
import androidx.compose.material.icons.rounded.FindReplace
import androidx.compose.material.icons.rounded.Fingerprint
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.FolderZip
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.PictureAsPdf
import androidx.compose.material.icons.rounded.PieChart
import androidx.compose.material.icons.rounded.PlayCircle
import androidx.compose.material.icons.rounded.RadioButtonUnchecked
import androidx.compose.material.icons.rounded.SdCard
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material.icons.rounded.Storage
import androidx.compose.material.icons.rounded.Terminal
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.webtecit.filepilot.core.designsystem.AppLogo
import com.webtecit.filepilot.core.designsystem.LocalAnimationsEnabled
import com.webtecit.filepilot.core.designsystem.LocalDarkTheme
import com.webtecit.filepilot.core.designsystem.Palette
import com.webtecit.filepilot.core.preferences.PreferencesRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlin.math.PI
import kotlin.math.absoluteValue
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

private data class Feature(val label: String, val icon: ImageVector, val tint: Color)
private data class Page(val title: String, val text: String, val features: List<Feature>)

private val pages = listOf(
    Page(
        "Manage everything",
        "Phone storage, SD cards and USB drives in one fast, private file manager.",
        listOf(
            Feature("Copy · Move", Icons.Rounded.DriveFileMove, Palette.Blue),
            Feature("Categories", Icons.Rounded.Category, Palette.Pink),
            Feature("Smart search", Icons.Rounded.Search, Palette.Purple),
            Feature("ZIP & archives", Icons.Rounded.FolderZip, Palette.Cyan),
            Feature("Recycle Bin", Icons.Rounded.Delete, Palette.Orange),
            Feature("Batch rename", Icons.Rounded.EditNote, Palette.Green),
        ),
    ),
    Page(
        "Code & run websites",
        "A real code editor and an offline website runner with phone, tablet and desktop previews.",
        listOf(
            Feature("Code Studio", Icons.Rounded.Code, Palette.Orange),
            Feature("Live preview", Icons.Rounded.Language, Palette.Blue),
            Feature("Terminal", Icons.Rounded.Terminal, Palette.Slate),
            Feature("APK info", Icons.Rounded.Android, Palette.Purple),
            Feature("SQLite", Icons.Rounded.Storage, Palette.Cyan),
            Feature("Find & replace", Icons.Rounded.FindReplace, Palette.Green),
        ),
    ),
    Page(
        "Clean, secure, analyze",
        "See what fills your storage, free up space and lock away private files.",
        listOf(
            Feature("Analyzer", Icons.Rounded.PieChart, Palette.Blue),
            Feature("Cleaner", Icons.Rounded.CleaningServices, Palette.Green),
            Feature("Duplicates", Icons.Rounded.FileCopy, Palette.Orange),
            Feature("Secure Folder", Icons.Rounded.Lock, Palette.Purple),
            Feature("PDF tools", Icons.Rounded.PictureAsPdf, Palette.Pink),
            Feature("App lock", Icons.Rounded.Fingerprint, Palette.Cyan),
        ),
    ),
)

/** Size of the illustration in its own units; it is scaled to the screen. */
private val ArtWidth = 324.dp
private val ArtHeight = 270.dp

@Composable
fun OnboardingScreen(onFinished: () -> Unit, viewModel: OnboardingViewModel = hiltViewModel()) {
    val pager = rememberPagerState { pages.size }
    val scope = rememberCoroutineScope()
    val animations = LocalAnimationsEnabled.current
    val last = pager.currentPage == pages.lastIndex

    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
            Row(Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 18.dp), verticalAlignment = Alignment.CenterVertically) {
                Surface(shape = RoundedCornerShape(11.dp), shadowElevation = 2.dp, color = Color.Transparent) { AppLogo(34.dp) }
                Spacer(Modifier.width(10.dp))
                Text("FilePilot", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                if (!last) {
                    TextButton(onClick = { viewModel.finish(onFinished) }) { Text("Skip", fontWeight = FontWeight.SemiBold) }
                }
            }
            HorizontalPager(state = pager, modifier = Modifier.weight(1f).fillMaxWidth().testTag("onboarding_pager")) { index ->
                val offset = pageOffset(pager, index)
                val settled = 1f - offset.absoluteValue.coerceAtMost(1f)
                val page = pages[index]
                Column(
                    Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 18.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    BoxWithConstraints(Modifier.fillMaxWidth().widthIn(max = 560.dp), contentAlignment = Alignment.TopCenter) {
                        val scale = (maxWidth / ArtWidth).coerceIn(0.75f, 1.6f)
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .height(ArtHeight * scale)
                                .clip(RoundedCornerShape(26.dp))
                                .background(Brush.linearGradient(artColors(index)))
                                .graphicsLayer {
                                    alpha = 0.35f + 0.65f * settled
                                    translationX = offset * size.width * 0.25f
                                },
                            contentAlignment = Alignment.Center,
                        ) {
                            Box(
                                Modifier.requiredSize(ArtWidth, ArtHeight).graphicsLayer {
                                    scaleX = scale * (0.9f + 0.1f * settled)
                                    scaleY = scale * (0.9f + 0.1f * settled)
                                },
                            ) {
                                when (index) {
                                    0 -> FilesScene(animations)
                                    1 -> CodeScene(animations)
                                    else -> SecureScene(animations)
                                }
                            }
                        }
                    }
                    Spacer(Modifier.height(20.dp))
                    Text(
                        page.title,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.ExtraBold,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.graphicsLayer { alpha = settled; translationY = (1f - settled) * 40f },
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        page.text,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.widthIn(max = 420.dp).padding(horizontal = 12.dp)
                            .graphicsLayer { alpha = settled; translationY = (1f - settled) * 60f },
                    )
                    Spacer(Modifier.height(16.dp))
                    FeatureGrid(page.features, settled, Modifier.widthIn(max = 560.dp))
                    Spacer(Modifier.height(12.dp))
                }
            }
            Row(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                pages.indices.forEach { i ->
                    val selected = i == pager.currentPage
                    val width by animateDpAsState(if (selected) 26.dp else 8.dp, label = "dot")
                    val color by animateColorAsState(
                        if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant, label = "dotColor",
                    )
                    Box(Modifier.padding(end = 6.dp).size(width = width, height = 8.dp).background(color, CircleShape))
                }
                Spacer(Modifier.weight(1f))
                NextButton(if (last) "Get started" else "Next") {
                    if (last) viewModel.finish(onFinished)
                    else scope.launch {
                        if (animations) pager.animateScrollToPage(pager.currentPage + 1) else pager.scrollToPage(pager.currentPage + 1)
                    }
                }
            }
        }
    }
}

@Composable
private fun artColors(index: Int): List<Color> {
    val dark = LocalDarkTheme.current
    val a = if (dark) 0.22f else 0.12f
    val b = if (dark) 0.10f else 0.05f
    return when (index) {
        0 -> listOf(Palette.Blue.copy(alpha = a), Palette.Blue.copy(alpha = b))
        1 -> listOf(Palette.Blue.copy(alpha = a), Palette.Purple.copy(alpha = b))
        else -> listOf(Palette.Green.copy(alpha = a), Palette.Blue.copy(alpha = b))
    }
}

private fun pageOffset(pager: PagerState, page: Int): Float =
    (pager.currentPage - page) + pager.currentPageOffsetFraction

@Composable
private fun NextButton(label: String, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.94f else 1f, label = "press")
    Surface(
        onClick = onClick,
        interactionSource = interaction,
        shape = RoundedCornerShape(16.dp),
        color = Color.Transparent,
        shadowElevation = 6.dp,
        modifier = Modifier.height(50.dp).graphicsLayer { scaleX = scale; scaleY = scale },
    ) {
        Row(
            Modifier.fillMaxHeight().background(Brush.linearGradient(listOf(Color(0xFF3B7BFF), Palette.Navy))).padding(horizontal = 22.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(label, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = Color.White)
            Spacer(Modifier.width(6.dp))
            Icon(Icons.AutoMirrored.Rounded.ArrowForward, null, tint = Color.White, modifier = Modifier.size(18.dp))
        }
    }
}

/** Six equal boxes; they rise in one after another as the page settles. */
@Composable
private fun FeatureGrid(features: List<Feature>, settled: Float, modifier: Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        features.chunked(3).forEachIndexed { r, row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEachIndexed { c, f ->
                    val i = r * 3 + c
                    val p = ((settled - 0.35f - i * 0.08f) / 0.4f).coerceIn(0f, 1f)
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = MaterialTheme.colorScheme.surfaceContainerLowest,
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f)),
                        modifier = Modifier.weight(1f).height(66.dp).graphicsLayer {
                            alpha = p
                            translationY = (1f - p) * 30f
                            scaleX = 0.9f + 0.1f * p
                            scaleY = 0.9f + 0.1f * p
                        },
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                            Icon(f.icon, null, tint = f.tint, modifier = Modifier.size(22.dp))
                            Spacer(Modifier.height(5.dp))
                            Text(f.label, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, maxLines = 1)
                        }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Illustrations. Each is drawn in a 324 × 270 dp box and moves in a slow loop.

@Composable
private fun loop(animations: Boolean, millis: Int, reverse: Boolean = true): Float {
    if (!animations) return 0.6f
    val t = rememberInfiniteTransition(label = "loop")
    val v by t.animateFloat(
        0f, 1f,
        infiniteRepeatable(
            tween(millis, easing = if (reverse) FastOutSlowInEasing else LinearEasing),
            if (reverse) RepeatMode.Reverse else RepeatMode.Restart,
        ),
        label = "v",
    )
    return v
}

/** Gentle up-and-down float, in dp. */
private fun bob(t: Float, amount: Float = 6f, phase: Float = 0f): Float = sin((t + phase) * 2f * PI.toFloat()) * amount

@Composable
private fun Card(modifier: Modifier, radius: Dp = 16.dp, color: Color = MaterialTheme.colorScheme.surfaceContainerLowest, content: @Composable () -> Unit) {
    Surface(shape = RoundedCornerShape(radius), color = color, shadowElevation = 6.dp, modifier = modifier) { content() }
}

@Composable
private fun SmallTile(icon: ImageVector, tint: Color, size: Dp = 30.dp) {
    Box(Modifier.size(size).clip(RoundedCornerShape(size * 0.32f)).background(tint.copy(alpha = 0.14f)), contentAlignment = Alignment.Center) {
        Icon(icon, null, tint = tint, modifier = Modifier.size(size * 0.6f))
    }
}

@Composable
private fun FilesScene(animations: Boolean) {
    val slow = loop(animations, 2600)
    val cycle = loop(animations, 3600, reverse = false)
    val float = loop(animations, 3000, reverse = false)
    Box(Modifier.fillMaxSize()) {
        // Storage card with a filling bar.
        Card(Modifier.offset(22.dp, 24.dp).width(200.dp), color = Color.Transparent) {
            Column(Modifier.background(Brush.linearGradient(listOf(Color(0xFF3B7BFF), Palette.Navy))).padding(14.dp)) {
                Text("Internal storage", fontSize = 10.sp, color = Color.White.copy(alpha = 0.85f))
                Text(
                    buildAnnotatedString {
                        append("79.4 GB ")
                        withStyle(SpanStyle(fontSize = 11.sp, fontWeight = FontWeight.Normal, color = Color.White.copy(alpha = 0.8f))) { append("of 128 GB") }
                    },
                    fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Color.White,
                )
                Spacer(Modifier.height(8.dp))
                Box(Modifier.fillMaxWidth().height(6.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.25f))) {
                    Box(Modifier.fillMaxWidth(0.35f + 0.27f * slow).fillMaxHeight().clip(CircleShape).background(Color.White))
                }
            }
        }
        // File list; ticks appear one after another.
        Card(Modifier.offset(66.dp, 118.dp).width(236.dp)) {
            Column(Modifier.padding(horizontal = 12.dp, vertical = 6.dp)) {
                FileLine(Icons.Rounded.Folder, Palette.Orange, "Projects", "12 items", cycle > 0.18f)
                FileLine(Icons.Rounded.Image, Palette.Blue, "photo_2026.jpg", "3.4 MB", cycle > 0.42f)
                FileLine(Icons.Rounded.FolderZip, Palette.Cyan, "website.zip", "8.1 MB", cycle > 0.66f)
            }
        }
        // SD card floating at the top right.
        Card(Modifier.offset(254.dp, 30.dp).size(50.dp).graphicsLayer { translationY = bob(float).dp.toPx() }) {
            Box(contentAlignment = Alignment.Center) { Icon(Icons.Rounded.SdCard, null, tint = Palette.Pink) }
        }
        // Copy progress chip.
        Card(Modifier.offset(16.dp, 222.dp).graphicsLayer { translationY = bob(float, 4f, 0.5f).dp.toPx() }, radius = 12.dp) {
            Row(Modifier.padding(horizontal = 12.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Rounded.ContentCopy, null, tint = Palette.Green, modifier = Modifier.size(15.dp))
                Spacer(Modifier.width(6.dp))
                Text("Copying… ${(cycle * 100).toInt()}%", fontSize = 10.5.sp, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
private fun FileLine(icon: ImageVector, tint: Color, name: String, detail: String, checked: Boolean) {
    val tick by animateFloatAsState(if (checked) 1f else 0f, tween(250), label = "tick")
    Row(Modifier.fillMaxWidth().height(40.dp), verticalAlignment = Alignment.CenterVertically) {
        SmallTile(icon, tint)
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(name, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
            Text(detail, fontSize = 9.5.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Box(contentAlignment = Alignment.Center) {
            Icon(Icons.Rounded.RadioButtonUnchecked, null, tint = MaterialTheme.colorScheme.outlineVariant, modifier = Modifier.size(20.dp))
            Icon(
                Icons.Rounded.CheckCircle, null, tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(20.dp).graphicsLayer { scaleX = tick; scaleY = tick; alpha = tick },
            )
        }
    }
}

private val codeLines = listOf(
    listOf("<div " to 0xFFFF7AB2, "class" to 0xFF7DD3FC, "=" to 0xFFC9D1E8, "\"card\"" to 0xFFA5E075, ">" to 0xFFFF7AB2),
    listOf("  <h1>" to 0xFFFF7AB2, "Hello" to 0xFFC9D1E8, "</h1>" to 0xFFFF7AB2),
    listOf("  <button>" to 0xFFFF7AB2, "Start" to 0xFFC9D1E8, "</button>" to 0xFFFF7AB2),
    listOf("</div>" to 0xFFFF7AB2),
    listOf(".card" to 0xFFC792EA, " { " to 0xFFC9D1E8, "color" to 0xFF7DD3FC, ": " to 0xFFC9D1E8, "#2F6BFF" to 0xFFF78C6C, " }" to 0xFFC9D1E8),
)

@Composable
private fun CodeScene(animations: Boolean) {
    val typing = loop(animations, 5200, reverse = false)
    val float = loop(animations, 3200, reverse = false)
    val blink = loop(animations, 900, reverse = false) < 0.5f
    // How many characters are typed so far (all lines together).
    val total = codeLines.sumOf { l -> l.sumOf { it.first.length } }
    val typed = if (animations) (typing / 0.75f).coerceAtMost(1f) * total else total.toFloat()
    val built = typed >= total
    Box(Modifier.fillMaxSize()) {
        Card(Modifier.offset(18.dp, 20.dp).width(214.dp), radius = 14.dp, color = Color(0xFF151A2D)) {
            Column {
                Row(Modifier.fillMaxWidth().background(Color(0xFF1E2440)).padding(horizontal = 10.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    listOf(0xFFFF5F57, 0xFFFEBC2E, 0xFF28C840).forEach {
                        Box(Modifier.padding(end = 5.dp).size(8.dp).clip(CircleShape).background(Color(it)))
                    }
                    Spacer(Modifier.width(6.dp))
                    Text("index.html", fontSize = 9.5.sp, color = Color(0xFF9AA3BF))
                }
                Column(Modifier.padding(horizontal = 10.dp, vertical = 8.dp)) {
                    var left = typed.toInt()
                    var cursorPlaced = false
                    codeLines.forEachIndexed { n, parts ->
                        val text = buildAnnotatedString {
                            withStyle(SpanStyle(color = Color(0xFF5A6488))) { append("${n + 1}  ") }
                            parts.forEach { (piece, color) ->
                                val shown = piece.take(left.coerceAtLeast(0))
                                left -= piece.length
                                withStyle(SpanStyle(color = Color(color))) { append(shown) }
                            }
                            // The cursor sits at the end of the line being typed.
                            if (!cursorPlaced && (left < 0 || n == codeLines.lastIndex)) {
                                cursorPlaced = true
                                if (blink) withStyle(SpanStyle(color = Palette.Blue)) { append("▍") }
                            }
                        }
                        Text(text, fontFamily = FontFamily.Monospace, fontSize = 10.sp, lineHeight = 17.sp, maxLines = 1)
                    }
                }
            }
        }
        // Phone preview.
        Card(
            Modifier.offset(246.dp, 40.dp).size(66.dp, 120.dp).graphicsLayer { translationY = bob(float).dp.toPx() }
                .border(3.dp, Color(0xFF151A2D), RoundedCornerShape(14.dp)),
            radius = 14.dp,
        ) {
            Column(Modifier.padding(8.dp)) {
                Box(Modifier.fillMaxWidth().height(9.dp).clip(RoundedCornerShape(3.dp)).background(Palette.Blue.copy(alpha = 0.15f)))
                Spacer(Modifier.height(6.dp))
                Text("Hello", fontSize = 8.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(6.dp))
                Box(Modifier.fillMaxWidth().height(15.dp).clip(RoundedCornerShape(5.dp)).background(if (built) Palette.Blue else Palette.Blue.copy(alpha = 0.2f)))
            }
        }
        // Desktop preview.
        Card(
            Modifier.offset(42.dp, 192.dp).size(206.dp, 58.dp).graphicsLayer { translationY = bob(float, 4f, 0.4f).dp.toPx() }
                .border(3.dp, Color(0xFF151A2D), RoundedCornerShape(10.dp)),
            radius = 10.dp,
        ) {
            Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Hello", fontSize = 9.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(4.dp))
                    Box(Modifier.fillMaxWidth(0.85f).height(5.dp).clip(CircleShape).background(MaterialTheme.colorScheme.outlineVariant))
                }
                Box(Modifier.size(48.dp, 18.dp).clip(RoundedCornerShape(5.dp)).background(if (built) Palette.Blue else Palette.Blue.copy(alpha = 0.2f)))
            }
        }
        // "Live" chip with a pulsing dot.
        val pulse = loop(animations, 1000)
        Card(Modifier.offset(246.dp, 214.dp), radius = 12.dp) {
            Row(Modifier.padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Rounded.PlayCircle, null, tint = Palette.Green, modifier = Modifier.size(15.dp).graphicsLayer { scaleX = 0.85f + 0.2f * pulse; scaleY = 0.85f + 0.2f * pulse })
                Spacer(Modifier.width(4.dp))
                Text("Live", fontSize = 10.sp, fontWeight = FontWeight.SemiBold, color = Palette.Green)
            }
        }
    }
}

@Composable
private fun SecureScene(animations: Boolean) {
    val float = loop(animations, 3200, reverse = false)
    val pulse = loop(animations, 1600)
    val clean = loop(animations, 2800)
    // The ring draws itself once when the page appears.
    val sweep = remember { Animatable(if (animations) 0f else 1f) }
    LaunchedEffect(Unit) { sweep.animateTo(1f, tween(if (animations) 1400 else 0, easing = FastOutSlowInEasing)) }
    val track = MaterialTheme.colorScheme.surfaceContainerHigh
    Box(Modifier.fillMaxSize()) {
        Card(Modifier.offset(22.dp, 24.dp).size(150.dp), radius = 24.dp) {
            Box(contentAlignment = Alignment.Center) {
                Canvas(Modifier.size(104.dp)) {
                    val stroke = 13.dp.toPx()
                    val inset = stroke / 2
                    val arcSize = Size(size.width - stroke, size.height - stroke)
                    drawArc(track, 0f, 360f, false, Offset(inset, inset), arcSize, style = Stroke(stroke))
                    var start = -90f
                    listOf(0.45f to Palette.Blue, 0.17f to Palette.Pink, 0.10f to Palette.Orange, 0.08f to Palette.Green).forEach { (share, color) ->
                        val angle = 360f * share * sweep.value
                        drawArc(color, start, angle - 2f, false, Offset(inset, inset), arcSize, style = Stroke(stroke, cap = StrokeCap.Butt))
                        start += angle
                    }
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("${(62 * sweep.value).toInt()}%", fontSize = 17.sp, fontWeight = FontWeight.Bold)
                    Text("used", fontSize = 9.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        Card(Modifier.offset(192.dp, 30.dp).size(112.dp).graphicsLayer { translationY = bob(float).dp.toPx() }, radius = 24.dp) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Box(
                    Modifier.size(52.dp).graphicsLayer { scaleX = 0.94f + 0.1f * pulse; scaleY = 0.94f + 0.1f * pulse }
                        .clip(RoundedCornerShape(16.dp)).background(Palette.Purple.copy(alpha = 0.14f)),
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Rounded.Shield, null, tint = Palette.Purple, modifier = Modifier.size(30.dp)) }
                Spacer(Modifier.height(6.dp))
                Text("AES-256", fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
            }
        }
        Card(Modifier.offset(22.dp, 196.dp).width(282.dp)) {
            Row(Modifier.padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                SmallTile(Icons.Rounded.CleaningServices, Palette.Green, 34.dp)
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text("2.4 GB can be freed", fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(5.dp))
                    Box(Modifier.fillMaxWidth().height(5.dp).clip(CircleShape).background(track)) {
                        Box(Modifier.fillMaxWidth(0.3f + 0.6f * clean).fillMaxHeight().clip(CircleShape).background(Palette.Green))
                    }
                }
                Spacer(Modifier.width(10.dp))
                Text("Clean", fontSize = 10.5.sp, fontWeight = FontWeight.Bold, color = Palette.Green)
            }
        }
    }
}
