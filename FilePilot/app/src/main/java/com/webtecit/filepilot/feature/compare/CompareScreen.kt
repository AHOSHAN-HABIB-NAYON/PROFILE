@file:OptIn(ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.compare

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Compare
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.webtecit.filepilot.core.common.Formatters
import com.webtecit.filepilot.core.common.IoDispatcher
import com.webtecit.filepilot.core.designsystem.AppCard
import com.webtecit.filepilot.core.designsystem.IconTile
import com.webtecit.filepilot.core.designsystem.LocalDarkTheme
import com.webtecit.filepilot.core.designsystem.MonoStyle
import com.webtecit.filepilot.core.operations.Checksums
import com.webtecit.filepilot.core.operations.DiffResult
import com.webtecit.filepilot.core.operations.DiffType
import com.webtecit.filepilot.core.operations.HashAlgorithm
import com.webtecit.filepilot.core.operations.LineDiff
import com.webtecit.filepilot.core.storage.FileItem
import com.webtecit.filepilot.core.storage.FileSystems
import com.webtecit.filepilot.core.storage.FileTypes
import com.webtecit.filepilot.core.storage.userMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class CompareState(
    val loading: Boolean = true,
    val error: String? = null,
    val left: FileItem? = null,
    val right: FileItem? = null,
    val identical: Boolean? = null,
    val leftHash: String? = null,
    val rightHash: String? = null,
    val diff: DiffResult? = null,
    /** Why no line comparison is shown, if it isn't. */
    val diffNote: String? = null,
)

@HiltViewModel
class CompareViewModel @Inject constructor(
    private val fileSystems: FileSystems,
    @IoDispatcher private val io: CoroutineDispatcher,
) : ViewModel() {
    private val _state = MutableStateFlow(CompareState())
    val state = _state.asStateFlow()
    private var started = false

    fun start(firstId: String, secondId: String) {
        if (started) return
        started = true
        viewModelScope.launch {
            try {
                val left = fileSystems.of(firstId).stat(firstId)
                val right = fileSystems.of(secondId).stat(secondId)
                if (left == null || right == null) {
                    _state.value = CompareState(loading = false, error = "One of the files no longer exists.")
                    return@launch
                }
                _state.value = CompareState(loading = true, left = left, right = right)
                val leftHash = async(io) { Checksums.compute(fileSystems.of(left.id).openInput(left.id), HashAlgorithm.SHA256) }
                val rightHash = async(io) { Checksums.compute(fileSystems.of(right.id).openInput(right.id), HashAlgorithm.SHA256) }
                val lh = leftHash.await()
                val rh = rightHash.await()
                val textual = isText(left) && isText(right)
                var diff: DiffResult? = null
                var note: String? = null
                when {
                    lh == rh -> note = null
                    !textual -> note = "These are not text files, so only their checksums are compared."
                    left.size > MAX_TEXT || right.size > MAX_TEXT -> note = "Files larger than 2 MB are compared by checksum only."
                    else -> {
                        diff = withContext(io) {
                            LineDiff.diff(readLines(left), readLines(right))
                        }
                        if (diff == null) note = "The files are too different to show line by line."
                    }
                }
                _state.value = CompareState(
                    loading = false, left = left, right = right, identical = lh == rh,
                    leftHash = lh, rightHash = rh, diff = diff, diffNote = note,
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(loading = false, error = e.userMessage())
            }
        }
    }

    private suspend fun isText(item: FileItem): Boolean {
        if (FileTypes.isTextLike(item.name)) return true
        return withContext(io) {
            runCatching {
                fileSystems.of(item.id).openInput(item.id).use { input ->
                    val buffer = ByteArray(8192)
                    val read = input.read(buffer)
                    read <= 0 || (0 until read).none { buffer[it] == 0.toByte() }
                }
            }.getOrDefault(false)
        }
    }

    private fun readLines(item: FileItem): List<String> =
        fileSystems.of(item.id).openInput(item.id).bufferedReader(Charsets.UTF_8).use { it.readLines() }

    private companion object {
        const val MAX_TEXT = 2_000_000L
    }
}

@Composable
fun CompareScreen(firstId: String, secondId: String, onBack: () -> Unit, viewModel: CompareViewModel = hiltViewModel()) {
    LaunchedEffect(firstId, secondId) { viewModel.start(firstId, secondId) }
    val state by viewModel.state.collectAsStateWithLifecycle()
    var changesOnly by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Compare files") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back") } },
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(bottom = 24.dp),
        ) {
            item {
                Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    state.left?.let { FileSummary("A", it, state.leftHash) }
                    state.right?.let { FileSummary("B", it, state.rightHash) }
                    when {
                        state.error != null -> Text(state.error!!, color = MaterialTheme.colorScheme.error)
                        state.loading -> Row(verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(Modifier.padding(4.dp))
                            Spacer(Modifier.width(12.dp))
                            Text("Comparing…")
                        }
                        else -> Verdict(state)
                    }
                    val diff = state.diff
                    if (diff != null && !diff.identical) {
                        FilterChip(selected = changesOnly, onClick = { changesOnly = !changesOnly }, label = { Text("Show changes only") })
                    }
                }
                Spacer(Modifier.height(8.dp))
            }
            val diff = state.diff
            if (diff != null && !diff.identical) {
                val lines = if (changesOnly) diff.lines.filter { it.type != DiffType.EQUAL } else diff.lines
                itemsIndexed(lines) { _, line -> DiffRow(line.type, line.leftNumber, line.rightNumber, line.text) }
            }
        }
    }
}

@Composable
private fun FileSummary(tag: String, item: FileItem, hash: String?) {
    AppCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(tag, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(item.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    "${Formatters.size(item.size)} · ${Formatters.date(item.lastModified)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (hash != null) Text("SHA-256 ${hash.take(16)}…", style = MonoStyle, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun Verdict(state: CompareState) {
    val identical = state.identical == true
    AppCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconTile(
                if (identical) Icons.Rounded.CheckCircle else Icons.Rounded.Compare,
                if (identical) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.error,
            )
            Spacer(Modifier.width(14.dp))
            Column {
                Text(if (identical) "The files are identical" else "The files are different", style = MaterialTheme.typography.titleMedium)
                val diff = state.diff
                val detail = when {
                    identical -> "Their content is byte-for-byte the same (SHA-256 match)."
                    diff != null -> "${diff.added} lines added, ${diff.removed} lines removed (A → B)."
                    else -> state.diffNote ?: ""
                }
                Text(detail, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (!identical && diff != null && state.diffNote != null) Text(state.diffNote, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun DiffRow(type: DiffType, left: Int?, right: Int?, text: String) {
    val dark = LocalDarkTheme.current
    val bg = when (type) {
        DiffType.ADDED -> if (dark) Color(0xFF0F3D2A) else Color(0xFFE6F6EC)
        DiffType.REMOVED -> if (dark) Color(0xFF4A1D1D) else Color(0xFFFDECEC)
        DiffType.EQUAL -> Color.Transparent
    }
    val sign = when (type) {
        DiffType.ADDED -> "+"
        DiffType.REMOVED -> "−"
        DiffType.EQUAL -> " "
    }
    Row(Modifier.fillMaxWidth().background(bg).padding(horizontal = 8.dp, vertical = 1.dp)) {
        Text(left?.toString() ?: "", style = MonoStyle, color = MaterialTheme.colorScheme.outline, modifier = Modifier.width(40.dp))
        Text(right?.toString() ?: "", style = MonoStyle, color = MaterialTheme.colorScheme.outline, modifier = Modifier.width(40.dp))
        Text(sign, style = MonoStyle, modifier = Modifier.width(14.dp))
        Text(text, style = MonoStyle, softWrap = false, modifier = Modifier.horizontalScroll(rememberScrollState()))
    }
}
