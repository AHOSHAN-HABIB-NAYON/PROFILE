package com.filepilot.app.ui.onboarding

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.CreateNewFolder
import androidx.compose.material.icons.rounded.FolderSpecial
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.PermMedia
import androidx.compose.material.icons.rounded.PictureAsPdf
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.WifiOff
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.filepilot.app.R
import com.filepilot.app.permissions.AccessOutcome
import com.filepilot.app.permissions.StorageAccess
import com.filepilot.app.permissions.rememberAccessRequester
import com.filepilot.app.ui.theme.Brand
import kotlin.math.cos
import kotlin.math.sin
import kotlinx.coroutines.delay

private enum class AccessChoice { FULL, MEDIA, FOLDERS }

/**
 * Explains file access before anything is requested. The user picks a level of access;
 * the matching system prompt is shown only after tapping Continue.
 */
@Composable
fun OnboardingScreen(onDone: () -> Unit) {
    var choice by rememberSaveable { mutableStateOf(AccessChoice.FULL) }
    val requester = rememberAccessRequester { _: AccessOutcome -> onDone() }
    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        delay(60)
        visible = true
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding()
            .navigationBarsPadding(),
    ) {
        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(16.dp))
            OrbitIllustration()
            Spacer(Modifier.height(8.dp))
            Staggered(visible, 0) {
                Text(
                    "Your files stay on your device",
                    style = MaterialTheme.typography.headlineSmall,
                    textAlign = TextAlign.Center,
                )
            }
            Spacer(Modifier.height(8.dp))
            Staggered(visible, 1) {
                Text(
                    "FilePilot needs storage access to show and manage your files. Choose how much it can see — you can change this at any time.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.widthIn(max = 420.dp),
                )
            }
            Spacer(Modifier.height(20.dp))

            val fullDetail = if (StorageAccess.usesAllFilesAccess) {
                "Browse every folder on shared storage and copy, move, rename, delete and extract files. Android shows its “All files access” page where you can switch it on."
            } else {
                "Browse every folder on shared storage and copy, move, rename, delete and extract files. Android will ask for the storage permission."
            }
            Staggered(visible, 2) {
                ChoiceCard(
                    selected = choice == AccessChoice.FULL,
                    icon = Icons.Rounded.FolderSpecial,
                    title = "Full file management",
                    badge = "Recommended",
                    detail = fullDetail,
                    onClick = { choice = AccessChoice.FULL },
                )
            }
            Staggered(visible, 3) {
                ChoiceCard(
                    selected = choice == AccessChoice.MEDIA,
                    icon = Icons.Rounded.PermMedia,
                    title = "Photos, videos & audio",
                    badge = null,
                    detail = "Read-only access to your media library. Documents, downloads and changing files need more access later.",
                    onClick = { choice = AccessChoice.MEDIA },
                )
            }
            Staggered(visible, 4) {
                ChoiceCard(
                    selected = choice == AccessChoice.FOLDERS,
                    icon = Icons.Rounded.CreateNewFolder,
                    title = "Only folders I choose",
                    badge = null,
                    detail = "Pick specific folders with Android's folder picker. FilePilot sees nothing else and no permission is needed.",
                    onClick = { choice = AccessChoice.FOLDERS },
                )
            }

            Spacer(Modifier.height(12.dp))
            Staggered(visible, 5) {
                Column(Modifier.fillMaxWidth()) {
                    FactRow(Icons.Rounded.WifiOff, "No internet access", "FilePilot has no internet permission. Your files are never uploaded or collected.")
                    FactRow(Icons.Rounded.Lock, "Private app data stays private", "Android keeps other apps' private folders out of reach, and FilePilot doesn't try to access them.")
                    FactRow(
                        Icons.Rounded.Settings, "Change it later",
                        "Open FilePilot Settings → Storage access, or Android Settings → Apps → FilePilot → Permissions.",
                    )
                }
            }
            Spacer(Modifier.height(16.dp))
        }

        Column(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            ContinueButton(
                label = when (choice) {
                    AccessChoice.FULL -> "Continue"
                    AccessChoice.MEDIA -> "Continue"
                    AccessChoice.FOLDERS -> "Choose a folder"
                },
                onClick = {
                    when (choice) {
                        AccessChoice.FULL -> requester.requestFullAccess()
                        AccessChoice.MEDIA -> requester.requestMediaAccess()
                        AccessChoice.FOLDERS -> requester.pickFolder()
                    }
                },
            )
            TextButton(onClick = onDone) { Text("Not now") }
        }
    }
}

@Composable
private fun Staggered(visible: Boolean, index: Int, content: @Composable () -> Unit) {
    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(tween(380, delayMillis = index * 70)) +
            slideInVertically(tween(420, delayMillis = index * 70)) { it / 5 },
    ) { content() }
}

/** Logo with a slowly orbiting ring of file-type badges. */
@Composable
private fun OrbitIllustration() {
    val t = rememberInfiniteTransition(label = "orbit")
    val angle by t.animateFloat(0f, 360f, infiniteRepeatable(tween(24000, easing = androidx.compose.animation.core.LinearEasing)), label = "angle")
    val ring = MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)
    Box(Modifier.size(200.dp), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            drawCircle(ring, radius = size.minDimension * 0.42f, style = Stroke(width = 1.5.dp.toPx()))
            drawCircle(ring.copy(alpha = 0.1f), radius = size.minDimension * 0.30f, style = Stroke(width = 1.dp.toPx()))
            drawCircle(
                Brush.radialGradient(listOf(Brand.Violet.copy(alpha = 0.16f), Color.Transparent), center = center, radius = size.minDimension * 0.4f),
                radius = size.minDimension * 0.4f,
            )
        }
        Image(painterResource(R.drawable.ic_logo_mark), contentDescription = null, modifier = Modifier.size(76.dp))
        val badges = listOf(
            Triple(Icons.Rounded.Image, Color(0xFF10B981), 0f),
            Triple(Icons.Rounded.MusicNote, Color(0xFFF59E0B), 120f),
            Triple(Icons.Rounded.PictureAsPdf, Color(0xFFE11D48), 240f),
        )
        badges.forEach { (icon, color, base) ->
            val a = Math.toRadians((angle + base).toDouble())
            val r = 84f
            Box(
                Modifier
                    .offset(x = (cos(a) * r).toFloat().dp, y = (sin(a) * r).toFloat().dp)
                    .size(34.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.surfaceContainerLowest)
                    .border(1.dp, color.copy(alpha = 0.25f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, null, tint = color, modifier = Modifier.size(18.dp))
            }
        }
    }
}

@Composable
private fun ChoiceCard(
    selected: Boolean,
    icon: ImageVector,
    title: String,
    badge: String?,
    detail: String,
    onClick: () -> Unit,
) {
    val border by animateColorAsState(
        if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
        label = "choiceBorder",
    )
    val bg by animateColorAsState(
        if (selected) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.45f) else MaterialTheme.colorScheme.surfaceContainerLowest,
        label = "choiceBg",
    )
    Row(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 5.dp)
            .clip(MaterialTheme.shapes.large)
            .background(bg)
            .border(if (selected) 1.5.dp else 1.dp, border, MaterialTheme.shapes.large)
            .selectable(selected = selected, onClick = onClick, role = Role.RadioButton)
            .padding(14.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Box(
            Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center,
        ) { Icon(icon, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp)) }
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(title, style = MaterialTheme.typography.titleSmall)
                if (badge != null) {
                    Spacer(Modifier.width(8.dp))
                    Text(
                        badge,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.clip(RoundedCornerShape(50)).background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f))
                            .padding(horizontal = 7.dp, vertical = 2.dp),
                    )
                }
            }
            Spacer(Modifier.height(3.dp))
            Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        RadioButton(selected = selected, onClick = null)
    }
}

@Composable
private fun FactRow(icon: ImageVector, title: String, detail: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 7.dp), verticalAlignment = Alignment.Top) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp).padding(top = 2.dp))
        Spacer(Modifier.width(12.dp))
        Column {
            Text(title, style = MaterialTheme.typography.labelLarge)
            Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** Gradient pill with a press-scale and a gently nudging arrow. */
@Composable
fun ContinueButton(label: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.97f else 1f, label = "press")
    val t = rememberInfiniteTransition(label = "nudge")
    val nudge by t.animateFloat(0f, 4f, infiniteRepeatable(tween(700), RepeatMode.Reverse), label = "nudge")
    Surface(
        onClick = onClick,
        interactionSource = interaction,
        shape = RoundedCornerShape(50),
        color = Color.Transparent,
        modifier = modifier.fillMaxWidth().widthIn(max = 420.dp).height(52.dp).scale(scale),
    ) {
        Box(
            Modifier.fillMaxSize().background(Brush.horizontalGradient(listOf(Brand.Indigo, Brand.Violet))),
            contentAlignment = Alignment.Center,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
                Text(label, style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold), color = Color.White)
                Spacer(Modifier.width(8.dp))
                Icon(
                    Icons.AutoMirrored.Rounded.ArrowForward, null, tint = Color.White,
                    modifier = Modifier.size(18.dp).graphicsLayer { translationX = nudge * density },
                )
            }
        }
    }
}

