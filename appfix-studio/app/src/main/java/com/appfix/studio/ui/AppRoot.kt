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
import com.appfix.studio.ui.nav.SettingsRoute
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
                    EditorScreen(onOpenProjects = { nav.navigateTopLevel(ProjectsRoute) })
                }
                composable<RepairRoute> {
                    RepairScreen(
                        onOpenProjects = { nav.navigateTopLevel(ProjectsRoute) },
                        onOpenFile = { id, path, line -> nav.navigate(FileViewerRoute(id, path, line ?: 0)) },
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
                        onOpenFile = { path -> nav.navigate(FileViewerRoute(route.id, path)) },
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
