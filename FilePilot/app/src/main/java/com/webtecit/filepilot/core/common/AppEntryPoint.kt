package com.webtecit.filepilot.core.common

import com.webtecit.filepilot.core.preferences.PreferencesRepository
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

/** Access to singletons from code Hilt doesn't construct (used by instrumented tests). */
@EntryPoint
@InstallIn(SingletonComponent::class)
interface AppEntryPoint {
    fun preferences(): PreferencesRepository
}
