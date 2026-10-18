package com.appfix.studio

import android.content.Context
import com.appfix.studio.data.db.AppDatabase
import com.appfix.studio.data.repo.ProjectRepository
import com.appfix.studio.data.repo.ProjectStorage
import com.appfix.studio.data.settings.SettingsRepository

/** Manual dependency container; one instance per process. */
class AppContainer(context: Context) {
    private val appContext = context.applicationContext
    val database: AppDatabase by lazy { AppDatabase.create(appContext) }
    val storage: ProjectStorage by lazy { ProjectStorage(appContext) }
    val settings: SettingsRepository by lazy { SettingsRepository(appContext) }
    val projects: ProjectRepository by lazy { ProjectRepository(appContext, database.projects(), storage) }
}
