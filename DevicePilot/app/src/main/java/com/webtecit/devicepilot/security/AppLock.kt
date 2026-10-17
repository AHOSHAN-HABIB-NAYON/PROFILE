package com.webtecit.devicepilot.security

import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity

enum class LockAvailability { READY, NOT_ENROLLED, NO_HARDWARE, UNAVAILABLE }

/**
 * Fingerprint / face / device PIN-pattern-password unlock through Android's BiometricPrompt.
 * Nothing biometric is ever seen or stored by DevicePilot — Android only returns success or failure.
 */
object AppLock {
    const val AUTHENTICATORS = BIOMETRIC_WEAK or DEVICE_CREDENTIAL

    fun availability(context: Context): LockAvailability =
        when (BiometricManager.from(context).canAuthenticate(AUTHENTICATORS)) {
            BiometricManager.BIOMETRIC_SUCCESS -> LockAvailability.READY
            BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED -> LockAvailability.NOT_ENROLLED
            BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE -> LockAvailability.NO_HARDWARE
            else -> LockAvailability.UNAVAILABLE
        }

    fun enrollIntent(): Intent = if (Build.VERSION.SDK_INT >= 30) {
        Intent(Settings.ACTION_BIOMETRIC_ENROLL).putExtra(Settings.EXTRA_BIOMETRIC_AUTHENTICATORS_ALLOWED, AUTHENTICATORS)
    } else Intent(Settings.ACTION_SECURITY_SETTINGS)

    fun authenticate(
        activity: FragmentActivity,
        title: String,
        subtitle: String,
        onSuccess: () -> Unit,
        onFail: (String?) -> Unit = {},
    ) {
        if (availability(activity) != LockAvailability.READY) {
            onFail(null)
            return
        }
        val prompt = BiometricPrompt(activity, ContextCompat.getMainExecutor(activity),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) = onSuccess()
                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) = onFail(errString.toString())
            })
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
            .setAllowedAuthenticators(AUTHENTICATORS)
            .build()
        runCatching { prompt.authenticate(info) }.onFailure { onFail(it.message) }
    }
}
