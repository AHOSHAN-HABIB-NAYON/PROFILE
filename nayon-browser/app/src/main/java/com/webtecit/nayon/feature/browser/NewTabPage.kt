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
) {
    val scheme = MaterialTheme.colorScheme
    Box(modifier.fillMaxSize().background(scheme.surface), contentAlignment = Alignment.TopCenter) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (isPrivate) PrivateHero() else SkyHero(googleSignedIn, googleAccount, actions.onAccount)
            Column(
                Modifier.fillMaxWidth().widthIn(max = Layout.maxContentWidth).offset(y = (-30).dp).padding(horizontal = Spacing.gutter),
                verticalArrangement = Arrangement.spacedBy(Spacing.lg),
            ) {
                SearchPill(isPrivate, voiceAvailable, searchEngine, actions)
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
    }
}

// ---- Hero ------------------------------------------------------------------------------

private enum class Scene { MORNING, DAY, EVENING, NIGHT }

/** Morning 5–11, afternoon 12–16, evening 17–19, night 20–4 (so 1:43 AM is night). */
internal fun sceneForHour(hour: Int): Int = when (hour) {
    in 5..11 -> 0
    in 12..16 -> 1
    in 17..19 -> 2
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

/** Sky-and-mountains scene that follows the time of day, like the NAYON mock-up. */
@Composable
private fun SkyHero(signedIn: Boolean, account: GoogleAccount?, onAccount: () -> Unit) {
    val context = LocalContext.current
    val minute = rememberNow(30_000L)
    val scene = remember(minute / 60_000L) { sceneNow() }
    val (sky, sunColor, hills, textColor) = when (scene) {
        Scene.MORNING -> Quad(listOf(Color(0xFF7DB7FF), Color(0xFFC9B6FF), Color(0xFFFFD3C2)), Color(0xFFFFF1C1),
            listOf(Color(0xFF8E7CC3), Color(0xFF6C5CA8), Color(0xFF4B3F86)), Color(0xFF1B1530))
        Scene.DAY -> Quad(listOf(Color(0xFF2F80ED), Color(0xFF6FB1FC), Color(0xFFBFE1FF)), Color(0xFFFFF7D6),
            listOf(Color(0xFF6A8EDB), Color(0xFF4A6FC2), Color(0xFF2F4F9E)), Color(0xFF0F1B3D))
        Scene.EVENING -> Quad(listOf(Color(0xFF3B1E6E), Color(0xFFB83E8A), Color(0xFFF6A15A)), Color(0xFFFFD08A),
            listOf(Color(0xFF6B2E7A), Color(0xFF4A1F5E), Color(0xFF2B1240)), Color.White)
        Scene.NIGHT -> Quad(listOf(Color(0xFF070A1F), Color(0xFF18164A), Color(0xFF3A2C7A)), Color(0xFFE8E6FF),
            listOf(Color(0xFF2A2563), Color(0xFF1C1847), Color(0xFF110E30)), Color.White)
    }
    val greeting = when (scene) {
        Scene.MORNING -> R.string.ntp_greeting_morning
        Scene.DAY -> R.string.ntp_greeting_afternoon
        Scene.EVENING -> R.string.ntp_greeting_evening
        Scene.NIGHT -> R.string.ntp_greeting_night
    }
    val date = remember(minute / 3_600_000L) { DateUtils.formatDateTime(context, System.currentTimeMillis(), DateUtils.FORMAT_SHOW_WEEKDAY or DateUtils.FORMAT_SHOW_DATE) }
    val stars = remember { List(40) { Offset(Random.nextFloat(), Random.nextFloat() * 0.55f) } }

    Box(Modifier.fillMaxWidth().height(250.dp)) {
        Canvas(Modifier.fillMaxSize()) {
            drawRect(Brush.verticalGradient(sky))
            if (scene == Scene.NIGHT) stars.forEach { drawCircle(Color.White.copy(alpha = 0.7f), radius = 1.6f, center = Offset(it.x * size.width, it.y * size.height)) }
            val sun = Offset(size.width * 0.78f, size.height * 0.36f)
            drawCircle(Brush.radialGradient(listOf(sunColor.copy(alpha = 0.55f), Color.Transparent), center = sun, radius = 120f), radius = 120f, center = sun)
            drawCircle(sunColor, radius = 34f, center = sun)
            fun ridge(baseY: Float, amp: Float, phase: Float, color: Color) {
                val p = Path().apply {
                    moveTo(0f, size.height)
                    lineTo(0f, size.height * baseY)
                    val steps = 6
                    for (i in 1..steps) {
                        val x = size.width * i / steps
                        val peak = size.height * (baseY - amp * (if ((i + phase.toInt()) % 2 == 0) 1f else 0.35f))
                        quadraticTo(x - size.width / steps / 2, peak, x, size.height * baseY + (i % 3) * 6f)
                    }
                    lineTo(size.width, size.height)
                    close()
                }
                drawPath(p, color)
            }
            ridge(0.66f, 0.16f, 0f, hills[0].copy(alpha = 0.75f))
            ridge(0.76f, 0.12f, 1f, hills[1].copy(alpha = 0.9f))
            ridge(0.88f, 0.08f, 0f, hills[2])
        }
        Column(Modifier.padding(start = Spacing.xl, end = Spacing.xl, top = Spacing.xl)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                NayonLogo(size = 30.dp)
                Spacer(Modifier.width(Spacing.sm))
                Text(stringResource(R.string.app_name), style = MaterialTheme.typography.titleMedium, color = textColor, fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f))
                AccountButton(signedIn, account, onAccount)
            }
            Spacer(Modifier.height(Spacing.lg))
            Text(stringResource(greeting), style = MaterialTheme.typography.headlineMedium, color = textColor,
                fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() })
            Text(date, style = MaterialTheme.typography.bodyMedium, color = textColor.copy(alpha = 0.85f))
        }
    }
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

private data class Quad(val sky: List<Color>, val sun: Color, val hills: List<Color>, val text: Color)

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
private fun SearchPill(isPrivate: Boolean, voiceAvailable: Boolean, searchEngine: SearchEngine, actions: HomeActions) {
    val scheme = MaterialTheme.colorScheme
    Surface(
        onClick = actions.onSearchClick,
        shape = CircleShape,
        color = scheme.surfaceContainerLowest,
        modifier = Modifier.fillMaxWidth().height(60.dp).shadow(10.dp, CircleShape, ambientColor = scheme.primary.copy(alpha = 0.25f),
            spotColor = scheme.primary.copy(alpha = 0.25f)),
    ) {
        Row(Modifier.padding(start = Spacing.lg, end = Spacing.xs), verticalAlignment = Alignment.CenterVertically) {
            EngineMark(searchEngine)
            Spacer(Modifier.width(Spacing.md))
            Text(
                stringResource(if (isPrivate) R.string.address_hint_private else R.string.address_hint),
                style = MaterialTheme.typography.bodyLarge, color = scheme.onSurfaceVariant,
                modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            if (voiceAvailable) {
                IconButton(onClick = actions.onVoiceClick) { Icon(Icons.Outlined.Mic, stringResource(R.string.action_voice_search), tint = scheme.primary) }
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
    Surface(shape = RoundedCornerShape(28.dp), color = scheme.surfaceContainerLow, modifier = Modifier.fillMaxWidth()) {
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
                                        Modifier.size(56.dp).clip(CircleShape).background(scheme.surfaceContainerLowest)
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
        Text(stringResource(R.string.ntp_quick_access), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(start = Spacing.xs))
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            QuickTile(Icons.Outlined.Bookmarks, stringResource(R.string.action_bookmarks), Color(0xFF6366F1), actions.onOpenBookmarks, Modifier.weight(1f))
            QuickTile(Icons.Outlined.History, stringResource(R.string.action_history), Color(0xFF0EA5E9), actions.onSeeHistory, Modifier.weight(1f))
            QuickTile(Icons.Outlined.Download, stringResource(R.string.action_downloads), Color(0xFF10B981), actions.onOpenDownloads, Modifier.weight(1f))
            QuickTile(Icons.Outlined.Translate, stringResource(R.string.ntp_translate), Color(0xFFA855F7),
                { actions.onOpenUrl("https://translate.google.com") }, Modifier.weight(1f))
        }
    }
}

@Composable
private fun QuickTile(icon: ImageVector, label: String, color: Color, onClick: () -> Unit, modifier: Modifier) {
    Surface(onClick = onClick, shape = RoundedCornerShape(22.dp), color = MaterialTheme.colorScheme.surfaceContainerLow, modifier = modifier) {
        Column(Modifier.padding(vertical = Spacing.md), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            Box(Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(Brush.linearGradient(listOf(color, color.copy(alpha = 0.7f)))),
                contentAlignment = Alignment.Center) {
                Icon(icon, null, tint = Color.White, modifier = Modifier.size(22.dp))
            }
            Text(label, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
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
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(stringResource(R.string.ntp_recent), style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f).padding(start = Spacing.xs))
            TextButton(onClick = actions.onSeeHistory) { Text(stringResource(R.string.ntp_see_all)) }
        }
        Surface(shape = RoundedCornerShape(24.dp), color = scheme.surfaceContainerLow, modifier = Modifier.fillMaxWidth()) {
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
