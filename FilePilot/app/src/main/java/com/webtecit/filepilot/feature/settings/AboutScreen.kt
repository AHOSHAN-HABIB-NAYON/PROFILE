@file:OptIn(ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.settings

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Gavel
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.Mail
import androidx.compose.material.icons.rounded.PrivacyTip
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Verified
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material3.HorizontalDivider
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.webtecit.filepilot.BuildConfig
import com.webtecit.filepilot.R
import com.webtecit.filepilot.brand.Brand
import com.webtecit.filepilot.core.common.copyText
import com.webtecit.filepilot.core.designsystem.AppLogo
import com.webtecit.filepilot.core.designsystem.SettingsRow
import kotlinx.coroutines.launch

@Composable
fun AboutScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    fun show(message: String?) {
        if (message != null) scope.launch { snackbar.showSnackbar(message) }
    }

    Scaffold(
        topBar = {
            Row(Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Surface(onClick = onBack, shape = CircleShape, color = MaterialTheme.colorScheme.surfaceContainerLowest, shadowElevation = 3.dp, modifier = Modifier.size(42.dp)) {
                    Box(contentAlignment = Alignment.Center) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") }
                }
                Spacer(Modifier.width(14.dp))
                Text("About", style = MaterialTheme.typography.headlineSmall)
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        val blue = MaterialTheme.colorScheme.primary
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(horizontal = 18.dp).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // App hero: logo with decorative squares.
            Box(Modifier.padding(top = 8.dp).size(150.dp, 120.dp), contentAlignment = Alignment.Center) {
                Box(Modifier.align(Alignment.TopStart).padding(start = 8.dp, top = 6.dp).size(18.dp).clip(RoundedCornerShape(5.dp)).background(blue.copy(alpha = 0.14f)))
                Box(Modifier.align(Alignment.BottomEnd).padding(end = 6.dp, bottom = 10.dp).size(24.dp).clip(RoundedCornerShape(6.dp)).background(blue.copy(alpha = 0.10f)))
                Box(Modifier.align(Alignment.TopEnd).padding(end = 14.dp, top = 2.dp).size(10.dp).clip(RoundedCornerShape(3.dp)).background(blue.copy(alpha = 0.22f)))
                Surface(shape = RoundedCornerShape(28.dp), color = MaterialTheme.colorScheme.surfaceContainerLowest, shadowElevation = 8.dp) {
                    AppLogo(72.dp, Modifier.padding(10.dp))
                }
            }
            Text(Brand.APP_NAME, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text(
                Brand.STORE_NAME, style = MaterialTheme.typography.labelLarge, color = blue,
                modifier = Modifier.clip(CircleShape).background(blue.copy(alpha = 0.10f)).padding(horizontal = 14.dp, vertical = 6.dp),
            )
            Text(
                "Version ${BuildConfig.VERSION_NAME}  •  Build ${BuildConfig.VERSION_CODE}",
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(Modifier.fillMaxWidth(0.6f), verticalAlignment = Alignment.CenterVertically) {
                HorizontalDivider(Modifier.weight(1f), color = MaterialTheme.colorScheme.outlineVariant)
                Icon(Icons.Rounded.Star, null, tint = blue, modifier = Modifier.padding(horizontal = 8.dp).size(14.dp))
                HorizontalDivider(Modifier.weight(1f), color = MaterialTheme.colorScheme.outlineVariant)
            }
            Text(
                "A fast, private file manager and developer toolkit that works offline. Your files never leave your device.",
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 8.dp),
            )

            // Developer card.
            Surface(
                shape = RoundedCornerShape(24.dp),
                color = MaterialTheme.colorScheme.surfaceContainerLowest,
                shadowElevation = 3.dp,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
                modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
            ) {
                Box {
                    // Soft decorative wave in the corner.
                    Box(
                        Modifier.align(Alignment.BottomEnd).size(120.dp, 70.dp)
                            .clip(RoundedCornerShape(topStart = 70.dp))
                            .background(Brush.linearGradient(listOf(Color.Transparent, blue.copy(alpha = 0.10f)))),
                    )
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Image(
                            painterResource(R.drawable.developer_photo),
                            contentDescription = "Photo of ${Brand.DEVELOPER}",
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.size(76.dp).clip(CircleShape).border(2.dp, blue.copy(alpha = 0.5f), CircleShape),
                        )
                        Box(Modifier.padding(horizontal = 14.dp).width(1.dp).height(64.dp).background(MaterialTheme.colorScheme.outlineVariant))
                        Column(Modifier.weight(1f)) {
                            Row(
                                Modifier.clip(CircleShape).background(blue.copy(alpha = 0.10f)).padding(horizontal = 10.dp, vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(Icons.Rounded.Verified, null, tint = blue, modifier = Modifier.size(14.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Developer", style = MaterialTheme.typography.labelMedium, color = blue)
                            }
                            Spacer(Modifier.height(6.dp))
                            Text(Brand.DEVELOPER, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            Text(Brand.BRAND, style = MaterialTheme.typography.bodyMedium, color = blue)
                        }
                    }
                }
            }

            LinkCard(Icons.Rounded.Language, "Visit website", "webtecit.com") { show(Brand.openUrl(context, Brand.WEBSITE)) }
            LinkCard(Icons.Rounded.Mail, "Contact developer", Brand.SUPPORT_EMAIL) { show(Brand.email(context, "${Brand.APP_NAME}: question")) }
            LinkCard(Icons.Rounded.ContentCopy, "Copy email address", "Copy to clipboard") {
                copyText(context, "Email", Brand.SUPPORT_EMAIL)
                Toast.makeText(context, "Email address copied", Toast.LENGTH_SHORT).show()
            }
            LinkCard(Icons.Rounded.Share, "Share app", "Tell your friends about FilePilot") { show(Brand.shareApp(context)) }
            LinkCard(Icons.Rounded.PrivacyTip, "Privacy Policy", "How your data is handled") { show(Brand.openUrl(context, Brand.PRIVACY_URL)) }
            LinkCard(Icons.Rounded.Gavel, "Terms & Conditions", "Rules for using the app") { show(Brand.openUrl(context, Brand.TERMS_URL)) }
            LinkCard(Icons.Rounded.Info, "Disclaimer", "Important notes") { show(Brand.openUrl(context, Brand.DISCLAIMER_URL)) }

            // Thank-you footer.
            Surface(shape = RoundedCornerShape(22.dp), color = blue.copy(alpha = 0.08f), modifier = Modifier.fillMaxWidth()) {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Thank you for using FilePilot!", style = MaterialTheme.typography.titleSmall, color = blue)
                        Text("Keep your device organized and secure.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Icon(Icons.Rounded.Favorite, null, tint = blue)
                }
            }
            Text(
                "© 2026 ${Brand.DEVELOPER} · ${Brand.BRAND}",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 16.dp),
            )
        }
    }
}

@Composable
private fun LinkCard(icon: ImageVector, title: String, subtitle: String, onClick: () -> Unit) {
    val blue = MaterialTheme.colorScheme.primary
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(20.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        shadowElevation = 2.dp,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(Modifier.padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(42.dp).clip(CircleShape).background(blue.copy(alpha = 0.10f)), contentAlignment = Alignment.Center) {
                Icon(icon, null, tint = blue, modifier = Modifier.size(22.dp))
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleSmall)
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = blue)
        }
    }
}
