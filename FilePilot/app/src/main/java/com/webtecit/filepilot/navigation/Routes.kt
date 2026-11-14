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
@Serializable data object VaultRoute
@Serializable data class PdfRoute(val fileId: String)
@Serializable data class ApkRoute(val path: String)
@Serializable data class HexRoute(val path: String)
@Serializable data class SqliteRoute(val path: String)
@Serializable data class ArchiveRoute(val path: String)
@Serializable data class FontRoute(val path: String)
@Serializable data class TextSearchRoute(val root: String)
@Serializable data object TerminalRoute
@Serializable data object SearchRoute
@Serializable data class ImageRoute(val path: String)
@Serializable data class VideoRoute(val path: String)
@Serializable data object RecycleBinRoute

@Serializable data class FolderSizeRoute(val path: String? = null)
@Serializable data class FileToolRoute(val tool: String)
@Serializable data object QrCreateRoute
@Serializable data object QrScanRoute
@Serializable data class DevUtilsRoute(val start: String)
@Serializable data class OrganizeRoute(val path: String? = null)
@Serializable data object WhatsAppRoute
