package com.filepilot.app.ui.preview

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.StarOutline
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.filepilot.app.actions.SystemIntents
import com.filepilot.app.core.model.FileItem
import com.filepilot.app.ui.navigation.LocalContainer
import com.filepilot.app.ui.navigation.LocalNavigator
import kotlinx.coroutines.launch

/**
 * The same toolbar on every preview: back, file name, share, and a menu with
 * Open with, favorite and details.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PreviewTopBar(
    item: FileItem,
    subtitle: String? = null,
    dark: Boolean = false,
    containerColor: Color = if (dark) Color.Black.copy(alpha = 0.55f) else MaterialTheme.colorScheme.surface,
    extraMenu: @Composable (close: () -> Unit) -> Unit = {},
) {
    val container = LocalContainer.current
    val navigator = LocalNavigator.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val favorites by container.store.favorites.collectAsStateWithLifecycle(emptyList())
    val isFavorite = favorites.any { it.id == item.id }
    var menu by remember { mutableStateOf(false) }
    val content = if (dark) Color.White else MaterialTheme.colorScheme.onSurface
    TopAppBar(
        title = {
            Column {
                Text(item.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, color = content)
                if (subtitle != null) {
                    Text(subtitle, style = MaterialTheme.typography.bodySmall, color = content.copy(alpha = 0.7f), maxLines = 1)
                }
            }
        },
        navigationIcon = {
            IconButton(onClick = navigator::back) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back", tint = content) }
        },
        actions = {
            IconButton(onClick = { SystemIntents.share(context, listOf(item))?.let { container.message(it) } }) {
                Icon(Icons.Rounded.Share, "Share", tint = content)
            }
            Box {
                IconButton(onClick = { menu = true }) { Icon(Icons.Rounded.MoreVert, "More options", tint = content) }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    DropdownMenuItem(
                        text = { Text("Open with…") },
                        leadingIcon = { Icon(Icons.AutoMirrored.Rounded.OpenInNew, null) },
                        onClick = {
                            menu = false
                            navigator.openExternal(item, chooser = true)
                        },
                    )
                    DropdownMenuItem(
                        text = { Text(if (isFavorite) "Remove from favorites" else "Add to favorites") },
                        leadingIcon = { Icon(if (isFavorite) Icons.Rounded.Star else Icons.Rounded.StarOutline, null) },
                        onClick = {
                            menu = false
                            scope.launch {
                                val added = container.store.toggleFavorite(item)
                                container.message(if (added) "Added to favorites" else "Removed from favorites")
                            }
                        },
                    )
                    DropdownMenuItem(
                        text = { Text("Details") },
                        leadingIcon = { Icon(Icons.Rounded.Info, null) },
                        onClick = {
                            menu = false
                            navigator.details(item)
                        },
                    )
                    extraMenu { menu = false }
                }
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(containerColor = containerColor),
    )
}
