package com.webtecit.nayon.feature.browser

import android.text.format.DateUtils
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Bookmarks
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.webtecit.nayon.R
import com.webtecit.nayon.core.browser.UrlResolver
import com.webtecit.nayon.core.designsystem.component.NayonLogo
import com.webtecit.nayon.core.designsystem.component.SiteIcon
import com.webtecit.nayon.core.designsystem.theme.Layout
import com.webtecit.nayon.core.designsystem.theme.Spacing
import com.webtecit.nayon.data.browser.HistoryEntry
import com.webtecit.nayon.data.settings.HomeShortcut
import java.util.Calendar
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.ui.graphics.PathOperation
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.foundation.Image
import com.webtecit.nayon.data.browser.GoogleAccount
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.outlined.Translate
import androidx.compose.material.icons.outlined.AutoAwesome
import com.webtecit.nayon.core.browser.SearchEngine
import kotlinx.coroutines.delay
import androidx.compose.ui.res.painterResource
import androidx.compose.runtime.produceState
import kotlin.random.Random
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.outlined.Bolt
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import kotlinx.coroutines.launch

/** Everything the home page can do, grouped to keep the call site readable. */
class HomeActions(
    val onSearchClick: () -> Unit,
    val onVoiceClick: () -> Unit,
    val onLensClick: () -> Unit,
    val onOpenUrl: (String) -> Unit,
    val onSeeHistory: () -> Unit,
    val onOpenBookmarks: () -> Unit,
    val onOpenDownloads: () -> Unit,
    val onNewPrivateTab: () -> Unit,
    val onOpenAbout: () -> Unit,
    val onAddShortcut: (label: String, url: String) -> Unit,
    val onRemoveShortcut: (url: String) -> Unit,
    val onRemoveRecent: (id: Long) -> Unit,
    val onAccount: () -> Unit = {},
    val onAiMode: () -> Unit = {},
    val onOpenWebHub: () -> Unit = {},
    val onOpenPasswords: () -> Unit = {},
    val onOpenSettings: () -> Unit = {},
)

@Composable
fun NewTabPage(
    isPrivate: Boolean,
    showShortcuts: Boolean,
    shortcuts: List<HomeShortcut>,
    recent: List<HistoryEntry>,
    privateIsolationSupported: Boolean,
    voiceAvailable: Boolean,
    actions: HomeActions,
    modifier: Modifier = Modifier,
    searchEngine: SearchEngine = SearchEngine.GOOGLE,
    googleSignedIn: Boolean = false,
    googleAccount: GoogleAccount? = null,
    /** NAYON's bottom bar (Home, Downloads, WebHub, Passwords, Settings) on normal tabs. */
    showNavBar: Boolean = false,
) {
    val scheme = MaterialTheme.colorScheme
    val scroll = rememberScrollState()
    val nav = showNavBar && !isPrivate
    Box(modifier.fillMaxSize().background(scheme.surface), contentAlignment = Alignment.TopCenter) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(scroll).padding(bottom = if (nav) 92.dp else 0.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (isPrivate) {
                PrivateHero()
            } else {
                // Compact sky card with the brand, greeting, sun / moon, account and the search bar inside.
                SkyHero(googleSignedIn, googleAccount, actions.onAccount) {
                    SearchPill(false, voiceAvailable, searchEngine, actions, inHero = true)
                }
            }
            Column(
                Modifier.fillMaxWidth().widthIn(max = Layout.maxContentWidth)
                    .then(if (isPrivate) Modifier.offset(y = (-30).dp) else Modifier.padding(top = Spacing.md))
                    .padding(horizontal = Spacing.gutter),
                verticalArrangement = Arrangement.spacedBy(Spacing.lg),
            ) {
                if (isPrivate) SearchPill(true, voiceAvailable, searchEngine, actions)
                if (!isPrivate) ModeButtons(actions)
                if (isPrivate) {
                    PrivateInfo(privateIsolationSupported)
                } else {
                    if (showShortcuts) ShortcutsCard(shortcuts, actions)
                    QuickAccess(actions)
                    if (recent.isNotEmpty()) RecentCard(recent, actions)
                    Footer(actions.onOpenAbout)
                }
            }
        }
        if (nav) {
            val scope = androidx.compose.runtime.rememberCoroutineScope()
            HomeNavBar(
                onHome = { scope.launch { scroll.animateScrollTo(0) } },
                actions = actions,
                modifier = Modifier.align(Alignment.BottomCenter).widthIn(max = Layout.maxContentWidth)
                    .padding(horizontal = Spacing.md, vertical = Spacing.sm),
            )
        }
    }
}

// ---- Bottom bar ------------------------------------------------------------------------

/** Floating bar with WebHub raised in the middle. */
@Composable
private fun HomeNavBar(onHome: () -> Unit, actions: HomeActions, modifier: Modifier = Modifier) {
    val scheme = MaterialTheme.colorScheme
    val shape = RoundedCornerShape(26.dp)
    Box(modifier.fillMaxWidth().height(84.dp), contentAlignment = Alignment.BottomCenter) {
        Surface(
            shape = shape, color = scheme.surfaceContainerLowest, tonalElevation = 2.dp,
            border = androidx.compose.foundation.BorderStroke(1.dp, scheme.outlineVariant.copy(alpha = 0.35f)),
            modifier = Modifier.fillMaxWidth().height(66.dp)
                .shadow(14.dp, shape, ambientColor = scheme.primary.copy(alpha = 0.18f), spotColor = scheme.primary.copy(alpha = 0.22f)),
        ) {}
        Row(Modifier.fillMaxWidth().height(84.dp), verticalAlignment = Alignment.Bottom) {
            NavItem(Icons.Filled.Home, stringResource(R.string.action_home), selected = true, onClick = onHome, modifier = Modifier.weight(1f))
            NavItem(Icons.Outlined.Download, stringResource(R.string.action_downloads), onClick = actions.onOpenDownloads, modifier = Modifier.weight(1f))
            Column(
                Modifier.weight(1f).clip(RoundedCornerShape(20.dp)).clickable(role = Role.Button, onClick = actions.onOpenWebHub).padding(bottom = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    Modifier.size(58.dp).shadow(10.dp, CircleShape, spotColor = Color(0xFF5B3DF5)).clip(CircleShape)
                        .background(Brush.linearGradient(listOf(Color(0xFF25B0FF), Color(0xFF5B3DF5), Color(0xFF8B3CFF))))
                        .border(3.dp, scheme.surfaceContainerLowest, CircleShape),
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Outlined.Language, null, tint = Color.White, modifier = Modifier.size(28.dp)) }
                Spacer(Modifier.height(2.dp))
                Text(stringResource(R.string.webhub_title), style = MaterialTheme.typography.labelSmall, color = scheme.primary,
                    fontWeight = FontWeight.SemiBold, maxLines = 1)
            }
            NavItem(Icons.Outlined.Key, stringResource(R.string.nav_passwords), onClick = actions.onOpenPasswords, modifier = Modifier.weight(1f))
            NavItem(Icons.Outlined.Settings, stringResource(R.string.action_settings), onClick = actions.onOpenSettings, modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun NavItem(icon: ImageVector, label: String, onClick: () -> Unit, modifier: Modifier, selected: Boolean = false) {
    val scheme = MaterialTheme.colorScheme
    Box(modifier.height(66.dp), contentAlignment = Alignment.Center) {
        Column(
            Modifier.clip(RoundedCornerShape(16.dp)).background(if (selected) scheme.primary.copy(alpha = 0.12f) else Color.Transparent)
                .clickable(role = Role.Button, onClick = onClick).padding(horizontal = Spacing.md, vertical = 6.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(icon, null, tint = if (selected) scheme.primary else scheme.onSurfaceVariant, modifier = Modifier.size(22.dp))
            Spacer(Modifier.height(2.dp))
            Text(label, style = MaterialTheme.typography.labelSmall, color = if (selected) scheme.primary else scheme.onSurface,
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** Section title with a small coloured icon, and an optional "See all". */
@Composable
private fun SectionTitle(icon: ImageVector, title: String, onSeeAll: (() -> Unit)? = null) {
    val scheme = MaterialTheme.colorScheme
    Row(Modifier.fillMaxWidth().padding(start = Spacing.xs), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = scheme.primary, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(Spacing.sm))
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
        if (onSeeAll != null) {
            Surface(onClick = onSeeAll, shape = CircleShape, color = scheme.primary.copy(alpha = 0.1f)) {
                Row(Modifier.padding(horizontal = Spacing.md, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(R.string.ntp_see_all), style = MaterialTheme.typography.labelLarge, color = scheme.primary)
                    Spacer(Modifier.width(4.dp))
                    Icon(Icons.AutoMirrored.Outlined.ArrowForward, null, tint = scheme.primary, modifier = Modifier.size(16.dp))
                }
            }
        }
    }
}

// ---- Hero ------------------------------------------------------------------------------

private enum class Scene { MORNING, DAY, EVENING, NIGHT }

/** সকাল 5–11, দুপুর 12–15, বিকাল 16–19, রাত 20–4 (so 1:43 AM is night). */
internal fun sceneForHour(hour: Int): Int = when (hour) {
    in 5..11 -> 0
    in 12..15 -> 1
    in 16..19 -> 2
    else -> 3
}

private fun sceneNow(): Scene = Scene.entries[sceneForHour(Calendar.getInstance().get(Calendar.HOUR_OF_DAY))]

/** The current time, ticking every [periodMs] so "5 seconds ago" and the sky stay true. */
@Composable
private fun rememberNow(periodMs: Long): Long {
    val now by produceState(System.currentTimeMillis(), periodMs) {
        while (true) {
            delay(periodMs)
            value = System.currentTimeMillis()
        }
    }
    return now
}

/** Colours and light for one time of day. */
private class SkyStyle(
    val sky: List<Color>,
    val waves: List<Color>,
    val text: Color,
    val sub: Color,
    val core: List<Color>,
    val glow: Color,
    val birds: Color?,
    val cloud: Float,
    val cloudShade: Color,
)

private fun styleOf(scene: Scene): SkyStyle = when (scene) {
    Scene.MORNING -> SkyStyle(
        listOf(Color(0xFF8EC5FF), Color(0xFFC3B5FF), Color(0xFFFFD6C4)),
        listOf(Color(0x8CF3DCEF), Color(0xFFC7B4EC), Color(0xFF9A86D6), Color(0xFF6E5BB8)),
        Color(0xFF1B1838), Color(0xFF2D2752),
        listOf(Color(0xFFFFFAF0), Color(0xFFFFE2B0), Color(0xFFFFC285)), Color(0xFFFFE6C8), Color(0xFF2C2550), 0.85f, Color(0xFFE3D6F4),
    )
    Scene.DAY -> SkyStyle(
        listOf(Color(0xFF5AB4F0), Color(0xFF86CDF6), Color(0xFFB9E3FB), Color(0xFFDCF1FD)),
        listOf(Color(0x8CC6E8FB), Color(0xFF6FB8F0), Color(0xFF2F86E6), Color(0xFF1A5FD8)),
        Color(0xFF13265C), Color(0xFF1D3270),
        listOf(Color(0xFFFFFDF0), Color(0xFFFFF1B0), Color(0xFFFFD970)), Color(0xFFFFF6C8), Color(0xFF1B2A55), 0.92f, Color(0xFFD4E9F8),
    )
    Scene.EVENING -> SkyStyle(
        listOf(Color(0xFF35205F), Color(0xFF9C3F86), Color(0xFFF08A5D), Color(0xFFFFC07A)),
        listOf(Color(0x8CE98A8A), Color(0xFFC45A8C), Color(0xFF7A2F84), Color(0xFF3F1A5C)),
        Color.White, Color(0xFFFFE9F2),
        listOf(Color(0xFFFFF1C8), Color(0xFFFFB057), Color(0xFFFF6A2E)), Color(0xFFFFB36B), Color(0xFF2B1240), 0.5f, Color(0xFFD98FA6),
    )
    Scene.NIGHT -> SkyStyle(
        listOf(Color(0xFF0B1030), Color(0xFF1D1B56), Color(0xFF3A2C7A)),
        listOf(Color(0x8C4A3C8F), Color(0xFF2F2870), Color(0xFF211C55), Color(0xFF141038)),
        Color.White, Color(0xFFD9D6FF),
        emptyList(), Color(0xFFDCD8FF), null, 0f, Color.Transparent,
    )
}

/**
 * Sky card that follows the time of day: a realistic sun (or moon and stars at night) sitting
 * in open sky below the account button, soft clouds, flying birds and layered hills.
 */
@Composable
private fun SkyHero(signedIn: Boolean, account: GoogleAccount?, onAccount: () -> Unit, search: @Composable () -> Unit) {
    val context = LocalContext.current
    val minute = rememberNow(30_000L)
    val scene = remember(minute / 60_000L) { sceneNow() }
    val style = remember(scene) { styleOf(scene) }
    val greeting = when (scene) {
        Scene.MORNING -> R.string.ntp_greeting_morning
        Scene.DAY -> R.string.ntp_greeting_afternoon
        Scene.EVENING -> R.string.ntp_greeting_evening
        Scene.NIGHT -> R.string.ntp_greeting_night
    }
    val date = remember(minute / 3_600_000L) { DateUtils.formatDateTime(context, System.currentTimeMillis(), DateUtils.FORMAT_SHOW_WEEKDAY or DateUtils.FORMAT_SHOW_DATE) }
    val stars = remember { List(28) { Offset(Random.nextFloat(), Random.nextFloat()) } }
    val shape = RoundedCornerShape(26.dp)
    val motion = rememberInfiniteTransition(label = "sky")
    val flight by motion.animateFloat(0f, 1f, infiniteRepeatable(tween(18_000, easing = LinearEasing)), label = "flight")
    val flap by motion.animateFloat(0f, 1f, infiniteRepeatable(tween(520, easing = LinearEasing), RepeatMode.Reverse), label = "flap")
    val twinkle by motion.animateFloat(0.35f, 1f, infiniteRepeatable(tween(1_600), RepeatMode.Reverse), label = "twinkle")

    Box(
        Modifier.fillMaxWidth().widthIn(max = Layout.maxContentWidth).padding(horizontal = Spacing.md).padding(top = Spacing.xs)
            .height(214.dp).shadow(8.dp, shape, ambientColor = style.sky.first().copy(alpha = 0.45f), spotColor = style.sky.first().copy(alpha = 0.45f))
            .clip(shape),
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val u = 1.dp.toPx()
            val w = size.width
            val h = size.height
            drawRect(Brush.verticalGradient(style.sky))
            // Sun / moon: in open sky to the right, clear of the account button.
            val (ox, oy, r) = when (scene) {
                Scene.MORNING -> Triple(w - 66 * u, 98 * u, 15 * u)
                Scene.DAY -> Triple(w - 70 * u, 88 * u, 15 * u)
                Scene.EVENING -> Triple(w - 62 * u, 128 * u, 21 * u)
                Scene.NIGHT -> Triple(w - 70 * u, 88 * u, 14 * u)
            }
            val orb = Offset(ox, oy)
            if (scene == Scene.NIGHT) {
                stars.forEachIndexed { i, s ->
                    val p = Offset(w - 160 * u + s.x * 156 * u, 6 * u + s.y * 102 * u)
                    if ((p - orb).getDistance() < 30 * u || (p.x > w - 70 * u && p.y < 66 * u)) return@forEachIndexed
                    val a = if (i % 3 == 0) twinkle else 0.55f + (i % 4) * 0.1f
                    drawCircle(Color.White.copy(alpha = a), radius = (0.6f + (i % 4) * 0.35f) * u, center = p)
                }
                drawSoftGlow(orb, r * 3.4f, style.glow, 0.5f)
                drawCircle(
                    Brush.radialGradient(listOf(Color(0xFFFBFAF5), Color(0xFFE6E3D8), Color(0xFFC9C5B8)), center = orb - Offset(r * 0.2f, r * 0.24f), radius = r * 1.25f),
                    radius = r, center = orb,
                )
                val crater = Color(0xFF9D9888).copy(alpha = 0.28f)
                drawOval(crater, topLeft = orb + Offset(-10 * u, -8 * u), size = androidx.compose.ui.geometry.Size(10 * u, 8 * u))
                drawOval(crater, topLeft = orb + Offset(0f, -0.2f * u), size = androidx.compose.ui.geometry.Size(8 * u, 6.4f * u))
                drawCircle(crater, radius = 2 * u, center = orb + Offset(-3 * u, 7 * u))
                drawCircle(crater, radius = 1.6f * u, center = orb + Offset(6 * u, -7 * u))
            } else {
                // Sunlit sky, then the bloom, then the white-hot disc.
                drawCircle(
                    Brush.radialGradient(0f to style.glow.copy(alpha = 0.55f), 0.5f to style.glow.copy(alpha = 0.15f), 1f to Color.Transparent,
                        center = orb, radius = 170 * u),
                    radius = 170 * u, center = orb,
                )
                drawCircle(
                    Brush.radialGradient(0f to Color.White.copy(alpha = 0.95f), 0.35f to style.glow.copy(alpha = 0.55f), 1f to Color.Transparent,
                        center = orb, radius = r * 3.6f),
                    radius = r * 3.6f, center = orb,
                )
                drawCircle(
                    Brush.radialGradient(0f to Color.White, 0.55f to style.core[0], 0.85f to style.core[1], 1f to style.core[2], center = orb, radius = r),
                    radius = r, center = orb,
                )
                drawCircle(Color(0xFFBFF7D0).copy(alpha = 0.18f), radius = 6 * u, center = orb + Offset(-46 * u, 20 * u))
                drawCircle(Color(0xFFCFE3FF).copy(alpha = 0.18f), radius = 3 * u, center = orb + Offset(-70 * u, 31 * u))
            }
            if (style.cloud > 0f) {
                drawCloud(Offset(w - 30 * u, 134 * u), 0.9f * u, style.cloud, style.cloudShade)
                drawCloud(Offset(w - 126 * u, 124 * u), 0.55f * u, style.cloud * 0.85f, style.cloudShade)
            }
            style.birds?.let { color ->
                BIRDS.forEach { b ->
                    val p = (flight + b.delay) % 1f
                    val x = -24 * u + p * (w + 48 * u)
                    val y = h * b.y + kotlin.math.sin((p * 6.283f * 1.5f) + b.delay * 10f) * 5 * u
                    drawBird(Offset(x, y), b.size * u, if (b.flip) 1f - flap else flap, color.copy(alpha = 0.72f))
                }
            }
            // Four layered hills; the evening sun sets behind them.
            val sx = w / 388f
            val top = h - 106 * u
            fun wave(y0: Float, c1: Offset, p1: Offset, c2: Offset, p2: Offset, color: Color) {
                val path = Path().apply {
                    moveTo(0f, top + y0 * u)
                    quadraticTo(c1.x * sx, top + c1.y * u, p1.x * sx, top + p1.y * u)
                    quadraticTo(c2.x * sx, top + c2.y * u, p2.x * sx, top + p2.y * u)
                    lineTo(w, h); lineTo(0f, h); close()
                }
                drawPath(path, color)
            }
            wave(34f, Offset(90f, 6f), Offset(190f, 26f), Offset(290f, 46f), Offset(388f, 18f), style.waves[0])
            wave(52f, Offset(110f, 24f), Offset(214f, 46f), Offset(318f, 68f), Offset(388f, 36f), style.waves[1])
            wave(70f, Offset(130f, 46f), Offset(240f, 64f), Offset(350f, 82f), Offset(388f, 54f), style.waves[2])
            wave(86f, Offset(150f, 68f), Offset(270f, 82f), Offset(390f, 96f), Offset(388f, 76f), style.waves[3])
        }
        Column(Modifier.fillMaxSize().padding(start = Spacing.lg + Spacing.xs, end = Spacing.md, top = Spacing.md, bottom = Spacing.md)) {
            Row(verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        com.webtecit.nayon.core.designsystem.component.NayonLogoBadge(size = 40.dp)
                        Spacer(Modifier.width(Spacing.md))
                        Text(stringResource(R.string.app_name), style = MaterialTheme.typography.titleMedium, color = style.text, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.height(Spacing.sm))
                    Text(stringResource(greeting), style = MaterialTheme.typography.headlineMedium, color = style.text,
                        fontWeight = FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.semantics { heading() })
                    Spacer(Modifier.height(2.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.CalendarMonth, null, tint = style.sub, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(date, style = MaterialTheme.typography.bodyMedium, color = style.sub, maxLines = 1)
                    }
                }
                AccountButton(signedIn, account, onAccount)
            }
            Spacer(Modifier.weight(1f))
            search()
        }
    }
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawSoftGlow(c: Offset, radius: Float, color: Color, alpha: Float) {
    drawCircle(Brush.radialGradient(listOf(color.copy(alpha = alpha), Color.Transparent), center = c, radius = radius), radius = radius, center = c)
}

/** A soft cumulus cloud; [s] is pixels per design unit. */
private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawCloud(c: Offset, s: Float, alpha: Float, shade: Color) {
    val white = Color.White.copy(alpha = alpha)
    drawOval(shade.copy(alpha = alpha), topLeft = c + Offset(-34 * s, -1 * s), size = androidx.compose.ui.geometry.Size(68 * s, 18 * s))
    drawCircle(white, 11 * s, c + Offset(-18 * s, 2 * s))
    drawCircle(white, 15 * s, c + Offset(-2 * s, -6 * s))
    drawCircle(white, 11 * s, c + Offset(16 * s, 0f))
    drawCircle(white, 7 * s, c + Offset(28 * s, 5 * s))
    drawOval(white, topLeft = c + Offset(-28 * s, 0f), size = androidx.compose.ui.geometry.Size(60 * s, 12 * s))
}

/** Chrome-style account avatar: Google account sign-in, management and Google apps. */
@Composable
private fun AccountButton(signedIn: Boolean, account: GoogleAccount?, onClick: () -> Unit) {
    Box {
        Surface(onClick = onClick, shape = CircleShape, color = Color.White, shadowElevation = 2.dp, modifier = Modifier.size(40.dp)
            .semantics { contentDescription = account?.let { "Google account: ${it.email}" } ?: "Google account" }) {
            Box(contentAlignment = Alignment.Center) {
                when {
                    account != null -> AccountAvatar(account, 40.dp)
                    signedIn -> Icon(Icons.Filled.AccountCircle, null, tint = Color(0xFF4285F4), modifier = Modifier.size(36.dp))
                    else -> Icon(painterResource(R.drawable.ic_google_g), null, tint = Color.Unspecified, modifier = Modifier.size(22.dp))
                }
            }
        }
        if (signedIn) {
            Box(Modifier.align(Alignment.BottomEnd).size(12.dp).clip(CircleShape).background(Color.White).padding(2.dp)
                .clip(CircleShape).background(Color(0xFF34A853)))
        }
    }
}

/** The account's Google profile photo, or its first letter on a Google-blue circle. */
@Composable
fun AccountAvatar(account: GoogleAccount, size: Dp) {
    val photo = account.photo
    if (photo != null) {
        val image = remember(photo) { photo.asImageBitmap() }
        Image(image, account.name, contentScale = ContentScale.Crop, modifier = Modifier.size(size).clip(CircleShape))
    } else {
        Box(Modifier.size(size).clip(CircleShape).background(Color(0xFF4285F4)), contentAlignment = Alignment.Center) {
            Text(account.name.take(1).uppercase(), color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = (size.value * 0.45f).sp)
        }
    }
}

private class Bird(val delay: Float, val y: Float, val size: Float, val flip: Boolean)

/** A loose flock: different heights, sizes and wing timing so it looks natural. */
private val BIRDS = listOf(
    Bird(0.00f, 0.22f, 8f, false),
    Bird(0.04f, 0.17f, 6.5f, true),
    Bird(0.07f, 0.26f, 5.5f, false),
    Bird(0.52f, 0.15f, 7f, true),
    Bird(0.56f, 0.21f, 5f, false),
)

/** A bird seen from afar: two curved wings that flap ([wing] 0 = down, 1 = up). */
private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawBird(c: Offset, span: Float, wing: Float, color: Color) {
    val lift = span * (0.15f + 0.55f * wing.coerceIn(0f, 1f))
    val p = Path().apply {
        moveTo(c.x - span, c.y - lift * 0.6f)
        quadraticTo(c.x - span * 0.45f, c.y - lift, c.x, c.y)
        quadraticTo(c.x + span * 0.45f, c.y - lift, c.x + span, c.y - lift * 0.6f)
    }
    drawPath(p, color, style = androidx.compose.ui.graphics.drawscope.Stroke(width = span * 0.22f, cap = androidx.compose.ui.graphics.StrokeCap.Round))
}


@Composable
private fun PrivateHero() {
    Box(
        Modifier.fillMaxWidth().height(220.dp).background(Brush.verticalGradient(listOf(Color(0xFF14102B), Color(0xFF2A1F55), Color(0xFF3B2F73)))),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            Box(Modifier.size(64.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) {
                Icon(Icons.Outlined.VisibilityOff, null, tint = Color.White, modifier = Modifier.size(32.dp))
            }
            Text(stringResource(R.string.ntp_private_title), style = MaterialTheme.typography.titleLarge, color = Color.White,
                modifier = Modifier.semantics { heading() })
        }
    }
}

@Composable
private fun PrivateInfo(isolationSupported: Boolean) {
    val scheme = MaterialTheme.colorScheme
    Surface(shape = RoundedCornerShape(24.dp), color = scheme.surfaceContainerLow, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(Spacing.xl), verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
            Text(stringResource(R.string.ntp_private_body), style = MaterialTheme.typography.bodyMedium)
            Text(stringResource(R.string.ntp_private_note), style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
            if (!isolationSupported) {
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    Icon(Icons.Outlined.Info, null, tint = scheme.error, modifier = Modifier.size(18.dp))
                    Text(stringResource(R.string.ntp_private_not_isolated), style = MaterialTheme.typography.bodySmall, color = scheme.error)
                }
            }
        }
    }
}

// ---- Search ----------------------------------------------------------------------------

@Composable
private fun SearchPill(
    isPrivate: Boolean,
    voiceAvailable: Boolean,
    searchEngine: SearchEngine,
    actions: HomeActions,
    inHero: Boolean = false,
) {
    val scheme = MaterialTheme.colorScheme
    Surface(
        onClick = actions.onSearchClick,
        shape = CircleShape,
        // Inside the sky card the bar stays white in every theme, like Chrome's.
        color = if (inHero) Color.White else scheme.surfaceContainerLowest,
        contentColor = if (inHero) Color(0xFF1F1F1F) else scheme.onSurface,
        modifier = Modifier.fillMaxWidth().height(if (inHero) 52.dp else 60.dp)
            .shadow(if (inHero) 6.dp else 10.dp, CircleShape, ambientColor = scheme.primary.copy(alpha = 0.25f),
                spotColor = scheme.primary.copy(alpha = 0.25f)),
    ) {
        Row(Modifier.padding(start = Spacing.lg, end = Spacing.xs), verticalAlignment = Alignment.CenterVertically) {
            EngineMark(searchEngine)
            Spacer(Modifier.width(Spacing.md))
            Text(
                stringResource(if (isPrivate) R.string.address_hint_private else R.string.address_hint),
                style = MaterialTheme.typography.bodyLarge, color = if (inHero) Color(0xFF5F6368) else scheme.onSurfaceVariant,
                modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            if (voiceAvailable) {
                IconButton(onClick = actions.onVoiceClick) {
                    Icon(Icons.Outlined.Mic, stringResource(R.string.action_voice_search), tint = if (inHero) Color(0xFF4285F4) else scheme.primary)
                }
            }
            IconButton(onClick = actions.onLensClick) {
                Icon(painterResource(R.drawable.ic_google_lens), stringResource(R.string.action_lens), tint = Color.Unspecified, modifier = Modifier.size(24.dp))
            }
        }
    }
}

/** The search engine's own mark: the Google "G", or the engine's site icon. */
@Composable
private fun EngineMark(engine: SearchEngine) {
    when {
        engine == SearchEngine.GOOGLE ->
            Icon(painterResource(R.drawable.ic_google_g), engine.displayName, tint = Color.Unspecified, modifier = Modifier.size(24.dp))
        engine.homeUrl.isNotBlank() -> SiteIcon(engine.homeUrl, engine.displayName, size = 26.dp, downloadIcon = true)
        else -> Icon(Icons.Outlined.Search, null, tint = MaterialTheme.colorScheme.primary)
    }
}

/** AI Mode and Incognito, as on Chrome's new tab page. */
@Composable
private fun ModeButtons(actions: HomeActions) {
    Row(Modifier.fillMaxWidth().offset(y = (-6).dp), horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
        ModeButton(Icons.Outlined.AutoAwesome, stringResource(R.string.ntp_ai_mode), actions.onAiMode, Modifier.weight(1f))
        ModeButton(Icons.Outlined.VisibilityOff, stringResource(R.string.ntp_incognito), actions.onNewPrivateTab, Modifier.weight(1f))
    }
}

@Composable
private fun ModeButton(icon: ImageVector, label: String, onClick: () -> Unit, modifier: Modifier) {
    Surface(onClick = onClick, shape = CircleShape, color = MaterialTheme.colorScheme.surfaceContainerHigh, modifier = modifier.height(48.dp)) {
        Row(horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(Spacing.sm))
            Text(label, style = MaterialTheme.typography.titleSmall)
        }
    }
}

// ---- Shortcuts -------------------------------------------------------------------------

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ShortcutsCard(shortcuts: List<HomeShortcut>, actions: HomeActions) {
    val scheme = MaterialTheme.colorScheme
    var adding by rememberSaveable { mutableStateOf(false) }
    Surface(
        shape = RoundedCornerShape(26.dp), color = scheme.surfaceContainerLowest,
        border = androidx.compose.foundation.BorderStroke(1.dp, scheme.outlineVariant.copy(alpha = 0.35f)),
        modifier = Modifier.fillMaxWidth().shadow(6.dp, RoundedCornerShape(26.dp), ambientColor = scheme.primary.copy(alpha = 0.12f),
            spotColor = scheme.primary.copy(alpha = 0.12f)),
    ) {
        BoxWithConstraints(Modifier.padding(vertical = Spacing.md, horizontal = Spacing.xs)) {
            val columns = if (maxWidth < 300.dp) 3 else if (maxWidth > 520.dp) 6 else 4
            val tiles: List<HomeShortcut?> = shortcuts + listOf(null)   // null = "Add"
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                tiles.chunked(columns).forEach { row ->
                    Row(Modifier.fillMaxWidth()) {
                        row.forEach { s ->
                            var menu by remember { mutableStateOf(false) }
                            Box(Modifier.weight(1f)) {
                                Column(
                                    Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                                        .combinedClickable(
                                            role = Role.Button,
                                            onClick = { if (s == null) adding = true else actions.onOpenUrl(s.url) },
                                            onLongClick = { if (s != null) menu = true },
                                        )
                                        .padding(vertical = Spacing.md),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.spacedBy(Spacing.sm),
                                ) {
                                    Box(
                                        Modifier.size(56.dp).shadow(3.dp, CircleShape, spotColor = scheme.primary.copy(alpha = 0.3f))
                                            .clip(CircleShape).background(scheme.surfaceContainerLowest)
                                            .border(1.dp, scheme.outlineVariant.copy(alpha = 0.5f), CircleShape),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        if (s == null) Icon(Icons.Outlined.Add, null, tint = scheme.primary)
                                        else SiteIcon(s.url, s.label, size = 56.dp, downloadIcon = true, background = scheme.primary)
                                    }
                                    Text(
                                        if (s == null) stringResource(R.string.ntp_add_shortcut) else s.label,
                                        style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis,
                                        textAlign = TextAlign.Center, modifier = Modifier.padding(horizontal = Spacing.xs),
                                    )
                                }
                                if (s != null) {
                                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                                        DropdownMenuItem(text = { Text(stringResource(R.string.ntp_remove_shortcut)) },
                                            leadingIcon = { Icon(Icons.Outlined.Delete, null) },
                                            onClick = { menu = false; actions.onRemoveShortcut(s.url) })
                                    }
                                }
                            }
                        }
                        repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
            }
        }
    }
    if (adding) AddShortcutDialog(onDismiss = { adding = false }, onAdd = { l, u -> actions.onAddShortcut(l, u); adding = false })
}

@Composable
private fun AddShortcutDialog(onDismiss: () -> Unit, onAdd: (String, String) -> Unit) {
    var label by rememberSaveable { mutableStateOf("") }
    var url by rememberSaveable { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.ntp_add_shortcut)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                OutlinedTextField(label, { label = it }, label = { Text(stringResource(R.string.bookmark_name)) }, singleLine = true)
                OutlinedTextField(url, { url = it }, label = { Text(stringResource(R.string.ntp_shortcut_url)) }, singleLine = true)
            }
        },
        confirmButton = { TextButton(onClick = { onAdd(label, url) }, enabled = url.isNotBlank()) { Text(stringResource(R.string.action_save)) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.action_cancel)) } },
    )
}

// ---- Quick access ----------------------------------------------------------------------

@Composable
private fun QuickAccess(actions: HomeActions) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        SectionTitle(Icons.Outlined.Bolt, stringResource(R.string.ntp_quick_access))
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            QuickTile(Icons.Outlined.Bookmarks, stringResource(R.string.action_bookmarks), Color(0xFF7B2FF2), actions.onOpenBookmarks, Modifier.weight(1f))
            QuickTile(Icons.Outlined.History, stringResource(R.string.action_history), Color(0xFF1D7FE0), actions.onSeeHistory, Modifier.weight(1f))
            QuickTile(Icons.Outlined.Download, stringResource(R.string.action_downloads), Color(0xFF12A776), actions.onOpenDownloads, Modifier.weight(1f))
            QuickTile(Icons.Outlined.Translate, stringResource(R.string.ntp_translate), Color(0xFF6A35E8),
                { actions.onOpenUrl("https://translate.google.com") }, Modifier.weight(1f))
        }
    }
}

/** A soft tinted tile in the icon's own colour, readable in light and dark themes. */
@Composable
private fun QuickTile(icon: ImageVector, label: String, color: Color, onClick: () -> Unit, modifier: Modifier) {
    Surface(onClick = onClick, shape = RoundedCornerShape(20.dp), color = color.copy(alpha = 0.12f), modifier = modifier.height(76.dp)) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Icon(icon, null, tint = color, modifier = Modifier.size(26.dp))
            Spacer(Modifier.height(6.dp))
            Text(label, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = Spacing.xs))
        }
    }
}

// ---- Recent ----------------------------------------------------------------------------

@Composable
private fun RecentCard(recent: List<HistoryEntry>, actions: HomeActions) {
    val scheme = MaterialTheme.colorScheme
    val newest = recent.maxOfOrNull { it.visitedAt } ?: 0L
    val now = rememberNow(if (System.currentTimeMillis() - newest < 60_000L) 1_000L else 30_000L)
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        SectionTitle(Icons.Outlined.Schedule, stringResource(R.string.ntp_recent), onSeeAll = actions.onSeeHistory)
        Surface(
            shape = RoundedCornerShape(22.dp), color = scheme.surfaceContainerLowest,
            border = androidx.compose.foundation.BorderStroke(1.dp, scheme.outlineVariant.copy(alpha = 0.35f)), modifier = Modifier.fillMaxWidth(),
        ) {
            Column {
                recent.forEach { e ->
                    var menu by remember { mutableStateOf(false) }
                    Row(
                        Modifier.fillMaxWidth().clickable(role = Role.Button) { actions.onOpenUrl(e.url) }
                            .padding(start = Spacing.lg, top = Spacing.sm, bottom = Spacing.sm),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        SiteIcon(e.url, e.title, size = 40.dp)
                        Spacer(Modifier.width(Spacing.md))
                        Column(Modifier.weight(1f)) {
                            Text(e.title.ifBlank { UrlResolver.displayHost(e.url) }, style = MaterialTheme.typography.titleSmall,
                                maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(
                                "${UrlResolver.displayHost(e.url)} · ${timeAgo(e.visitedAt, now)}",
                                style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis,
                            )
                        }
                        Box {
                            IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, stringResource(R.string.action_menu), tint = scheme.onSurfaceVariant) }
                            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                                DropdownMenuItem(text = { Text(stringResource(R.string.ntp_remove_recent)) },
                                    leadingIcon = { Icon(Icons.Outlined.Delete, null) },
                                    onClick = { menu = false; actions.onRemoveRecent(e.id) })
                            }
                        }
                    }
                }
            }
        }
    }
}

/** One quiet line of credit, like the footer of a well-made app. Details live on the About page. */
@Composable
private fun Footer(onOpenAbout: () -> Unit) {
    Text(
        stringResource(R.string.ntp_footer),
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f),
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().clip(CircleShape).clickable(role = Role.Button, onClick = onOpenAbout).padding(Spacing.md),
    )
}

/** "5 seconds ago", "3 minutes ago", "2 hours ago", "4 days ago", then the date. */
@Composable
private fun timeAgo(time: Long, now: Long): String {
    val res = LocalContext.current.resources
    val secs = ((now - time) / 1000L).coerceAtLeast(0L)
    return when {
        secs < 5 -> res.getString(R.string.time_just_now)
        secs < 60 -> res.getQuantityString(R.plurals.time_seconds_ago, secs.toInt(), secs.toInt())
        secs < 3600 -> (secs / 60).toInt().let { res.getQuantityString(R.plurals.time_minutes_ago, it, it) }
        secs < 86_400 -> (secs / 3600).toInt().let { res.getQuantityString(R.plurals.time_hours_ago, it, it) }
        secs < 7 * 86_400 -> (secs / 86_400).toInt().let { res.getQuantityString(R.plurals.time_days_ago, it, it) }
        else -> DateUtils.formatDateTime(LocalContext.current, time, DateUtils.FORMAT_SHOW_DATE or DateUtils.FORMAT_ABBREV_MONTH)
    }
}
