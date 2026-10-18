package com.appfix.studio.ui

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import com.appfix.studio.ui.apk.ApkReportScreen
import com.appfix.studio.ui.editor.EditorScreen
import com.appfix.studio.ui.editor.FileViewerScreen
import com.appfix.studio.ui.home.HomeScreen
import com.appfix.studio.ui.nav.ApkReportRoute
import com.appfix.studio.ui.nav.EditorRoute
import com.appfix.studio.ui.nav.FileViewerRoute
import com.appfix.studio.ui.nav.HomeRoute
import com.appfix.studio.ui.nav.LimitationsRoute
import com.appfix.studio.ui.nav.ProjectRoute
import com.appfix.studio.ui.nav.ProjectsRoute
import com.appfix.studio.ui.nav.RepairRoute
import com.appfix.studio.ui.nav.ResourcesRoute
import com.appfix.studio.ui.nav.SearchRoute
import com.appfix.studio.ui.nav.FeaturesRoute
import com.appfix.studio.ui.nav.BrandingRoute
import com.appfix.studio.ui.nav.BuildRoute
import com.appfix.studio.ui.nav.ApkModifyRoute
import com.appfix.studio.ui.apk.ApkModifyScreen
import com.appfix.studio.ui.nav.SigningRoute
import com.appfix.studio.ui.build.BuildScreen
import com.appfix.studio.ui.build.SigningScreen
import com.appfix.studio.ui.branding.BrandingScreen
import com.appfix.studio.ui.nav.VisualEditorRoute
import com.appfix.studio.ui.features.FeaturesScreen
import com.appfix.studio.ui.visual.VisualEditorScreen
import com.appfix.studio.ui.nav.SettingsRoute
import com.appfix.studio.data.db.ProjectKind
import com.appfix.studio.ui.editor.OpenRequest
import com.appfix.studio.ui.resources.ResourcesScreen
import com.appfix.studio.ui.search.ProjectSearchScreen
import com.appfix.studio.ui.project.ProjectScreen
import com.appfix.studio.ui.projects.ProjectsScreen
import com.appfix.studio.ui.repair.RepairScreen
import com.appfix.studio.ui.settings.LimitationsScreen
import com.appfix.studio.ui.settings.SettingsScreen
import kotlinx.coroutines.launch
import kotlin.reflect.KClass

private data class TopLevel(val label: String, val route: Any, val routeClass: KClass<*>, val selected: ImageVector, val unselected: ImageVector)

private val topLevels = listOf(
    TopLevel("Home", HomeRoute, HomeRoute::class, Icons.Filled.Home, Icons.Outlined.Home),
    TopLevel("Projects", ProjectsRoute, ProjectsRoute::class, Icons.Filled.Folder, Icons.Outlined.Folder),
    TopLevel("Editor", EditorRoute, EditorRoute::class, Icons.Filled.Code, Icons.Outlined.Code),
    TopLevel("Repair", RepairRoute, RepairRoute::class, Icons.Filled.Build, Icons.Outlined.Build),
    TopLevel("Settings", SettingsRoute, SettingsRoute::class, Icons.Filled.Settings, Icons.Outlined.Settings),
)

@Composable
fun AppRoot() {
    val nav = rememberNavController()
    val importVm = appViewModel { ImportViewModel(it) }
    val container = appContainer()
    val scope = rememberCoroutineScope()
    val backStack by nav.currentBackStackEntryAsState()
    val destination = backStack?.destination
    val showBottomBar = topLevels.any { t -> destination?.hierarchy?.any { it.hasRoute(t.routeClass) } == true }

    /** Source files open in the editor; APK entries open in the read-only viewer. */
    fun openFile(projectId: String, path: String, line: Int?) {
        scope.launch {
            val kind = container.projects.get(projectId)?.kind
            if (kind == ProjectKind.SOURCE) {
                container.settings.setCurrentProject(projectId)
                container.editorRequests.value = OpenRequest(projectId, path, line)
                nav.navigateTopLevel(EditorRoute)
            } else {
                nav.navigate(FileViewerRoute(projectId, path, line ?: 0))
            }
        }
    }

    ImportHost(importVm, onImported = { id -> nav.navigate(ProjectRoute(id)) }) {
        Scaffold(
            contentWindowInsets = WindowInsets(0, 0, 0, 0),
            bottomBar = {
                if (showBottomBar) {
                    NavigationBar(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest) {
                        topLevels.forEach { t ->
                            val selected = destination?.hierarchy?.any { it.hasRoute(t.routeClass) } == true
                            NavigationBarItem(
                                selected = selected,
                                onClick = { nav.navigateTopLevel(t.route) },
                                icon = { Icon(if (selected) t.selected else t.unselected, contentDescription = null) },
                                label = { Text(t.label) },
                            )
                        }
                    }
                }
            },
        ) { padding ->
            NavHost(nav, startDestination = HomeRoute, modifier = Modifier.padding(padding).consumeWindowInsets(padding)) {
                composable<HomeRoute> {
                    HomeScreen(
                        onOpenProject = { id -> nav.navigate(ProjectRoute(id)) },
                        onSeeAllProjects = { nav.navigateTopLevel(ProjectsRoute) },
                        onOpenLimitations = { nav.navigate(LimitationsRoute) },
                    )
                }
                composable<ProjectsRoute> { ProjectsScreen(onOpenProject = { id -> nav.navigate(ProjectRoute(id)) }) }
                composable<EditorRoute> {
                    EditorScreen(
                        onOpenProjects = { nav.navigateTopLevel(ProjectsRoute) },
                        onOpenSearch = { id -> nav.navigate(SearchRoute(id)) },
                        onOpenResources = { id -> nav.navigate(ResourcesRoute(id)) },
                        onOpenVisual = { id -> nav.navigate(VisualEditorRoute(id)) },
                        onOpenFeatures = { id -> nav.navigate(FeaturesRoute(id)) },
                        onOpenBranding = { id -> nav.navigate(BrandingRoute(id)) },
                        onOpenBuild = { id -> nav.navigate(BuildRoute(id)) },
                    )
                }
                composable<BuildRoute> { entry ->
                    val id = entry.toRoute<BuildRoute>().id
                    BuildScreen(
                        id,
                        onBack = { nav.popBackStack() },
                        onAnalyzeLog = { log ->
                            scope.launch { container.settings.setCurrentProject(id) }
                            container.buildLogRequests.value = log
                            nav.navigateTopLevel(RepairRoute)
                        },
                        onSign = { path -> nav.navigate(SigningRoute(path)) },
                    )
                }
                composable<ApkModifyRoute> { entry ->
                    ApkModifyScreen(entry.toRoute<ApkModifyRoute>().id, onBack = { nav.popBackStack() }, onSignWithKey = { path -> nav.navigate(SigningRoute(path)) })
                }
                composable<SigningRoute> { entry ->
                    SigningScreen(entry.toRoute<SigningRoute>().file.ifEmpty { null }, onBack = { nav.popBackStack() })
                }
                composable<BrandingRoute> { entry ->
                    BrandingScreen(entry.toRoute<BrandingRoute>().id, onBack = { nav.popBackStack() })
                }
                composable<VisualEditorRoute> { entry ->
                    val id = entry.toRoute<VisualEditorRoute>().id
                    VisualEditorScreen(id, onBack = { nav.popBackStack() }, onOpenSource = { path -> openFile(id, path, null) })
                }
                composable<FeaturesRoute> { entry ->
                    FeaturesScreen(entry.toRoute<FeaturesRoute>().id, onBack = { nav.popBackStack() })
                }
                composable<SearchRoute> { entry ->
                    val id = entry.toRoute<SearchRoute>().id
                    ProjectSearchScreen(id, onBack = { nav.popBackStack() }, onOpenInEditor = { path, line -> openFile(id, path, line) })
                }
                composable<ResourcesRoute> { entry ->
                    ResourcesScreen(entry.toRoute<ResourcesRoute>().id, onBack = { nav.popBackStack() })
                }
                composable<RepairRoute> {
                    RepairScreen(
                        onOpenProjects = { nav.navigateTopLevel(ProjectsRoute) },
                        onOpenFile = { id, path, line -> openFile(id, path, line) },
                    )
                }
                composable<SettingsRoute> { SettingsScreen(onOpenLimitations = { nav.navigate(LimitationsRoute) }) }
                composable<LimitationsRoute> { LimitationsScreen(onBack = { nav.popBackStack() }) }
                composable<ProjectRoute> { entry ->
                    val route = entry.toRoute<ProjectRoute>()
                    ProjectScreen(
                        projectId = route.id,
                        onBack = { nav.popBackStack() },
                        onOpenApkReport = { nav.navigate(ApkReportRoute(route.id)) },
                        onOpenFile = { path -> openFile(route.id, path, null) },
                        onOpenResources = { nav.navigate(ResourcesRoute(route.id)) },
                        onOpenSearch = { nav.navigate(SearchRoute(route.id)) },
                        onOpenVisual = { nav.navigate(VisualEditorRoute(route.id)) },
                        onOpenFeatures = { nav.navigate(FeaturesRoute(route.id)) },
                        onOpenBranding = { nav.navigate(BrandingRoute(route.id)) },
                        onOpenBuild = { nav.navigate(BuildRoute(route.id)) },
                        onSignApk = { path -> nav.navigate(SigningRoute(path)) },
                        onModifyApk = { nav.navigate(ApkModifyRoute(route.id)) },
                        onOpenEditor = {
                            scope.launch { container.settings.setCurrentProject(route.id) }
                            nav.navigateTopLevel(EditorRoute)
                        },
                        onOpenRepair = {
                            scope.launch { container.settings.setCurrentProject(route.id) }
                            nav.navigateTopLevel(RepairRoute)
                        },
                        onDeleted = { nav.popBackStack() },
                    )
                }
                composable<ApkReportRoute> { entry ->
                    ApkReportScreen(projectId = entry.toRoute<ApkReportRoute>().id, onBack = { nav.popBackStack() })
                }
                composable<FileViewerRoute> { entry ->
                    val r = entry.toRoute<FileViewerRoute>()
                    FileViewerScreen(projectId = r.id, path = r.path, line = r.line.takeIf { it > 0 }, onBack = { nav.popBackStack() })
                }
            }
        }
    }
}

private fun NavHostController.navigateTopLevel(route: Any) {
    navigate(route) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}
