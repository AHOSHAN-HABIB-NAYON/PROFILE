package com.webtecit.devicepilot.security

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Fingerprint
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.fragment.app.FragmentActivity
import com.webtecit.devicepilot.R

/** Full-screen lock shown over the app until Android confirms fingerprint / face / screen lock. */
@Composable
fun LockScreen(onUnlocked: () -> Unit) {
    val activity = LocalContext.current as? FragmentActivity
    var error by remember { mutableStateOf<String?>(null) }
    val title = stringResource(R.string.lock_prompt_title)
    val subtitle = stringResource(R.string.lock_prompt_subtitle)
    fun unlock() {
        val a = activity ?: return onUnlocked()
        AppLock.authenticate(a, title, subtitle, onSuccess = onUnlocked, onFail = { error = it })
    }
    LaunchedEffect(Unit) { unlock() }

    Box(
        Modifier.fillMaxSize()
            .background(Brush.verticalGradient(listOf(Color(0xFF1E6BFF), Color(0xFF0B1B3F))))
            // swallow touches so the app underneath cannot be used
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {},
        contentAlignment = Alignment.Center,
    ) {
        Column(Modifier.padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Image(painterResource(R.drawable.ic_launcher_foreground), null,
                Modifier.size(96.dp).clip(RoundedCornerShape(26.dp)).background(Color.White.copy(alpha = 0.12f)))
            Spacer(Modifier.height(16.dp))
            Text(stringResource(R.string.lock_title), style = MaterialTheme.typography.headlineSmall, color = Color.White)
            Spacer(Modifier.height(6.dp))
            Text(stringResource(R.string.lock_text), style = MaterialTheme.typography.bodyMedium,
                color = Color.White.copy(alpha = 0.8f), textAlign = TextAlign.Center)
            error?.let {
                Spacer(Modifier.height(8.dp))
                Text(it, style = MaterialTheme.typography.bodySmall, color = Color(0xFFFFB4AB), textAlign = TextAlign.Center)
            }
            Spacer(Modifier.height(24.dp))
            Button(onClick = { error = null; unlock() },
                colors = ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = Color(0xFF0B1B3F))) {
                Icon(Icons.Outlined.Fingerprint, null)
                Spacer(Modifier.width(8.dp))
                Text(stringResource(R.string.lock_unlock))
            }
        }
    }
}
