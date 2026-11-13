package com.webtecit.devicepilot.feature.appmanager

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Apps
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.webtecit.devicepilot.core.common.Formatters
import com.webtecit.devicepilot.core.common.Reading
import com.webtecit.devicepilot.core.common.SystemIntents
import com.webtecit.devicepilot.core.designsystem.DpCard
import com.webtecit.devicepilot.core.designsystem.DpScaffold
import com.webtecit.devicepilot.core.designsystem.EmptyState
import com.webtecit.devicepilot.core.designsystem.IconBadge
import com.webtecit.devicepilot.core.designsystem.InfoRow
import com.webtecit.devicepilot.core.designsystem.LoadingState
import com.webtecit.devicepilot.core.designsystem.MessageState
import com.webtecit.devicepilot.core.designsystem.NoteText
import com.webtecit.devicepilot.core.designsystem.ReadingRow
import com.webtecit.devicepilot.core.designsystem.SectionHeader
import com.webtecit.devicepilot.core.designsystem.Spacing
import com.webtecit.devicepilot.core.designsystem.StatusChip
import com.webtecit.devicepilot.core.designsystem.Tone
import com.webtecit.devicepilot.core.navigation.Routes
import com.webtecit.devicepilot.core.permissions.rememberOnResumeCheck
import com.webtecit.devicepilot.data.repository.AppsRepository
import com.webtecit.devicepilot.domain.model.AppEntry
import com.webtecit.devicepilot.domain.model.AppPermission
import com.webtecit.devicepilot.domain.model.AppSize
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

enum class AppFilter(val label: String) { USER("Installed"), SYSTEM("System"), ALL("All") }
enum class AppSort(val label: String) { NAME("Name"), UPDATED("Recently updated"), SIZE("Size") }

@HiltViewModel
class AppsViewModel @Inject constructor(val repo: AppsRepository) : ViewModel() {
    private val _apps = MutableStateFlow<List<AppEntry>?>(null)
    val apps: StateFlow<List<AppEntry>?> = _apps.asStateFlow()
    private val _sizes = MutableStateFlow<Map<String, AppSize>>(emptyMap())
    val sizes: StateFlow<Map<String, AppSize>> = _sizes.asStateFlow()

    fun load() {
        viewModelScope.launch {
            val list = repo.launchableApps()
            _apps.value = list
            if (repo.hasUsageAccess()) {
                val map = HashMap<String, AppSize>()
                list.forEach { a -> repo.size(a.packageName).valueOrNull?.let { map[a.packageName] = it } }
                _sizes.value = map
            }
        }
    }

    suspend fun icon(pkg: String, px: Int): Bitmap? = withContext(Dispatchers.IO) { repo.icon(pkg, px) }
}

@Composable
fun AppIcon(pkg: String, size: Dp, loader: suspend (String, Int) -> Bitmap?) {
    val px = with(LocalDensity.current) { size.roundToPx() }
    val bmp by produceState<Bitmap?>(null, pkg) { value = loader(pkg, px) }
    bmp?.let { Image(it.asImageBitmap(), contentDescription = null, modifier = Modifier.size(size)) }
        ?: IconBadge(Icons.Default.Apps, MaterialTheme.colorScheme.onSurfaceVariant, size)
}

@Composable
fun AppsScreen(onBack: () -> Unit, navigate: (String) -> Unit, viewModel: AppsViewModel = hiltViewModel()) {
    val apps by viewModel.apps.collectAsStateWithLifecycle()
    val sizes by viewModel.sizes.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val usage = rememberOnResumeCheck { viewModel.repo.hasUsageAccess() }
    var query by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableStateOf(AppFilter.USER) }
    var sort by rememberSaveable { mutableStateOf(AppSort.NAME) }
    LaunchedEffect(usage) { viewModel.load() }

    DpScaffold("App Manager", onBack) { padding ->
        val list = apps
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = Spacing.lg, end = Spacing.lg, top = padding.calculateTopPadding() + Spacing.sm, bottom = Spacing.xxl),
            verticalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            item {
                OutlinedTextField(
                    value = query, onValueChange = { query = it },
                    label = { Text("Search apps") },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                    singleLine = true, modifier = Modifier.fillMaxWidth(),
                )
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    AppFilter.entries.forEach { f -> FilterChip(filter == f, { filter = f }, label = { Text(f.label) }) }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    AppSort.entries.filter { it != AppSort.SIZE || usage }.forEach { s -> FilterChip(sort == s, { sort = s }, label = { Text(s.label) }) }
                }
            }
            if (!usage) {
                item {
                    DpCard {
                        Text("See app sizes", style = MaterialTheme.typography.titleSmall)
                        NoteText("Turn on Usage access for Devicepilot to show how much storage each app uses. This is optional.")
                        Spacer(Modifier.height(Spacing.xs))
                        OutlinedButton(onClick = { SystemIntents.usageAccess(context) }) { Text("Open Usage access") }
                    }
                }
            }
            if (list == null) {
                item { LoadingState("Loading apps…") }
            } else {
                val shown = list
                    .filter { a -> when (filter) { AppFilter.USER -> !a.isSystem; AppFilter.SYSTEM -> a.isSystem; AppFilter.ALL -> true } }
                    .filter { a -> query.isBlank() || a.label.contains(query, true) || a.packageName.contains(query, true) }
                    .let { l ->
                        when (sort) {
                            AppSort.NAME -> l.sortedBy { it.label.lowercase() }
                            AppSort.UPDATED -> l.sortedByDescending { it.lastUpdateTime }
                            AppSort.SIZE -> l.sortedByDescending { sizes[it.packageName]?.totalBytes ?: 0 }
                        }
                    }
                item { NoteText("${shown.size} apps with a launcher icon") }
                if (shown.isEmpty()) item { EmptyState("No apps found", "Try another search or filter.") }
                items(shown, key = { it.packageName }) { a ->
                    DpCard(onClick = { navigate(Routes.appDetail(a.packageName)) }, contentPadding = PaddingValues(Spacing.md)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            AppIcon(a.packageName, 40.dp, viewModel::icon)
                            Spacer(Modifier.width(Spacing.md))
                            Column(Modifier.weight(1f)) {
                                Text(a.label, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text("${a.versionName ?: "—"} · ${a.packageName}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                            sizes[a.packageName]?.let { Text(Formatters.bytes(it.totalBytes), style = MaterialTheme.typography.labelLarge) }
                        }
                    }
                }
            }
        }
    }
}

// ------------------------------------------------------------------------------------ detail

@HiltViewModel
class AppDetailViewModel @Inject constructor(val repo: AppsRepository) : ViewModel() {
    val entry = MutableStateFlow<AppEntry?>(null)
    val missing = MutableStateFlow(false)
    val size = MutableStateFlow<Reading<AppSize>?>(null)
    val permissions = MutableStateFlow<List<AppPermission>>(emptyList())

    fun load(pkg: String) {
        viewModelScope.launch {
            val e = withContext(Dispatchers.IO) { repo.entry(pkg) }
            entry.value = e
            missing.value = e == null
            if (e != null) {
                permissions.value = withContext(Dispatchers.IO) { repo.permissions(pkg) }
                size.value = repo.size(pkg)
            }
        }
    }

    suspend fun icon(pkg: String, px: Int): Bitmap? = withContext(Dispatchers.IO) { repo.icon(pkg, px) }
}

@Composable
fun AppDetailScreen(pkg: String, onBack: () -> Unit, viewModel: AppDetailViewModel = hiltViewModel()) {
    val entry by viewModel.entry.collectAsStateWithLifecycle()
    val missing by viewModel.missing.collectAsStateWithLifecycle()
    val size by viewModel.size.collectAsStateWithLifecycle()
    val perms by viewModel.permissions.collectAsStateWithLifecycle()
    val context = LocalContext.current
    // Re-checked on resume, so returning from an uninstall dialog shows "App not found".
    val installed = rememberOnResumeCheck { viewModel.repo.entry(pkg) != null }
    LaunchedEffect(pkg, installed) { viewModel.load(pkg) }

    DpScaffold(entry?.label ?: "App", onBack) { padding ->
        val e = entry
        when {
            missing -> MessageState(Icons.Default.Apps, "App not found", "It may have been uninstalled.", Modifier.padding(padding), actionLabel = "Back", onAction = onBack)
            e == null -> LoadingState(modifier = Modifier.fillMaxSize())
            else -> LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = Spacing.lg, end = Spacing.lg, top = padding.calculateTopPadding() + Spacing.sm, bottom = Spacing.xxl),
                verticalArrangement = Arrangement.spacedBy(Spacing.md),
            ) {
                item {
                    DpCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            AppIcon(e.packageName, 56.dp, viewModel::icon)
                            Spacer(Modifier.width(Spacing.md))
                            Column(Modifier.weight(1f)) {
                                Text(e.label, style = MaterialTheme.typography.titleLarge)
                                NoteText(e.packageName)
                            }
                            if (e.isSystem) StatusChip("System", Tone.NEUTRAL)
                        }
                        Spacer(Modifier.height(Spacing.md))
                        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                            val launch = viewModel.repo.launchIntent(e.packageName)
                            if (launch != null) Button(onClick = { SystemIntents.open(context, launch, null) }) { Text("Open") }
                            OutlinedButton(onClick = { SystemIntents.appDetails(context, e.packageName) }) { Text("App info") }
                            if (!e.isSystem && e.packageName != context.packageName) {
                                OutlinedButton(onClick = { SystemIntents.uninstall(context, e.packageName) }) { Text("Uninstall") }
                            }
                        }
                        NoteText("Uninstalling always asks for your confirmation in a system dialog. Force stop, clear cache and background limits are in App info.", Modifier.padding(top = 6.dp))
                    }
                }
                item {
                    DpCard {
                        SectionHeader("Details")
                        InfoRow("Version", e.versionName ?: "—")
                        InfoRow("Version code", e.versionCode.toString())
                        InfoRow("Installed", Formatters.dateTime(e.firstInstallTime))
                        InfoRow("Last updated", Formatters.dateTime(e.lastUpdateTime))
                        InfoRow("Installed from", e.installer ?: "Not Available")
                        InfoRow("Target Android", "API ${e.targetSdk}")
                        e.minSdk?.let { InfoRow("Minimum Android", "API $it") }
                    }
                }
                item {
                    DpCard {
                        SectionHeader("Storage")
                        when (val s = size) {
                            null -> LoadingState()
                            is Reading.Unavailable -> {
                                InfoRow("App size", s.reason.label)
                                if (s.reason == com.webtecit.devicepilot.core.common.UnavailableReason.PERMISSION_REQUIRED) {
                                    OutlinedButton(onClick = { SystemIntents.usageAccess(context) }) { Text("Open Usage access") }
                                }
                            }
                            else -> {
                                ReadingRow("App", s) { Formatters.bytes(it.appBytes) }
                                ReadingRow("Data", s) { Formatters.bytes(it.dataBytes) }
                                ReadingRow("Cache", s) { Formatters.bytes(it.cacheBytes) }
                                ReadingRow("Total", s) { Formatters.bytes(it.totalBytes) }
                            }
                        }
                    }
                }
                item {
                    DpCard {
                        val dangerous = perms.filter { it.dangerous }
                        SectionHeader("Permissions", subtitle = "${perms.size} requested · ${dangerous.count { it.granted }} sensitive granted")
                        if (perms.isEmpty()) NoteText("This app requests no permissions.")
                        perms.forEach { p ->
                            Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(p.name.substringAfterLast('.').replace('_', ' ').lowercase().replaceFirstChar { it.uppercase() },
                                    style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                                if (p.dangerous) StatusChip(if (p.granted) "Allowed" else "Denied", if (p.granted) Tone.WARNING else Tone.NEUTRAL)
                                else NoteText(if (p.granted) "Granted" else "Not granted")
                            }
                        }
                        Spacer(Modifier.height(Spacing.xs))
                        OutlinedButton(onClick = { SystemIntents.appDetails(context, e.packageName) }) { Text("Manage permissions") }
                    }
                }
            }
        }
    }
}
