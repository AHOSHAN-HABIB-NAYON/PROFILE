package com.webtecit.nayon

import android.app.Application
import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.preferencesDataStore
import androidx.room.Room
import com.webtecit.nayon.data.browser.BrowserDatabase
import com.webtecit.nayon.data.browser.BrowsingRepository
import com.webtecit.nayon.data.browser.FaviconStore
import com.webtecit.nayon.data.downloads.DownloadEngine
import com.webtecit.nayon.data.downloads.DownloadService
import com.webtecit.nayon.data.downloads.DownloadsDatabase
import com.webtecit.nayon.data.settings.AppearanceRepository
import com.webtecit.nayon.data.settings.BrowserPreferencesRepository
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

    val browserPreferences = BrowserPreferencesRepository(context.settingsDataStore)

    private val database: BrowserDatabase by lazy {
        Room.databaseBuilder(context, BrowserDatabase::class.java, "nayon_browser.db").build()
    }

    // "favicons3": earlier builds could file an icon under the wrong site, so start a clean cache.
    val faviconStore = FaviconStore(java.io.File(context.filesDir, "favicons3")).also {
        java.io.File(context.filesDir, "favicons").deleteRecursively()
        java.io.File(context.filesDir, "favicons2").deleteRecursively()
    }

    private val downloadsDatabase: DownloadsDatabase by lazy {
        Room.databaseBuilder(context, DownloadsDatabase::class.java, "nayon_downloads.db").build()
    }

    val downloadEngine: DownloadEngine by lazy { DownloadEngine(context.applicationContext, downloadsDatabase.downloads()) }

    private val securityDatabase: com.webtecit.nayon.data.security.SecurityDatabase by lazy {
        Room.databaseBuilder(context, com.webtecit.nayon.data.security.SecurityDatabase::class.java, "nayon_security.db")
            .addMigrations(com.webtecit.nayon.data.security.SecurityDatabase.MIGRATION_1_2)
            .build()
    }

    /** Encrypted password vault and website permission decisions. */
    val securityRepository: com.webtecit.nayon.data.security.SecurityRepository by lazy {
        com.webtecit.nayon.data.security.SecurityRepository(securityDatabase)
    }

    val browsingRepository: BrowsingRepository by lazy {
        BrowsingRepository(database.historyDao(), database.bookmarkDao(), database.savedTabDao())
    }
}

class NayonApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        DownloadService.createChannels(this)
    }
}
