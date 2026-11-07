package com.webtecit.nayon.feature.webhub

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.automirrored.outlined.ViewList
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.GridView
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.webtecit.nayon.NayonViewModelFactory
import com.webtecit.nayon.R
import com.webtecit.nayon.core.browser.UrlResolver
import com.webtecit.nayon.core.designsystem.component.MessageState
import com.webtecit.nayon.core.designsystem.component.SiteIcon
import com.webtecit.nayon.core.designsystem.theme.Layout
import com.webtecit.nayon.core.designsystem.theme.Spacing
import com.webtecit.nayon.data.browser.FaviconStore
import com.webtecit.nayon.data.webhub.WebHubRepository
import com.webtecit.nayon.data.webhub.WebHubView
import com.webtecit.nayon.data.webhub.WebSite
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class WebHubViewModel(private val repo: WebHubRepository, private val favicons: FaviconStore) : ViewModel() {
    val sites: StateFlow<List<WebSite>?> = repo.sites.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)
    val view: StateFlow<WebHubView> = repo.view.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), WebHubView.LIST)

    fun setView(v: WebHubView) = viewModelScope.launch { repo.setView(v) }
    fun remove(id: Long) = viewModelScope.launch { repo.remove(id) }
    fun pin(id: Long) = viewModelScope.launch { repo.pin(id) }

    /** Saves the site and fetches its own logo straight away, without opening the page. */
    fun save(existing: WebSite?, name: String, address: String, category: String) = viewModelScope.launch {
        val url = normalize(address) ?: return@launch
        val label = name.trim().ifBlank { WebHubRepository.nameFor(url) }
        if (existing != null) repo.edit(existing.copy(name = label, url = url, category = category.trim()))
        else repo.add(label, url, category.trim())
        UrlResolver.displayHost(url).takeIf { it.isNotBlank() }?.let { launch { runCatching { favicons.fetch(it) } } }
    }

    companion object {
        /** "example.com" → "https://example.com"; null when it isn't a web address. */
        fun normalize(input: String): String? {
            val t = input.trim()
            if (t.isEmpty() || ' ' in t) return null
            val url = if (t.startsWith("http://", true) || t.startsWith("https://", true)) t else "https://$t"
            return url.takeIf { UrlResolver.isWebUrl(it) && '.' in UrlResolver.displayHost(it) }
        }
    }
}

/** Suggested categories in the add dialog; the user can type any other. */
val WebHubCategories = listOf("Work", "Social", "Video", "News", "Shopping", "Learn", "Finance")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WebHubScreen(
    onBack: () -> Unit,
    onOpen: (String) -> Unit,
    onOpenNewTab: (String) -> Unit,
    viewModel: WebHubViewModel = viewModel(factory = NayonViewModelFactory.Factory),
) {
    val scheme = MaterialTheme.colorScheme
    val sites by viewModel.sites.collectAsStateWithLifecycle()
    val view by viewModel.view.collectAsStateWithLifecycle()
    var query by rememberSaveable { mutableStateOf("") }
    var category by rememberSaveable { mutableStateOf("") }
    var editing by remember { mutableStateOf<WebSite?>(null) }
    var adding by rememberSaveable { mutableStateOf(false) }

    Scaffold(
        containerColor = scheme.surface,
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.Language, null, tint = scheme.primary, modifier = Modifier.size(26.dp))
                        Spacer(Modifier.width(Spacing.sm))
                        Column {
                            Text(stringResource(R.string.webhub_title), fontWeight = FontWeight.ExtraBold)
                            Text(stringResource(R.string.webhub_subtitle), style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
                        }
                    }
                },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.action_back)) } },
                actions = {
                    val grid = view == WebHubView.GRID
                    IconButton(onClick = { viewModel.setView(if (grid) WebHubView.LIST else WebHubView.GRID) }) {
                        Icon(if (grid) Icons.AutoMirrored.Outlined.ViewList else Icons.Outlined.GridView,
                            stringResource(if (grid) R.string.webhub_view_list else R.string.webhub_view_grid))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = scheme.surface),
            )
        },
        floatingActionButton = { AddSiteButton { adding = true } },
    ) { padding ->
        val all = sites ?: return@Scaffold
        val categories = remember(all) { all.map { it.category }.filter { it.isNotBlank() }.distinct() }
        val shown = all.filter { s ->
            (category.isBlank() || s.category.equals(category, true)) &&
                (query.isBlank() || s.name.contains(query, true) || s.url.contains(query, true))
        }
        Column(Modifier.padding(padding).fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
            Column(Modifier.widthIn(max = Layout.maxContentWidth).fillMaxWidth()) {
                SearchBox(query) { query = it }
                if (categories.isNotEmpty()) {
                    Row(
                        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = Spacing.lg, vertical = Spacing.sm),
                        horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
                    ) {
                        FilterChip(category.isBlank(), { category = "" }, { Text(stringResource(R.string.webhub_all, all.size)) }, shape = CircleShape)
                        categories.forEach { c -> FilterChip(category == c, { category = if (category == c) "" else c }, { Text(c) }, shape = CircleShape) }
                    }
                }
                if (all.isEmpty() || shown.isEmpty()) {
                    MessageState(
                        icon = Icons.Outlined.Language,
                        title = stringResource(if (all.isEmpty()) R.string.webhub_empty_title else R.string.webhub_no_match),
                        body = stringResource(R.string.webhub_empty_body),
                        actionLabel = stringResource(R.string.webhub_add),
                        onAction = { adding = true },
                    )
                    return@Column
                }
                val bottom = PaddingValues(start = Spacing.md, end = Spacing.md, top = Spacing.sm, bottom = 96.dp)
                val menu: @Composable (WebSite, Boolean, () -> Unit) -> Unit = { s, open, close ->
                    SiteMenu(open, close, onNewTab = { onOpenNewTab(s.url) }, onEdit = { editing = s },
                        onPin = { viewModel.pin(s.id) }, onDelete = { viewModel.remove(s.id) })
                }
                if (view == WebHubView.GRID) {
                    LazyVerticalGrid(GridCells.Adaptive(92.dp), contentPadding = bottom,
                        verticalArrangement = Arrangement.spacedBy(Spacing.sm), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        items(shown, key = { it.id }) { s -> GridTile(s, onClick = { onOpen(s.url) }, menu = menu) }
                    }
                } else {
                    LazyColumn(contentPadding = bottom, verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        items(shown, key = { it.id }) { s -> ListRow(s, onClick = { onOpen(s.url) }, menu = menu) }
                    }
                }
            }
        }
    }

    if (adding || editing != null) {
        val e = editing
        WebSiteDialog(
            title = stringResource(if (e == null) R.string.webhub_add else R.string.webhub_edit),
            initialName = e?.name.orEmpty(),
            initialUrl = e?.url.orEmpty(),
            initialCategory = e?.category.orEmpty(),
            onDismiss = { adding = false; editing = null },
            onSave = { n, u, c -> viewModel.save(e, n, u, c); adding = false; editing = null },
        )
    }
}

@Composable
private fun AddSiteButton(onClick: () -> Unit) {
    val brand = Brush.linearGradient(listOf(Color(0xFF25B0FF), Color(0xFF5B3DF5), Color(0xFF8B3CFF)))
    Box(
        Modifier.shadow(10.dp, CircleShape, spotColor = Color(0xFF5B3DF5))
            .clip(CircleShape).background(brand).combinedClickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = Spacing.xl, vertical = Spacing.md),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.Add, null, tint = Color.White)
            Spacer(Modifier.width(Spacing.sm))
            Text(stringResource(R.string.webhub_add), color = Color.White, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun SearchBox(query: String, onChange: (String) -> Unit) {
    val scheme = MaterialTheme.colorScheme
    Surface(shape = CircleShape, color = scheme.surfaceContainerHigh, modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.lg).height(48.dp)) {
        Row(Modifier.padding(horizontal = Spacing.lg), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.Search, null, tint = scheme.onSurfaceVariant)
            Spacer(Modifier.width(Spacing.md))
            Box(Modifier.weight(1f)) {
                if (query.isEmpty()) Text(stringResource(R.string.webhub_search), color = scheme.onSurfaceVariant)
                androidx.compose.foundation.text.BasicTextField(
                    query, onChange, singleLine = true,
                    textStyle = MaterialTheme.typography.bodyLarge.copy(color = scheme.onSurface),
                    cursorBrush = androidx.compose.ui.graphics.SolidColor(scheme.primary),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ListRow(site: WebSite, onClick: () -> Unit, menu: @Composable (WebSite, Boolean, () -> Unit) -> Unit) {
    val scheme = MaterialTheme.colorScheme
    var open by remember { mutableStateOf(false) }
    Surface(shape = RoundedCornerShape(20.dp), color = scheme.surfaceContainerLow, modifier = Modifier.fillMaxWidth()) {
        Row(
            Modifier.combinedClickable(role = Role.Button, onClick = onClick, onLongClick = { open = true })
                .padding(start = Spacing.md, end = Spacing.xs, top = Spacing.sm, bottom = Spacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Logo(site, 46.dp)
            Spacer(Modifier.width(Spacing.md))
            Column(Modifier.weight(1f)) {
                Text(site.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(UrlResolver.displayHost(site.url), style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant,
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (site.category.isNotBlank()) {
                Text(site.category, style = MaterialTheme.typography.labelSmall, color = scheme.primary,
                    modifier = Modifier.clip(CircleShape).background(scheme.primary.copy(alpha = 0.1f)).padding(horizontal = Spacing.sm, vertical = 3.dp))
            }
            Box {
                IconButton(onClick = { open = true }) { Icon(Icons.Filled.MoreVert, stringResource(R.string.action_menu), tint = scheme.onSurfaceVariant) }
                menu(site, open) { open = false }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun GridTile(site: WebSite, onClick: () -> Unit, menu: @Composable (WebSite, Boolean, () -> Unit) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(MaterialTheme.colorScheme.surfaceContainerLow)
                .combinedClickable(role = Role.Button, onClick = onClick, onLongClick = { open = true })
                .padding(vertical = Spacing.md, horizontal = Spacing.xs),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            Logo(site, 54.dp)
            Text(site.name, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
        }
        menu(site, open) { open = false }
    }
}

/** The site's own logo — fetched from the site in the background when it isn't cached yet. */
@Composable
private fun Logo(site: WebSite, size: androidx.compose.ui.unit.Dp) {
    val scheme = MaterialTheme.colorScheme
    Box(
        Modifier.size(size).shadow(3.dp, CircleShape).clip(CircleShape).background(scheme.surfaceContainerLowest)
            .border(1.dp, scheme.outlineVariant.copy(alpha = 0.4f), CircleShape),
        contentAlignment = Alignment.Center,
    ) { SiteIcon(site.url, site.name, size = size, downloadIcon = true, background = scheme.primary) }
}

@Composable
private fun SiteMenu(open: Boolean, onClose: () -> Unit, onNewTab: () -> Unit, onEdit: () -> Unit, onPin: () -> Unit, onDelete: () -> Unit) {
    DropdownMenu(expanded = open, onDismissRequest = onClose) {
        DropdownMenuItem({ Text(stringResource(R.string.ctx_open_new_tab)) }, { onClose(); onNewTab() },
            leadingIcon = { Icon(Icons.AutoMirrored.Outlined.OpenInNew, null) })
        DropdownMenuItem({ Text(stringResource(R.string.action_edit)) }, { onClose(); onEdit() }, leadingIcon = { Icon(Icons.Outlined.Edit, null) })
        DropdownMenuItem({ Text(stringResource(R.string.webhub_move_top)) }, { onClose(); onPin() }, leadingIcon = { Icon(Icons.Outlined.PushPin, null) })
        DropdownMenuItem({ Text(stringResource(R.string.action_delete), color = MaterialTheme.colorScheme.error) }, { onClose(); onDelete() },
            leadingIcon = { Icon(Icons.Outlined.DeleteOutline, null, tint = MaterialTheme.colorScheme.error) })
    }
}

/** Name, web address and an optional category. Used by WebHub and the link long-press menu. */
@Composable
fun WebSiteDialog(
    title: String,
    initialName: String,
    initialUrl: String,
    initialCategory: String,
    onDismiss: () -> Unit,
    onSave: (name: String, url: String, category: String) -> Unit,
) {
    var name by rememberSaveable { mutableStateOf(initialName) }
    var url by rememberSaveable { mutableStateOf(initialUrl) }
    var category by rememberSaveable { mutableStateOf(initialCategory.ifBlank { WebHubRepository.suggestCategory(initialUrl) }) }
    // Name and category fill themselves from the address until the user types their own.
    var nameTouched by rememberSaveable { mutableStateOf(initialName.isNotBlank()) }
    var categoryTouched by rememberSaveable { mutableStateOf(initialCategory.isNotBlank()) }
    val valid = WebHubViewModel.normalize(url) != null
    fun onUrl(v: String) {
        url = v
        val n = WebHubViewModel.normalize(v)
        if (!nameTouched) name = n?.let { WebHubRepository.nameFor(it) }.orEmpty()
        if (!categoryTouched) category = n?.let { WebHubRepository.suggestCategory(it) }.orEmpty()
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = {
            if (valid) SiteIcon(WebHubViewModel.normalize(url), name, size = 48.dp, downloadIcon = true)
            else Icon(Icons.Outlined.Language, null)
        },
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                OutlinedTextField(name, { name = it; nameTouched = true }, label = { Text(stringResource(R.string.webhub_site_name)) }, singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next), modifier = Modifier.fillMaxWidth())
                OutlinedTextField(url, ::onUrl, label = { Text(stringResource(R.string.ntp_shortcut_url)) }, singleLine = true,
                    placeholder = { Text("example.com") }, isError = url.isNotBlank() && !valid,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Next), modifier = Modifier.fillMaxWidth())
                OutlinedTextField(category, { category = it; categoryTouched = true }, label = { Text(stringResource(R.string.webhub_category)) }, singleLine = true,
                    modifier = Modifier.fillMaxWidth())
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    WebHubCategories.forEach { c ->
                        FilterChip(category.equals(c, true), { categoryTouched = true; category = if (category.equals(c, true)) "" else c }, { Text(c) }, shape = CircleShape)
                    }
                }
                Text(stringResource(R.string.webhub_logo_note), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        confirmButton = { TextButton(onClick = { onSave(name, url, category) }, enabled = valid) { Text(stringResource(R.string.action_save)) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.action_cancel)) } },
    )
}
