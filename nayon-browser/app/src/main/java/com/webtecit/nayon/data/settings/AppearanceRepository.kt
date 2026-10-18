package com.webtecit.nayon.data.settings

import com.webtecit.nayon.core.designsystem.theme.AppearanceSettings
import com.webtecit.nayon.core.designsystem.theme.ThemeFamily
import com.webtecit.nayon.core.designsystem.theme.ThemeMode
import kotlinx.coroutines.flow.Flow

/** Source of truth for the user's appearance choices. */
interface AppearanceRepository {
    val appearance: Flow<AppearanceSettings>
    suspend fun setMode(mode: ThemeMode)
    suspend fun setFamily(family: ThemeFamily)
    suspend fun setSchedule(darkStartMinute: Int, darkEndMinute: Int)
    suspend fun setScheduleUsesAmoled(enabled: Boolean)
}
