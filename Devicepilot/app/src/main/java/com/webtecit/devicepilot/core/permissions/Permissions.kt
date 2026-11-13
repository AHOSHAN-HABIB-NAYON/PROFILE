package com.webtecit.devicepilot.core.permissions

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner

enum class PermissionStatus { GRANTED, DENIED, PERMANENTLY_DENIED }

object Permissions {
    fun isGranted(context: Context, permission: String): Boolean =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    fun anyGranted(context: Context, permissions: Array<String>): Boolean = permissions.any { isGranted(context, it) }

    val notificationPermission: String? =
        if (Build.VERSION.SDK_INT >= 33) Manifest.permission.POST_NOTIFICATIONS else null
}

fun Context.findActivity(): Activity? {
    var ctx = this
    while (ctx is ContextWrapper) {
        if (ctx is Activity) return ctx
        ctx = ctx.baseContext
    }
    return null
}

/**
 * Compose state for a group of runtime permissions. It refreshes when the screen resumes, so
 * changes made in system settings are picked up, and detects "Don't ask again".
 */
class PermissionGroupState(
    private val context: Context,
    val permissions: Array<String>,
    private val launch: () -> Unit,
) {
    var status by mutableStateOf(compute(false))
        internal set
    internal var requestedOnce = false

    val granted: Boolean get() = status == PermissionStatus.GRANTED

    fun request() {
        requestedOnce = true
        launch()
    }

    internal fun refresh() {
        status = compute(requestedOnce)
    }

    private fun compute(asked: Boolean): PermissionStatus {
        if (permissions.isEmpty() || Permissions.anyGranted(context, permissions)) return PermissionStatus.GRANTED
        val activity = context.findActivity() ?: return PermissionStatus.DENIED
        val canAsk = permissions.any { ActivityCompat.shouldShowRequestPermissionRationale(activity, it) }
        return if (asked && !canAsk) PermissionStatus.PERMANENTLY_DENIED else PermissionStatus.DENIED
    }
}

@Composable
fun rememberPermissionGroup(permissions: Array<String>, onResult: (Boolean) -> Unit = {}): PermissionGroupState {
    val context = LocalContext.current
    var holder: PermissionGroupState? = null
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        holder?.refresh()
        onResult(result.values.any { it })
    }
    val state = remember(permissions.joinToString()) {
        PermissionGroupState(context, permissions) { launcher.launch(permissions) }
    }
    holder = state

    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, state) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_RESUME) state.refresh() }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    return state
}

/** Re-runs [check] every time the screen resumes (for special access like usage stats). */
@Composable
fun <T> rememberOnResumeCheck(check: () -> T): T {
    var value by remember { mutableStateOf(check()) }
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_RESUME) value = check() }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    return value
}
