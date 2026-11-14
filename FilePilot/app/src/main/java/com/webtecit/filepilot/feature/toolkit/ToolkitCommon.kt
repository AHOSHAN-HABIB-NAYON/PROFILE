@file:OptIn(ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.toolkit

import android.content.Context
import android.net.Uri
import android.os.Environment
import android.provider.OpenableColumns
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
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
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.lifecycle.ViewModel
import com.webtecit.filepilot.core.common.ApplicationScope
import com.webtecit.filepilot.core.common.Formatters
import com.webtecit.filepilot.core.designsystem.Feedback
import com.webtecit.filepilot.core.storage.FileIntents
import com.webtecit.filepilot.core.storage.FileTypes
import com.webtecit.filepilot.core.tasks.BackgroundTasks
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Where the tools save their results. */
object ToolOutput {
    fun documents(): File = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS), "FilePilot").apply { mkdirs() }
    fun pictures(): File = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "FilePilot").apply { mkdirs() }
}

data class ToolRun(
    val running: Boolean = false,
    val progress: Float? = null,
    val detail: String = "",
    val output: List<File> = emptyList(),
    val error: String? = null,
)

/**
 * Runs a tool's job in the app scope, so it finishes even if the user leaves the screen, with
 * progress on Home and in the notification, then shows the Saved animation.
 */
@HiltViewModel
class ToolkitViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val tasks: BackgroundTasks,
    @ApplicationScope private val appScope: CoroutineScope,
) : ViewModel() {
    private val _run = MutableStateFlow(ToolRun())
    val run: StateFlow<ToolRun> = _run.asStateFlow()

    fun reset() { _run.value = ToolRun() }

    /** [block] returns the files it wrote; it reports progress with (fraction or null, detail). */
    fun start(title: String, savedTitle: String, block: suspend (report: (Float?, String) -> Unit) -> List<File>) {
        if (_run.value.running) return
        _run.value = ToolRun(running = true, detail = "Starting…")
        appScope.launch {
            val id = tasks.start(title, "Starting…", coroutineContext[kotlinx.coroutines.Job])
            val result = runCatching {
                withContext(Dispatchers.IO) {
                    block { p, d ->
                        tasks.update(title, d, p)
                        _run.value = _run.value.copy(progress = p, detail = d)
                    }
                }
            }
            result.onSuccess { files ->
                val size = files.sumOf { it.length() }
                tasks.finish(id, if (files.isEmpty()) "Done" else "Saved ${files.size} file${if (files.size == 1) "" else "s"}")
                _run.value = ToolRun(output = files, detail = "")
                if (files.size == 1) {
                    Feedback.saved(savedTitle, "${files[0].parentFile?.name.orEmpty()} · ${Formatters.size(size)}", file = files[0])
                } else {
                    Feedback.saved(savedTitle, if (files.isEmpty()) "" else "${files.size} files · ${Formatters.size(size)}")
                }
            }.onFailure { e ->
                tasks.dismiss(id)
                if (e is kotlinx.coroutines.CancellationException) {
                    _run.value = ToolRun()
                } else {
                    _run.value = ToolRun(error = e.message ?: "Something went wrong.")
                }
            }
        }
    }

    fun nameOf(uri: Uri): String = displayName(context, uri)
}

fun displayName(context: Context, uri: Uri): String =
    runCatching {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        }
    }.getOrNull() ?: uri.lastPathSegment?.substringAfterLast('/') ?: "file"

fun sizeOf(context: Context, uri: Uri): Long =
    runCatching {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { c ->
            if (c.moveToFirst() && !c.isNull(0)) c.getLong(0) else 0L
        }
    }.getOrNull() ?: 0L

/** Standard frame for a tool: title, scrolling body, and the main action at the bottom. */
@Composable
fun ToolScaffold(
    title: String,
    onBack: () -> Unit,
    run: ToolRun,
    actionLabel: String,
    actionIcon: ImageVector,
    actionEnabled: Boolean,
    onAction: () -> Unit,
    onOpenFolder: (String) -> Unit,
    content: @Composable ColumnScope.() -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
            )
        },
        bottomBar = {
            Surface(color = MaterialTheme.colorScheme.surface, shadowElevation = 8.dp) {
                Column(Modifier.fillMaxWidth().navigationBarsPadding().imePadding().padding(16.dp)) {
                    if (run.running) {
                        val p = run.progress
                        if (p != null) LinearProgressIndicator(progress = { p }, modifier = Modifier.fillMaxWidth().clip(CircleShape))
                        else LinearProgressIndicator(Modifier.fillMaxWidth().clip(CircleShape))
                        Spacer(Modifier.height(6.dp))
                        Text(run.detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Spacer(Modifier.height(8.dp))
                    }
                    Button(
                        onClick = onAction,
                        enabled = actionEnabled && !run.running,
                        shape = RoundedCornerShape(16.dp),
                        modifier = Modifier.fillMaxWidth().height(52.dp).testTag("tool_action"),
                    ) {
                        Icon(actionIcon, null, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(if (run.running) "Working…" else actionLabel, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        },
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            content()
            run.error?.let {
                Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.errorContainer) {
                    Text(it, color = MaterialTheme.colorScheme.onErrorContainer, modifier = Modifier.fillMaxWidth().padding(12.dp))
                }
            }
            if (run.output.isNotEmpty()) ResultCard(run.output, onOpenFolder)
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
private fun ResultCard(files: List<File>, onOpenFolder: (String) -> Unit) {
    val context = LocalContext.current
    Surface(
        shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.2f)),
    ) {
        Column(Modifier.fillMaxWidth().padding(14.dp)) {
            Text("Saved", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Text(
                if (files.size == 1) files[0].absolutePath else "${files.size} files in ${files[0].parent}",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { files[0].parent?.let(onOpenFolder) }) {
                    Icon(Icons.Rounded.FolderOpen, null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Show")
                }
                OutlinedButton(onClick = {
                    val uris = files.map { FileProvider.getUriForFile(context, "${context.packageName}.files", it) }
                    FileIntents.share(context, uris, files.map { FileTypes.mimeOf(it.name) })
                }) {
                    Icon(Icons.Rounded.Share, null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Share")
                }
            }
        }
    }
}

/** A titled white card used to group a tool's options. */
@Composable
fun OptionCard(title: String, content: @Composable ColumnScope.() -> Unit) {
    Surface(
        shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f)),
    ) {
        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            content()
        }
    }
}

/** Big dashed "pick files" area shown before anything is chosen. */
@Composable
fun PickArea(label: String, hint: String, icon: ImageVector, onPick: () -> Unit) {
    Surface(
        onClick = onPick,
        shape = RoundedCornerShape(20.dp),
        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.06f),
        border = BorderStroke(1.5.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.35f)),
        modifier = Modifier.fillMaxWidth().height(150.dp).testTag("pick_files"),
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Box(Modifier.size(54.dp).clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) {
                Icon(icon, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(30.dp))
            }
            Spacer(Modifier.height(10.dp))
            Text(label, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Text(hint, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

