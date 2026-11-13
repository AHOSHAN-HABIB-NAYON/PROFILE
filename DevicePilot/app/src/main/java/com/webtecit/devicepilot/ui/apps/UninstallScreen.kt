package com.webtecit.devicepilot.ui.apps

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.webtecit.devicepilot.R
import com.webtecit.devicepilot.ui.common.AppIcon
import com.webtecit.devicepilot.ui.common.DpCard
import com.webtecit.devicepilot.ui.common.HeroCard
import com.webtecit.devicepilot.ui.common.Level
import com.webtecit.devicepilot.ui.common.LocalContainer
import com.webtecit.devicepilot.ui.common.ScreenList
import com.webtecit.devicepilot.ui.common.StatusPill

/**
 * Multi-select uninstall. Each app still goes through Android's own confirmation,
 * one at a time — there is no silent or bulk removal.
 */
@Composable
fun UninstallScreen() {
    val c = LocalContainer.current
    val vm: AppsViewModel = viewModel(key = "uninstall") { AppsViewModel(c) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { vm.setFilter(AppFilter.USER) }

    val selected = remember { mutableStateListOf<String>() }
    val results = remember { mutableStateMapOf<String, UninstallOutcome>() }
    val queue = remember { mutableStateListOf<String>() }
    var running by remember { mutableStateOf(false) }
    var review by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    val labels = ui.rows.associate { it.app.packageName to it.app.label }

    val uninstall = rememberUninstaller { pkg, outcome ->
        results[pkg] = outcome
        queue.remove(pkg)
        selected.remove(pkg)
        if (queue.isEmpty()) running = false
    }
    // Process the queue one confirmation screen at a time.
    LaunchedEffect(running, queue.size) {
        if (running && queue.isNotEmpty()) uninstall(queue.first())
    }

    val ownPkg = androidx.compose.ui.platform.LocalContext.current.packageName
    val candidates = ui.rows.filter { it.app.isUserApp && it.app.packageName != ownPkg }
        .filter { query.isBlank() || it.app.label.contains(query, true) || it.app.packageName.contains(query, true) }

    ScreenList {
        item { HeroCard(R.drawable.ill_apps, stringResource(R.string.uninstall_hero_title), stringResource(R.string.uninstall_hero_text)) }
        if (results.isNotEmpty()) item {
            DpCard {
                Text(stringResource(R.string.uninstall_results), style = MaterialTheme.typography.titleSmall)
                results.forEach { (pkg, o) ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(labels[pkg] ?: pkg, Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        StatusPill(
                            stringResource(when (o) {
                                UninstallOutcome.REMOVED -> R.string.outcome_removed
                                UninstallOutcome.NOT_REMOVED -> R.string.outcome_kept
                                UninstallOutcome.UNAVAILABLE -> R.string.outcome_unavailable
                            }),
                            when (o) { UninstallOutcome.REMOVED -> Level.GOOD; UninstallOutcome.NOT_REMOVED -> Level.NEUTRAL; else -> Level.BAD },
                        )
                    }
                }
                TextButton(onClick = { results.clear() }) { Text(stringResource(R.string.action_clear)) }
            }
        }
        item {
            OutlinedTextField(query, { query = it }, Modifier.fillMaxWidth(), singleLine = true,
                label = { Text(stringResource(R.string.apps_search)) }, shape = MaterialTheme.shapes.small)
        }
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.uninstall_selected, selected.size), Modifier.weight(1f),
                    style = MaterialTheme.typography.bodyMedium)
                Button(
                    enabled = selected.isNotEmpty() || running,
                    onClick = { if (running) { running = false; queue.clear() } else review = true },
                ) {
                    Text(stringResource(if (running) R.string.action_stop else R.string.uninstall_review))
                }
            }
            if (ui.loading || running) LinearProgressIndicator(Modifier.fillMaxWidth().padding(top = 8.dp))
        }
        items(candidates, key = { it.app.packageName }) { row ->
            val pkg = row.app.packageName
            val checked = pkg in selected
            Surface(
                onClick = { if (checked) selected.remove(pkg) else selected.add(pkg) },
                shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.surface,
                border = androidx.compose.foundation.BorderStroke(1.dp,
                    if (checked) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant),
            ) {
                Row(Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked, onCheckedChange = { if (it) selected.add(pkg) else selected.remove(pkg) })
                    AppIcon(pkg, 36.dp)
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(row.app.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(pkg, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
    }

    if (review) {
        AlertDialog(
            onDismissRequest = { review = false },
            title = { Text(stringResource(R.string.uninstall_review_title, selected.size)) },
            text = {
                Column {
                    Text(stringResource(R.string.uninstall_review_text), style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(8.dp))
                    selected.take(12).forEach { Text("• " + (labels[it] ?: it), style = MaterialTheme.typography.bodyMedium) }
                    if (selected.size > 12) Text("…")
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    review = false
                    queue.clear(); queue.addAll(selected)
                    running = true
                }) { Text(stringResource(R.string.action_start), color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { review = false }) { Text(stringResource(R.string.action_cancel)) } },
        )
    }
}
