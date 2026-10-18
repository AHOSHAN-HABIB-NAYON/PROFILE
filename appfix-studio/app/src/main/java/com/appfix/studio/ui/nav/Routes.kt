package com.appfix.studio.ui.nav

import kotlinx.serialization.Serializable

@Serializable data object HomeRoute
@Serializable data object ProjectsRoute
@Serializable data object EditorRoute
@Serializable data object RepairRoute
@Serializable data object SettingsRoute
@Serializable data class ProjectRoute(val id: String)
@Serializable data class ApkReportRoute(val id: String)
@Serializable data class FileViewerRoute(val id: String, val path: String, val line: Int = 0)
@Serializable data object LimitationsRoute
@Serializable data class SearchRoute(val id: String)
@Serializable data class ResourcesRoute(val id: String)
