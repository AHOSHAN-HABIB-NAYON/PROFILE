package com.webtecit.nayon

import android.app.Application
import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.preferencesDataStore
import com.webtecit.nayon.data.settings.AppearanceRepository
import com.webtecit.nayon.data.settings.DataStoreAppearanceRepository

private val Context.settingsDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "nayon_settings",
    corruptionHandler = ReplaceFileCorruptionHandler { emptyPreferences() },
)

/**
 * Minimal manual dependency container. Kept deliberately small; a DI framework
 * can replace it once the number of dependencies justifies one.
 */
class AppContainer(context: Context) {
    val appearanceRepository: AppearanceRepository =
        DataStoreAppearanceRepository(context.settingsDataStore)
}

class NayonApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
