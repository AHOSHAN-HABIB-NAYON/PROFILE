@file:OptIn(ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.details

import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.webtecit.filepilot.core.common.Formatters
import com.webtecit.filepilot.core.common.copyText
import com.webtecit.filepilot.core.designsystem.FileThumb
import com.webtecit.filepilot.core.designsystem.MonoStyle
import com.webtecit.filepilot.core.operations.HashAlgorithm

/** File and folder details: properties, location, folder size, media information and checksums. */
@Composable
fun DetailsSheet(id: String, onDismiss: () -> Unit) {
    val viewModel: DetailsViewModel = hiltViewModel(key = "details:$id")
    LaunchedEffect(id) { viewModel.load(id) }
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    fun copy(label: String, text: String) {
        copyText(context, label, text)
        Toast.makeText(context, "$label copied", Toast.LENGTH_SHORT).show()
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp)
                .navigationBarsPadding()
                .padding(bottom = 16.dp),
        ) {
            val item = state.item
            when {
                state.loading -> Box(Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                item == null -> Text(state.error ?: "Details aren't available.", style = MaterialTheme.typography.bodyLarge)
                else -> {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        FileThumb(item, size = 56.dp)
                        Spacer(Modifier.width(16.dp))
                        Text(item.name, style = MaterialTheme.typography.titleLarge, maxLines = 3, overflow = TextOverflow.Ellipsis)
                    }
                    Spacer(Modifier.height(16.dp))
                    PropertyRow("Location", state.location, onCopy = { copy("Path", state.location) })
                    if (item.isDirectory) {
                        val count = state.folderItems
                        val size = state.folderBytes
                        val text = if (count == null || size == null) "—"
                        else "${Formatters.count(count, "item")} · ${Formatters.size(size)}" + if (state.counting) " (counting…)" else ""
                        PropertyRow("Contents", text)
                    }
                    state.properties.forEach { (label, value) -> PropertyRow(label, value) }

                    if (!item.isDirectory) {
                        Spacer(Modifier.height(16.dp))
                        Text("Checksums", style = MaterialTheme.typography.titleMedium)
                        Text(
                            "Verify that a file is intact or identical to another copy.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.height(8.dp))
                        HashAlgorithm.entries.forEach { alg ->
                            val hs = state.hashes[alg]
                            Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(alg.label, style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f))
                                    when {
                                        hs?.running == true -> TextButton(onClick = { viewModel.cancelHash(alg) }) { Text("Cancel") }
                                        hs?.value != null -> IconButton(onClick = { copy(alg.label, hs.value) }) {
                                            Icon(Icons.Rounded.ContentCopy, contentDescription = "Copy ${alg.label}")
                                        }
                                        else -> OutlinedButton(onClick = { viewModel.computeHash(alg) }) { Text("Calculate") }
                                    }
                                }
                                when {
                                    hs?.running == true -> LinearProgressIndicator(
                                        progress = { hs.progress },
                                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                                    )
                                    hs?.value != null -> SelectionContainer { Text(hs.value, style = MonoStyle) }
                                    hs?.error != null -> Text(hs.error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                                }
                            }
                            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PropertyRow(label: String, value: String, onCopy: (() -> Unit)? = null) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(96.dp),
        )
        SelectionContainer(Modifier.weight(1f)) { Text(value, style = MaterialTheme.typography.bodyMedium) }
        if (onCopy != null) {
            IconButton(onClick = onCopy) { Icon(Icons.Rounded.ContentCopy, contentDescription = "Copy $label") }
        }
    }
}
