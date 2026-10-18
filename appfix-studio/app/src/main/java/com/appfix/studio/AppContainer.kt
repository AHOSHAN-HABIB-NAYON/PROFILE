package com.appfix.studio

import android.content.Context
import com.appfix.studio.data.build.BuildRunner
import com.appfix.studio.data.db.AppDatabase
import com.appfix.studio.security.SecretStore
import com.appfix.studio.data.repo.ProjectRepository
import com.appfix.studio.data.repo.ProjectStorage
import com.appfix.studio.data.settings.SettingsRepository
import com.appfix.studio.ui.editor.OpenRequest
import kotlinx.coroutines.flow.MutableStateFlow

/** Manual dependency container; one instance per process. */
class AppContainer(context: Context) {
    private val appContext = context.applicationContext
    val database: AppDatabase by lazy { AppDatabase.create(appContext) }
    val storage: ProjectStorage by lazy { ProjectStorage(appContext) }
    val settings: SettingsRepository by lazy { SettingsRepository(appContext) }
    val projects: ProjectRepository by lazy { ProjectRepository(appContext, database.projects(), storage) }

    val secrets: SecretStore by lazy { SecretStore(appContext) }
    val builds: BuildRunner by lazy { BuildRunner(storage, secrets) }

    /** One-shot requests to open a file in the editor, posted by other screens. */
    val editorRequests = MutableStateFlow<OpenRequest?>(null)

    /** Build log handed from the Build screen to the Repair center for analysis. */
    val buildLogRequests = MutableStateFlow<String?>(null)
}
