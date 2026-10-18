@file:OptIn(ExperimentalMaterial3Api::class)

package com.appfix.studio.ui.apk

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.appfix.core.apk.ApkEdits
import com.appfix.core.apk.ApkInspector
import com.appfix.core.apk.ApkModifier
import com.appfix.core.apk.ApkReport
import com.appfix.core.apk.ReplaceableImage
import com.appfix.core.util.formatBytes
import com.appfix.studio.signing.ApkSignatureVerifier
import com.appfix.studio.signing.ApkSigning
import com.appfix.studio.ui.appContainer
import com.appfix.studio.ui.components.BulletList
import com.appfix.studio.ui.components.ErrorCard
import com.appfix.studio.ui.components.InfoRow
import com.appfix.studio.ui.components.SectionCard
import com.appfix.studio.util.FileActions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.zip.ZipFile

@Composable
fun ApkModifyScreen(projectId: String, onBack: () -> Unit, onSignWithKey: (String) -> Unit) {
    val container = appContainer()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }
    val apk = remember(projectId) { container.storage.originalApk(projectId) }
    val report by produceState<ApkReport?>(null, projectId) { value = withContext(Dispatchers.IO) { container.projects.apkReport(projectId) } }
    val images by produceState<List<ReplaceableImage>>(emptyList(), apk) { value = withContext(Dispatchers.IO) { apk?.let { runCatching { ApkModifier.replaceableImages(it) }.getOrDefault(emptyList()) }.orEmpty() } }
    var label by remember { mutableStateOf("") }
    var versionName by remember { mutableStateOf("") }
    var versionCode by remember { mutableStateOf("") }
    val replacements = remember { mutableStateMapOf<String, ByteArray>() }
    var replacing by remember { mutableStateOf<ReplaceableImage?>(null) }
    var working by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var unsigned by remember { mutableStateOf<File?>(null) }
    var signed by remember { mutableStateOf<File?>(null) }
    var exportFile by remember { mutableStateOf<File?>(null) }

    LaunchedEffect(report) {
        report?.let { r ->
            if (label.isEmpty()) label = r.label.orEmpty()
            if (versionName.isEmpty()) versionName = r.manifest?.versionName.orEmpty()
            if (versionCode.isEmpty()) versionCode = r.manifest?.versionCode?.toString().orEmpty()
        }
    }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        val target = replacing
        replacing = null
        if (uri == null || target == null || apk == null) return@rememberLauncherForActivityResult
        scope.launch {
            val bytes = withContext(Dispatchers.Default) {
                runCatching {
                    val original = ZipFile(apk).use { z -> z.getInputStream(z.getEntry(target.path)).use { it.readBytes() } }
                    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    BitmapFactory.decodeByteArray(original, 0, original.size, bounds)
                    val picked = context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) } ?: throw IllegalStateException("Could not read the image")
                    val w = if (bounds.outWidth > 0) bounds.outWidth else picked.width
                    val h = if (bounds.outHeight > 0) bounds.outHeight else picked.height
                    encode(Bitmap.createScaledBitmap(picked, w, h, true), target.path.substringAfterLast('.').lowercase())
                }
            }
            bytes.onSuccess { replacements[target.path] = it }.onFailure { error = it.message }
        }
    }
    val exporter = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/vnd.android.package-archive")) { uri ->
        val f = exportFile
        if (uri != null && f != null) scope.launch { snackbar.showSnackbar(withContext(Dispatchers.IO) { runCatching { FileActions.exportTo(context, f, uri); "Saved ${f.name}" }.getOrElse { "Export failed: ${it.message}" } }) }
        exportFile = null
    }

    fun edits(r: ApkReport) = ApkEdits(
        versionName = versionName.trim().takeIf { it.isNotEmpty() && it != r.manifest?.versionName },
        versionCode = versionCode.trim().toLongOrNull()?.takeIf { it != r.manifest?.versionCode },
        label = label.trim().takeIf { it.isNotEmpty() && it != r.label },
        replacedFiles = replacements.toMap(),
    )

    fun build(sign: Boolean) {
        val r = report ?: return
        val input = apk ?: return
        working = true
        error = null
        scope.launch {
            try {
                val out = withContext(Dispatchers.Default) {
                    val dir = File(context.filesDir, "signed").apply { mkdirs() }
                    val base = (r.manifest?.packageName ?: "app") + "-modified"
                    val unsignedFile = File(dir, "$base-unsigned.apk")
                    ApkModifier.modify(input, unsignedFile, edits(r))
                    if (sign) {
                        val signedFile = File(dir, "$base-debug-signed.apk")
                        ApkSigning.sign(unsignedFile, signedFile, ApkSigning.debugKey(File(context.filesDir, "keystores-debug")), r.manifest?.minSdk ?: 21)
                        val check = ApkInspector.inspect(signedFile)
                        if (check.manifest == null) throw IllegalStateException("The rebuilt APK could not be read back")
                        unsignedFile to signedFile
                    } else unsignedFile to null
                }
                unsigned = out.first
                signed = out.second
                if (!sign) onSignWithKey(out.first.absolutePath)
            } catch (e: Exception) {
                error = e.message ?: e.javaClass.simpleName
            } finally {
                working = false
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Modify APK") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back") } },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        val r = report
        LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item {
                SectionCard("Before you change an APK") {
                    BulletList(listOf(
                        "Only modify apps you own or are allowed to change.",
                        "The original APK is kept unchanged; a modified copy is created and must be re-signed.",
                        "A re-signed app cannot update an installed copy signed with another key — uninstall that copy first.",
                        "Apps that verify their own signature or use server-side integrity checks may refuse to run.",
                    ))
                }
            }
            if (r == null || apk == null) {
                item { Text("Loading…") }
                return@LazyColumn
            }
            if (r.isSplitApk) {
                item { ErrorCard("This is a split APK. Split APKs cannot be modified or installed on their own.") }
                return@LazyColumn
            }
            item {
                SectionCard("Name and version", subtitle = "Edited directly in the binary manifest") {
                    OutlinedTextField(value = label, onValueChange = { label = it }, label = { Text("App name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = versionName, onValueChange = { versionName = it }, label = { Text("Version name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(
                        value = versionCode, onValueChange = { versionCode = it.filter(Char::isDigit).take(10) }, label = { Text("Version code") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth(),
                    )
                    Text("The new name is stored as text in the manifest, so translations of the old name are no longer used.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            item {
                SectionCard("Images", subtitle = "${images.size} replaceable PNG/WebP/JPEG files (same name and size)") {
                    if (images.isEmpty()) Text("No raster images were found. Vector and adaptive icons are compiled XML and cannot be swapped without Apktool.", style = MaterialTheme.typography.bodySmall)
                }
            }
            items(images.take(200), key = { it.path }) { img ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Thumbnail(apk, img.path, replacements[img.path])
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(img.resource, style = MaterialTheme.typography.titleSmall)
                        Text(img.path, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(if (img.path in replacements) "Replaced" else formatBytes(img.size), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (img.path in replacements) TextButton(onClick = { replacements.remove(img.path) }) { Text("Undo") }
                    else TextButton(onClick = { replacing = img; picker.launch(arrayOf("image/*")) }) { Text("Replace") }
                }
            }
            if (working) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
            error?.let { item { ErrorCard(it) } }
            item {
                val e = edits(r)
                val changed = e.label != null || e.versionName != null || e.versionCode != null || e.replacedFiles.isNotEmpty()
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { build(sign = true) }, enabled = changed && !working) { Text("Build & sign (debug key)") }
                    OutlinedButton(onClick = { build(sign = false) }, enabled = changed && !working) { Text("Sign with my key…") }
                }
            }
            signed?.let { f ->
                item {
                    val v = remember(f) { ApkSignatureVerifier.verify(f) }
                    SectionCard("Modified APK ready") {
                        InfoRow("File", "${f.name} · ${formatBytes(f.length())}")
                        InfoRow("Signature", if (v.verified) "Verified (debug key)" else "Not verified: ${v.errors.firstOrNull()}")
                        Spacer(Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            FilledTonalButton(onClick = {
                                if (!FileActions.canInstall(context)) FileActions.openInstallPermissionSettings(context)
                                else FileActions.install(context, f)?.let { m -> scope.launch { snackbar.showSnackbar(m) } }
                            }) { Text("Install") }
                            OutlinedButton(onClick = { FileActions.share(context, f) }) { Text("Share") }
                            OutlinedButton(onClick = { exportFile = f; exporter.launch(f.name) }) { Text("Export") }
                        }
                    }
                }
            }
            item {
                SectionCard("Needs a build worker (not available on the phone)") {
                    BulletList(listOf(
                        "Editing layouts, strings, styles or adding resources requires decoding and recompiling resources with Apktool.",
                        "Changing code requires Smali editing with Apktool; JADX output is for reading only and usually does not rebuild.",
                        "Use the original source project whenever possible — it is far more reliable than modifying a compiled APK.",
                    ))
                }
            }
        }
    }
}

@Composable
private fun Thumbnail(apk: File, path: String, replacement: ByteArray?) {
    val bmp by produceState<ImageBitmap?>(null, path, replacement) {
        value = withContext(Dispatchers.IO) {
            runCatching {
                val bytes = replacement ?: ZipFile(apk).use { z -> z.getInputStream(z.getEntry(path)).use { it.readBytes() } }
                val opts = BitmapFactory.Options().apply { inSampleSize = 1 }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)?.asImageBitmap()
            }.getOrNull()
        }
    }
    Box(Modifier.size(48.dp).background(MaterialTheme.colorScheme.surfaceContainer, RoundedCornerShape(8.dp)), contentAlignment = Alignment.Center) {
        val b = bmp
        if (b != null) Image(b, contentDescription = null, modifier = Modifier.size(44.dp)) else Icon(Icons.Outlined.Image, contentDescription = null)
    }
}

private fun encode(bitmap: Bitmap, ext: String): ByteArray {
    val out = ByteArrayOutputStream()
    val format = when (ext) {
        "jpg", "jpeg" -> Bitmap.CompressFormat.JPEG
        "webp" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) Bitmap.CompressFormat.WEBP_LOSSLESS else @Suppress("DEPRECATION") Bitmap.CompressFormat.WEBP
        else -> Bitmap.CompressFormat.PNG
    }
    bitmap.compress(format, if (format == Bitmap.CompressFormat.JPEG) 92 else 100, out)
    return out.toByteArray()
}
