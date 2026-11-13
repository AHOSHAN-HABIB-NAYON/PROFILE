package com.webtecit.filepilot.navigation

import kotlinx.serialization.Serializable

@Serializable data object SplashRoute
@Serializable data object OnboardingRoute
@Serializable data class PermissionsRoute(val setup: Boolean)
@Serializable data object HomeRoute
@Serializable data object FilesRoute
@Serializable data object LibraryRoute
@Serializable data object SettingsRoute
@Serializable data class BrowserRoute(val locationId: String, val search: Boolean = false)
@Serializable data class CompareRoute(val firstId: String, val secondId: String)
@Serializable data object AboutRoute
@Serializable data object ToolsRoute
@Serializable data object AnalyzerRoute
@Serializable data class EditorRoute(val fileId: String? = null, val projectRoot: String? = null)
@Serializable data class PreviewRoute(val root: String, val entry: String)
@Serializable data object ProjectsRoute
@Serializable data object CleanerRoute
@Serializable data object RecycleBinRoute
