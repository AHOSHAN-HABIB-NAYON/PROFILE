package com.webtecit.nayon.feature.browser

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.view.CameraController
import androidx.camera.view.LifecycleCameraController
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.outlined.FlashOff
import androidx.compose.material.icons.outlined.FlashOn
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.webtecit.nayon.R
import java.io.File

/** Hands an image to Google Lens in the Google app — the entry point Google supports for other apps. */
object GoogleLens {
    const val GOOGLE_APP = "com.google.android.googlequicksearchbox"
    const val WEB = "https://lens.google.com"

    /** Returns false when the Google app is missing or refuses; the caller then opens Lens on the web. */
    fun search(context: Context, image: Uri): Boolean {
        val send = Intent(Intent.ACTION_SEND).setType("image/*").putExtra(Intent.EXTRA_STREAM, image)
            .setPackage(GOOGLE_APP)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        send.clipData = ClipData.newRawUri("", image)
        val pm = context.packageManager
        val targets = pm.queryIntentActivities(send, 0)
        // The Google app can offer several share targets; pick its Lens ("Search image") one.
        val lens = targets.firstOrNull {
            it.activityInfo.name.contains("lens", ignoreCase = true) ||
                it.loadLabel(pm).toString().contains("lens", ignoreCase = true) ||
                it.loadLabel(pm).toString().contains("search", ignoreCase = true)
        } ?: targets.firstOrNull()
        lens?.let { send.setClassName(it.activityInfo.packageName, it.activityInfo.name) }
        return try {
            context.grantUriPermission(GOOGLE_APP, image, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            context.startActivity(send)
            true
        } catch (e: ActivityNotFoundException) {
            false
        } catch (e: SecurityException) {
            false
        }
    }

    fun newPhotoFile(context: Context): File {
        val dir = File(context.cacheDir, "lens").apply { mkdirs() }
        // Old photos are only needed until Lens has read them.
        val cutoff = System.currentTimeMillis() - 60 * 60 * 1000L
        dir.listFiles()?.filter { it.lastModified() < cutoff }?.forEach { it.delete() }
        return File(dir, "lens_${System.currentTimeMillis()}.jpg")
    }

    fun uriFor(context: Context, file: File): Uri = FileProvider.getUriForFile(context, context.packageName + ".files", file)
}

/**
 * Full-screen Lens camera, like Chrome's: live viewfinder (tap to focus, pinch to zoom),
 * shutter, flash and gallery. The photo goes to Google Lens for results.
 */
@Composable
fun LensCamera(onClose: () -> Unit, onPhoto: (Uri) -> Unit, onGallery: () -> Unit) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var granted by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
    }
    val askCamera = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        granted = ok
        if (!ok) {
            Toast.makeText(context, R.string.lens_camera_denied, Toast.LENGTH_LONG).show()
            onGallery()
        }
    }
    LaunchedEffect(Unit) { if (!granted) askCamera.launch(Manifest.permission.CAMERA) }

    val controller = remember {
        LifecycleCameraController(context).apply {
            setEnabledUseCases(CameraController.IMAGE_CAPTURE)
            imageCaptureMode = ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY
        }
    }
    LaunchedEffect(granted) { if (granted) controller.bindToLifecycle(lifecycleOwner) }
    DisposableEffect(Unit) { onDispose { controller.unbind() } }

    var torch by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }

    fun capture() {
        if (busy || !granted) return
        busy = true
        val file = GoogleLens.newPhotoFile(context)
        controller.takePicture(
            ImageCapture.OutputFileOptions.Builder(file).build(),
            ContextCompat.getMainExecutor(context),
            object : ImageCapture.OnImageSavedCallback {
                override fun onImageSaved(output: ImageCapture.OutputFileResults) {
                    busy = false
                    onPhoto(GoogleLens.uriFor(context, file))
                }

                override fun onError(exception: ImageCaptureException) {
                    busy = false
                    Toast.makeText(context, R.string.lens_capture_failed, Toast.LENGTH_SHORT).show()
                }
            },
        )
    }

    Dialog(
        onDismissRequest = onClose,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            if (granted) {
                AndroidView(
                    factory = { ctx ->
                        PreviewView(ctx).apply {
                            scaleType = PreviewView.ScaleType.FILL_CENTER
                            this.controller = controller
                        }
                    },
                    modifier = Modifier.fillMaxSize(),
                )
            }
            ViewfinderFrame(Modifier.align(Alignment.Center).size(260.dp))

            // Top: close · Google Lens · flash
            Row(
                Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 8.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onClose) { Icon(Icons.Filled.Close, stringResource(R.string.action_close), tint = Color.White) }
                Row(Modifier.weight(1f), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                    Icon(painterResource(R.drawable.ic_google_lens), null, tint = Color.Unspecified, modifier = Modifier.size(22.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Google Lens", color = Color.White, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium)
                }
                IconButton(onClick = { torch = !torch; controller.enableTorch(torch) }) {
                    Icon(if (torch) Icons.Outlined.FlashOn else Icons.Outlined.FlashOff, stringResource(R.string.lens_flash), tint = Color.White)
                }
            }

            // Bottom: hint, gallery and shutter
            Column(
                Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().padding(bottom = 28.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    stringResource(R.string.lens_hint), color = Color.White, style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.clip(CircleShape).background(Color.Black.copy(alpha = 0.45f)).padding(horizontal = 16.dp, vertical = 8.dp),
                )
                Spacer(Modifier.height(24.dp))
                Box(Modifier.fillMaxWidth().height(80.dp)) {
                    Box(
                        Modifier.align(Alignment.CenterStart).padding(start = 40.dp).size(52.dp).clip(CircleShape)
                            .background(Color.White.copy(alpha = 0.18f)).clickable(onClick = onGallery),
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.Outlined.Image, stringResource(R.string.lens_gallery), tint = Color.White) }
                    Box(
                        Modifier.align(Alignment.Center).size(78.dp).clip(CircleShape).border(4.dp, Color.White, CircleShape)
                            .padding(7.dp).clip(CircleShape).background(Color.White).clickable(enabled = !busy, onClick = ::capture),
                        contentAlignment = Alignment.Center,
                    ) {
                        if (busy) CircularProgressIndicator(Modifier.size(28.dp), strokeWidth = 3.dp)
                        else Icon(painterResource(R.drawable.ic_google_lens), stringResource(R.string.lens_search), tint = Color.Unspecified, modifier = Modifier.size(30.dp))
                    }
                }
            }
        }
    }
}

/** Four white rounded corners, the Lens viewfinder. */
@Composable
private fun ViewfinderFrame(modifier: Modifier) {
    Canvas(modifier) {
        val stroke = 4.dp.toPx()
        val arm = size.minDimension * 0.18f
        val r = 22.dp.toPx()
        val c = Color.White
        fun corner(x: Float, y: Float, dx: Float, dy: Float) {
            // Each corner: a quarter-circle arc with two short arms.
            val left = if (dx > 0) x else x - 2 * r
            val top = if (dy > 0) y else y - 2 * r
            val start = when {
                dx > 0 && dy > 0 -> 180f
                dx < 0 && dy > 0 -> 270f
                dx < 0 && dy < 0 -> 0f
                else -> 90f
            }
            drawArc(c, start, 90f, false, Offset(left, top), Size(2 * r, 2 * r), style = Stroke(stroke, cap = StrokeCap.Round))
            drawLine(c, Offset(x + dx * r, y), Offset(x + dx * (r + arm), y), stroke, StrokeCap.Round)
            drawLine(c, Offset(x, y + dy * r), Offset(x, y + dy * (r + arm)), stroke, StrokeCap.Round)
        }
        corner(0f, 0f, 1f, 1f)
        corner(size.width, 0f, -1f, 1f)
        corner(size.width, size.height, -1f, -1f)
        corner(0f, size.height, 1f, -1f)
    }
}
