@file:OptIn(ExperimentalMaterial3Api::class)

package com.appfix.studio.ui.build

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Verified
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.appfix.core.apk.ApkInspector
import com.appfix.core.signing.KeystoreException
import com.appfix.core.signing.KeystoreRequest
import com.appfix.core.signing.Keystores
import com.appfix.core.signing.SigningKey
import com.appfix.core.util.formatBytes
import com.appfix.studio.security.SecretStore
import com.appfix.studio.signing.ApkSignatureVerifier
import com.appfix.studio.signing.ApkSigning
import com.appfix.studio.signing.SignatureVerification
import com.appfix.studio.ui.appContainer
import com.appfix.studio.ui.components.BulletList
import com.appfix.studio.ui.components.ErrorCard
import com.appfix.studio.ui.components.InfoRow
import com.appfix.studio.ui.components.SectionCard
import com.appfix.studio.util.FileActions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

private const val DEBUG_KEY = "__debug__"

/** Signs an APK on this device with the AppFix debug key or a release keystore. */
@Composable
fun SigningScreen(initialApk: String?, onBack: () -> Unit) {
    val container = appContainer()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }
    val filesDir = context.filesDir
    val keystoreDir = File(filesDir, "keystores").apply { mkdirs() }
    val signedDir = File(filesDir, "signed").apply { mkdirs() }
    var input by remember { mutableStateOf(initialApk?.let(::File)?.takeIf { it.isFile && it.canonicalPath.startsWith(filesDir.canonicalPath) }) }
    var selected by remember { mutableStateOf(DEBUG_KEY) }
    var refresh by remember { mutableIntStateOf(0) }
    var working by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var result by remember { mutableStateOf<Pair<File, SignatureVerification>?>(null) }
    var showCreate by remember { mutableStateOf(false) }
    var passwordFor by remember { mutableStateOf<File?>(null) }
    var exportFile by remember { mutableStateOf<File?>(null) }
    val keystores by produceState(emptyList<File>(), refresh) { value = withContext(Dispatchers.IO) { keystoreDir.listFiles().orEmpty().filter { it.extension == "p12" }.sortedBy { it.name } } }
    val info by produceState<String?>(null, input) {
        value = input?.let { f -> withContext(Dispatchers.IO) { runCatching { ApkInspector.inspect(f).let { r -> "${r.manifest?.packageName} ${r.manifest?.versionName ?: ""} · ${formatBytes(f.length())} · ${r.signing.schemes.joinToString().ifEmpty { "unsigned" }}" } }.getOrElse { "Not a valid APK: ${it.message}" } } }
    }

    val apkPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) scope.launch {
            input = withContext(Dispatchers.IO) {
                val f = File(context.cacheDir, "to-sign/input.apk").apply { parentFile?.mkdirs() }
                context.contentResolver.openInputStream(uri)?.use { i -> f.outputStream().use { i.copyTo(it) } }
                f
            }
            result = null
        }
    }
    val keystoreImporter = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) scope.launch {
            val f = withContext(Dispatchers.IO) {
                var target = File(keystoreDir, "imported.p12")
                var i = 2
                while (target.exists()) target = File(keystoreDir, "imported-${i++}.p12")
                context.contentResolver.openInputStream(uri)?.use { s -> target.outputStream().use { s.copyTo(it) } }
                target
            }
            refresh++
            passwordFor = f
        }
    }
    val exporter = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) { uri ->
        val f = exportFile
        if (uri != null && f != null) scope.launch {
            snackbar.showSnackbar(withContext(Dispatchers.IO) { runCatching { FileActions.exportTo(context, f, uri); "Saved ${f.name}" }.getOrElse { "Export failed: ${it.message}" } })
        }
        exportFile = null
    }

    fun sign(key: SigningKey) {
        val apk = input ?: return
        working = true
        error = null
        scope.launch {
            try {
                result = withContext(Dispatchers.Default) {
                    val minSdk = runCatching { ApkInspector.inspect(apk).manifest?.minSdk }.getOrNull() ?: 21
                    val out = File(signedDir, apk.nameWithoutExtension.removeSuffix("-unsigned") + "-signed.apk")
                    ApkSigning.sign(apk, out, key, minSdk)
                    out to ApkSignatureVerifier.verify(out)
                }
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
                title = { Text("Sign APK") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back") } },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item {
                SectionCard("APK to sign", icon = Icons.Outlined.Verified) {
                    InfoRow("File", input?.name ?: "none")
                    info?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                    Spacer(Modifier.height(6.dp))
                    OutlinedButton(onClick = { apkPicker.launch(arrayOf("application/vnd.android.package-archive", "application/octet-stream")) }) { Text("Choose another APK") }
                }
            }
            item {
                SectionCard("Signing key", icon = Icons.Outlined.Key) {
                    KeyRow("AppFix debug key", "For testing on your own devices only. Not accepted by Google Play.", selected == DEBUG_KEY) { selected = DEBUG_KEY }
                    keystores.forEach { f -> KeyRow(f.nameWithoutExtension, "Release keystore (PKCS12)", selected == f.name) { selected = f.name } }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        TextButton(onClick = { showCreate = true }) { Text("Create keystore") }
                        TextButton(onClick = { keystoreImporter.launch(arrayOf("application/x-pkcs12", "application/octet-stream")) }) { Text("Import keystore") }
                    }
                    if (selected != DEBUG_KEY) {
                        val f = File(keystoreDir, selected)
                        TextButton(onClick = { exportFile = f; exporter.launch(f.name) }) { Text("Back up this keystore") }
                    }
                }
            }
            item {
                SectionCard("Important") {
                    BulletList(listOf(
                        "To update an app that is already installed or published, you must sign with the same key as before. A different key means it installs as a conflicting app or is rejected.",
                        "Keep a backup of release keystores and their passwords somewhere safe. If you lose them you cannot update your app.",
                        "Apps that check their own signature or integrity may stop working after re-signing.",
                    ))
                }
            }
            if (working) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
            error?.let { item { ErrorCard(it) } }
            item {
                Button(onClick = {
                    if (selected == DEBUG_KEY) {
                        working = true
                        scope.launch {
                            val key = withContext(Dispatchers.Default) { runCatching { ApkSigning.debugKey(File(filesDir, "keystores-debug")) } }
                            working = false
                            key.onSuccess(::sign).onFailure { error = it.message }
                        }
                    } else passwordFor = File(keystoreDir, selected)
                }, enabled = input != null && !working) { Text("Sign APK") }
            }
            result?.let { (file, v) ->
                item {
                    SectionCard(if (v.verified) "Signed and verified" else "Signature problem") {
                        InfoRow("File", "${file.name} · ${formatBytes(file.length())}")
                        InfoRow("Schemes", listOfNotNull("v1".takeIf { v.v1 }, "v2".takeIf { v.v2 }, "v3".takeIf { v.v3 }).joinToString())
                        v.certificates.firstOrNull()?.let { InfoRow("Certificate", it.subject); InfoRow("SHA-256", it.sha256, mono = true) }
                        Spacer(Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            FilledTonalButton(onClick = {
                                if (!FileActions.canInstall(context)) FileActions.openInstallPermissionSettings(context)
                                else FileActions.install(context, file)?.let { m -> scope.launch { snackbar.showSnackbar(m) } }
                            }) { Text("Install") }
                            OutlinedButton(onClick = { FileActions.share(context, file) }) { Text("Share") }
                            OutlinedButton(onClick = { exportFile = file; exporter.launch(file.name) }) { Text("Export") }
                        }
                    }
                }
            }
        }
    }

    if (showCreate) CreateKeystoreDialog(onDismiss = { showCreate = false }) { name, req, keep ->
        showCreate = false
        working = true
        scope.launch {
            try {
                val target = File(keystoreDir, "$name.p12")
                withContext(Dispatchers.Default) { Keystores.create(req, target) }
                if (keep) container.secrets.put(SecretStore.keystorePassword(target.name), String(req.storePassword))
                refresh++
                selected = target.name
                exportFile = target
                snackbar.showSnackbar("Keystore created. Save a backup copy now.")
                exporter.launch(target.name)
            } catch (e: KeystoreException) {
                error = e.message
            } finally {
                req.storePassword.fill('\u0000'); req.keyPassword.fill('\u0000')
                working = false
            }
        }
    }

    passwordFor?.let { f ->
        val saved = remember(f) { container.secrets.get(SecretStore.keystorePassword(f.name)) }
        PasswordDialog(f.nameWithoutExtension, saved, onDismiss = { passwordFor = null }) { pass, keep ->
            passwordFor = null
            working = true
            scope.launch {
                val key = withContext(Dispatchers.Default) { runCatching { Keystores.open(f, pass.toCharArray()) } }
                working = false
                key.onSuccess {
                    if (keep) container.secrets.put(SecretStore.keystorePassword(f.name), pass)
                    refresh++
                    selected = f.name
                    if (input != null) sign(it) else snackbar.showSnackbar("Keystore unlocked. Choose an APK to sign.")
                }.onFailure { error = it.message }
            }
        }
    }
}

@Composable
private fun KeyRow(title: String, subtitle: String, selected: Boolean, onSelect: () -> Unit) {
    Row(Modifier.fillMaxWidth().selectable(selected = selected, role = Role.RadioButton, onClick = onSelect).padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        RadioButton(selected = selected, onClick = null)
        Column(Modifier.padding(start = 8.dp)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun PasswordDialog(name: String, saved: String?, onDismiss: () -> Unit, onUnlock: (String, Boolean) -> Unit) {
    var pass by remember { mutableStateOf(saved.orEmpty()) }
    var savePassword by remember { mutableStateOf(saved != null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Unlock $name") },
        text = {
            Column {
                OutlinedTextField(value = pass, onValueChange = { pass = it }, label = { Text("Keystore password") }, singleLine = true,
                    visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
                Row(Modifier.toggleable(value = savePassword, role = Role.Checkbox) { savePassword = it }, verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = savePassword, onCheckedChange = null)
                    Text("Remember (encrypted with the Android Keystore)", modifier = Modifier.padding(start = 8.dp))
                }
            }
        },
        confirmButton = { Button(onClick = { onUnlock(pass, savePassword) }, enabled = pass.isNotEmpty()) { Text("Unlock") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun CreateKeystoreDialog(onDismiss: () -> Unit, onCreate: (String, KeystoreRequest, Boolean) -> Unit) {
    var file by remember { mutableStateOf("release") }
    var alias by remember { mutableStateOf("upload") }
    var cn by remember { mutableStateOf("") }
    var org by remember { mutableStateOf("") }
    var country by remember { mutableStateOf("") }
    var years by remember { mutableStateOf("30") }
    var pass by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var savePassword by remember { mutableStateOf(false) }
    val valid = file.matches(Regex("[a-z0-9_-]{1,40}")) && alias.isNotBlank() && cn.isNotBlank() && pass.length >= 8 && pass == confirm && years.toIntOrNull() in 1..100
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Create release keystore") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedTextField(value = file, onValueChange = { file = it.lowercase() }, label = { Text("File name") }, singleLine = true)
                OutlinedTextField(value = alias, onValueChange = { alias = it.trim() }, label = { Text("Key alias") }, singleLine = true)
                OutlinedTextField(value = cn, onValueChange = { cn = it }, label = { Text("Your name or company") }, singleLine = true)
                OutlinedTextField(value = org, onValueChange = { org = it }, label = { Text("Organisation (optional)") }, singleLine = true)
                OutlinedTextField(value = country, onValueChange = { country = it.take(2).uppercase() }, label = { Text("Country code (optional)") }, singleLine = true)
                OutlinedTextField(value = years, onValueChange = { years = it.filter(Char::isDigit).take(3) }, label = { Text("Valid for (years)") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                OutlinedTextField(value = pass, onValueChange = { pass = it }, label = { Text("Password (8+ characters)") }, singleLine = true, visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
                OutlinedTextField(value = confirm, onValueChange = { confirm = it }, label = { Text("Confirm password") }, singleLine = true, isError = confirm.isNotEmpty() && confirm != pass, visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
                Row(Modifier.toggleable(value = savePassword, role = Role.Checkbox) { savePassword = it }, verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = savePassword, onCheckedChange = null)
                    Text("Remember the password on this device", modifier = Modifier.padding(start = 8.dp))
                }
                Text("The same password protects the keystore and the key. You will be asked to save a backup copy.", style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = {
            Button(onClick = {
                onCreate(file, KeystoreRequest(alias, pass.toCharArray(), pass.toCharArray(), cn, org, country, years.toIntOrNull() ?: 30), savePassword)
            }, enabled = valid) { Text("Create keystore") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
