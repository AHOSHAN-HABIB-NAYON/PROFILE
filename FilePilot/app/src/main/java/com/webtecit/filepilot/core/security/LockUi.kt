package com.webtecit.filepilot.core.security

import android.content.Context
import android.content.ContextWrapper
import android.os.Build
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Backspace
import androidx.compose.material.icons.rounded.Fingerprint
import androidx.compose.material.icons.rounded.Lock
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.webtecit.filepilot.core.designsystem.IconTile

object Biometrics {
    private val authenticators: Int
        get() = if (Build.VERSION.SDK_INT >= 30) BIOMETRIC_STRONG or DEVICE_CREDENTIAL else BIOMETRIC_WEAK

    fun available(context: Context): Boolean =
        BiometricManager.from(context).canAuthenticate(authenticators) == BiometricManager.BIOMETRIC_SUCCESS

    fun prompt(context: Context, title: String, onSuccess: () -> Unit) {
        val activity = context.findFragmentActivity() ?: return
        val info = BiometricPrompt.PromptInfo.Builder().setTitle(title).setSubtitle("FilePilot").apply {
            setAllowedAuthenticators(authenticators)
            if (Build.VERSION.SDK_INT < 30) setNegativeButtonText("Use PIN")
        }.build()
        BiometricPrompt(activity, ContextCompat.getMainExecutor(activity), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) = onSuccess()
        }).authenticate(info)
    }

    private fun Context.findFragmentActivity(): FragmentActivity? {
        var c: Context? = this
        while (c is ContextWrapper) {
            if (c is FragmentActivity) return c
            c = c.baseContext
        }
        return null
    }
}

/**
 * A PIN pad. In [confirmNew] mode it asks for a new PIN twice; otherwise it checks [verify].
 * Fingerprint/face/device credential is offered when available.
 */
@Composable
fun PinPad(
    title: String,
    subtitle: String,
    confirmNew: Boolean,
    verify: (String) -> Boolean,
    onDone: (String) -> Unit,
    allowBiometric: Boolean = true,
) {
    val context = LocalContext.current
    var pin by remember { mutableStateOf("") }
    var first by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val canBio = allowBiometric && !confirmNew && Biometrics.available(context)
    LaunchedEffect(Unit) { if (canBio) Biometrics.prompt(context, title) { onDone("") } }

    fun submit() {
        if (pin.length < 4) { error = "Use at least 4 digits."; return }
        if (confirmNew) {
            if (first == null) { first = pin; pin = ""; error = null }
            else if (first == pin) onDone(pin)
            else { error = "The PINs didn't match. Try again."; first = null; pin = "" }
        } else if (verify(pin)) onDone(pin)
        else { error = "Wrong PIN. Try again."; pin = "" }
    }

    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        IconTile(Icons.Rounded.Lock, MaterialTheme.colorScheme.primary, size = 64.dp)
        Spacer(Modifier.height(16.dp))
        Text(if (confirmNew && first != null) "Confirm your PIN" else title, style = MaterialTheme.typography.headlineSmall)
        Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        Spacer(Modifier.height(20.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            repeat(maxOf(4, pin.length)) { i ->
                Box(Modifier.size(14.dp).clip(CircleShape).background(
                    if (i < pin.length) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
                ))
            }
        }
        Text(error ?: " ", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(8.dp))
        val keys = listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", "bio", "0", "del")
        keys.chunked(3).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(20.dp), modifier = Modifier.padding(vertical = 6.dp)) {
                row.forEach { k ->
                    Box(
                        Modifier.size(72.dp).clip(CircleShape)
                            .background(if (k == "bio" && !canBio) MaterialTheme.colorScheme.surface else MaterialTheme.colorScheme.surfaceContainerHigh)
                            .clickable(enabled = k != "bio" || canBio) {
                                when (k) {
                                    "del" -> pin = pin.dropLast(1)
                                    "bio" -> Biometrics.prompt(context, title) { onDone("") }
                                    else -> if (pin.length < 12) { pin += k; error = null; if (!confirmNew && pin.length >= 4 && verify(pin)) onDone(pin) }
                                }
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        when (k) {
                            "del" -> Icon(Icons.AutoMirrored.Rounded.Backspace, "Delete digit")
                            "bio" -> if (canBio) Icon(Icons.Rounded.Fingerprint, "Use fingerprint or device lock")
                            else -> Text(k, style = MaterialTheme.typography.headlineSmall)
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        Text(
            if (confirmNew) "Continue" else "Unlock",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.clip(CircleShape).clickable { submit() }.padding(horizontal = 24.dp, vertical = 12.dp),
        )
    }
}
