package com.appfix.studio.data.repo

import android.content.Context
import java.io.File

/**
 * On-device layout of a project (all inside app-private storage):
 *
 * projects/<id>/original/   untouched copy of an imported APK (read-only by convention)
 * projects/<id>/workspace/  editable source tree
 * projects/<id>/history/    applied change sets (for undo)
 * projects/<id>/backups/    full workspace backups
 * projects/<id>/reports/    cached inspection and analysis results
 */
class ProjectStorage(context: Context) {
    val root: File = File(context.filesDir, "projects").apply { mkdirs() }
    val tempDir: File = File(context.cacheDir, "imports").apply { mkdirs() }

    fun projectDir(id: String): File {
        require(id.matches(Regex("[A-Za-z0-9-]{8,64}"))) { "Invalid project id" }
        return File(root, id)
    }

    fun originalDir(id: String) = File(projectDir(id), "original")
    fun workspace(id: String) = File(projectDir(id), "workspace")
    fun historyDir(id: String) = File(projectDir(id), "history")
    fun backupDir(id: String) = File(projectDir(id), "backups")
    fun reportsDir(id: String) = File(projectDir(id), "reports").apply { mkdirs() }
    fun originalApk(id: String): File? = originalDir(id).listFiles()?.firstOrNull { it.isFile }
    fun iconFile(id: String) = File(reportsDir(id), "icon.png")

    fun sizeOf(dir: File): Long = dir.walkTopDown().filter { it.isFile }.sumOf { it.length() }

    fun clearTemp() {
        tempDir.listFiles()?.forEach { it.deleteRecursively() }
    }
}
