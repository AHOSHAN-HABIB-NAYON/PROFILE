package com.filepilot.app.ui.navigation

import android.content.Context
import android.net.Uri
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.navigation.NavHostController
import com.filepilot.app.AppContainer
import com.filepilot.app.actions.SystemIntents
import com.filepilot.app.core.model.FileCategory
import com.filepilot.app.core.model.FileItem
import com.filepilot.app.core.model.FileType
import com.filepilot.app.core.model.Location
import com.filepilot.app.core.model.PreviewKind
import com.filepilot.app.core.model.previewKind
import kotlinx.coroutines.launch

object Routes {
    const val INTRO = "intro"
    const val ONBOARDING = "onboarding"
    const val PERMISSIONS = "permissions"

    const val HOME = "home"
    const val BROWSE = "browse"
    const val RECENT = "recent"
    const val FAVORITES = "favorites"
    const val SETTINGS = "settings"
    val tabs = setOf(HOME, BROWSE, RECENT, FAVORITES, SETTINGS)

    const val BROWSER = "browser?loc={loc}"
    const val CATEGORY = "category/{cat}"
    const val SEARCH = "search?q={q}"
    const val DETAILS = "details?item={item}"
    const val PREVIEW = "preview/{kind}?item={item}"
    const val ARCHIVE = "archive?item={item}"
    const val HISTORY = "history"
    const val CLEANUP = "cleanup"
    const val DUPLICATES = "duplicates"
    const val EMPTY_FOLDERS = "empty_folders"
    const val ABOUT = "about"
    const val PRIVACY = "privacy"
    const val LICENSES = "licenses"

    fun browser(loc: Location) = "browser?loc=${Uri.encode(loc.encode())}"
    fun category(cat: FileCategory) = "category/${cat.name}"
    fun search(q: String = "") = if (q.isBlank()) "search" else "search?q=${Uri.encode(q)}"
    fun details(item: FileItem) = "details?item=${Uri.encode(item.toJson().toString())}"
    fun preview(kind: String, item: FileItem) = "preview/$kind?item=${Uri.encode(item.toJson().toString())}"
    fun archive(item: FileItem) = "archive?item=${Uri.encode(item.toJson().toString())}"
}

/** App-wide navigation actions, so every screen opens files the same way. */
class AppNavigator(
    val nav: NavHostController,
    private val container: AppContainer,
    private val context: Context,
) {
    fun back() {
        if (!nav.popBackStack()) nav.navigate(Routes.HOME)
    }

    fun go(route: String) = nav.navigate(route) { launchSingleTop = true }

    fun openFolder(location: Location) = nav.navigate(Routes.browser(location))

    fun category(cat: FileCategory) = when (cat) {
        FileCategory.FAVORITES -> switchTab(Routes.FAVORITES)
        else -> go(Routes.category(cat))
    }

    fun switchTab(route: String) {
        nav.navigate(route) {
            popUpTo(Routes.HOME) { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
    }

    fun details(item: FileItem) = go(Routes.details(item))

    /**
     * Opens a file in the matching built-in viewer, or hands it to another app.
     * [siblings] enables swiping between images in the same list.
     */
    fun open(item: FileItem, siblings: List<FileItem> = emptyList()) {
        if (item.isDirectory) {
            item.asLocation()?.let { openFolder(it) }
            return
        }
        container.ioScope.launch { container.store.addRecent(item) }
        when (item.previewKind()) {
            PreviewKind.IMAGE -> {
                val images = siblings.filter { !it.isDirectory && it.type == FileType.IMAGE && it.previewKind() == PreviewKind.IMAGE }
                container.imageSession = if (images.any { it.id == item.id }) images else listOf(item)
                go(Routes.preview("image", item))
            }
            PreviewKind.VIDEO -> go(Routes.preview("video", item))
            PreviewKind.AUDIO -> go(Routes.preview("audio", item))
            PreviewKind.TEXT -> go(Routes.preview("text", item))
            PreviewKind.PDF -> go(Routes.preview("pdf", item))
            PreviewKind.ARCHIVE -> go(Routes.archive(item))
            PreviewKind.EXTERNAL -> openExternal(item)
        }
    }

    fun openExternal(item: FileItem, chooser: Boolean = false) {
        SystemIntents.open(context, item, chooser)?.let { container.message(it) }
    }
}

val LocalNavigator = staticCompositionLocalOf<AppNavigator> { error("No navigator") }
val LocalContainer = staticCompositionLocalOf<AppContainer> { error("No container") }
