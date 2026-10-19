package com.webtecit.nayon

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider.AndroidViewModelFactory.Companion.APPLICATION_KEY
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.webtecit.nayon.core.designsystem.theme.AppearanceSettings
import com.webtecit.nayon.data.settings.AppearanceRepository
import com.webtecit.nayon.feature.appearance.AppearanceViewModel
import com.webtecit.nayon.feature.bookmarks.BookmarksViewModel
import com.webtecit.nayon.feature.browser.BrowserViewModel
import com.webtecit.nayon.feature.downloads.DownloadsViewModel
import com.webtecit.nayon.feature.history.HistoryViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn

/** App-level state: the appearance settings drive the whole theme. `null` until first loaded. */
class MainViewModel(repository: AppearanceRepository) : ViewModel() {
    val appearance: StateFlow<AppearanceSettings?> = repository.appearance
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)
}

object NayonViewModelFactory {
    val Factory = viewModelFactory {
        initializer { MainViewModel(app().container.appearanceRepository) }
        initializer { AppearanceViewModel(app().container.appearanceRepository) }
        initializer {
            val app = app()
            BrowserViewModel(app, app.container.browsingRepository, app.container.browserPreferences, app.container.faviconStore, app.container.downloadEngine, app.container.securityRepository)
        }
        initializer { BookmarksViewModel(app().container.browsingRepository) }
        initializer { HistoryViewModel(app().container.browsingRepository) }
        initializer { DownloadsViewModel(app().container.downloadEngine) }
        initializer {
            com.webtecit.nayon.feature.security.PasswordsViewModel(app().container.securityRepository, app().container.browserPreferences)
        }
        initializer { com.webtecit.nayon.feature.security.SiteSettingsViewModel(app().container.securityRepository) }
    }

    private fun androidx.lifecycle.viewmodel.CreationExtras.app(): NayonApp =
        this[APPLICATION_KEY] as NayonApp
}
