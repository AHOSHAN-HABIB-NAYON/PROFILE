package com.webtecit.devicepilot.ui.apps

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.webtecit.devicepilot.AppContainer
import com.webtecit.devicepilot.data.AppEntry
import com.webtecit.devicepilot.data.AppUsageInfo
import com.webtecit.devicepilot.domain.UsagePeriod
import com.webtecit.devicepilot.domain.UsagePeriods
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

enum class AppFilter { ALL, USER, SYSTEM, RECENT, DATA, USAGE }
enum class AppSort { NAME, INSTALLED, UPDATED, DATA, USAGE }

data class AppRow(val app: AppEntry, val dataBytes: Long?, val usage: AppUsageInfo?)

data class AppsUi(
    val loading: Boolean = true,
    val rows: List<AppRow> = emptyList(),
    val total: Int = 0,
    val query: String = "",
    val filter: AppFilter = AppFilter.ALL,
    val sort: AppSort = AppSort.NAME,
    val usageAccess: Boolean = false,
)

class AppsViewModel(private val c: AppContainer) : ViewModel() {

    private val apps = MutableStateFlow<List<AppEntry>>(emptyList())
    private val usage = MutableStateFlow<Map<String, AppUsageInfo>>(emptyMap())
    private val dataByUid = MutableStateFlow<Map<Int, Long>>(emptyMap())
    private val loading = MutableStateFlow(true)
    private val query = MutableStateFlow("")
    private val filter = MutableStateFlow(AppFilter.ALL)
    private val sort = MutableStateFlow(AppSort.NAME)
    private val access = MutableStateFlow(false)

    private val controls = combine(query, filter, sort) { q, f, s -> Triple(q, f, s) }

    val ui: StateFlow<AppsUi> = combine(apps, usage, dataByUid, controls, combine(loading, access) { l, a -> l to a }) { list, u, d, (q, f, s), (l, a) ->
        val now = System.currentTimeMillis()
        var rows = list.map { AppRow(it, d[it.uid], u[it.packageName]) }
        rows = when (f) {
            AppFilter.ALL -> rows
            AppFilter.USER -> rows.filter { it.app.isUserApp }
            AppFilter.SYSTEM -> rows.filter { it.app.isSystem }
            AppFilter.RECENT -> rows.filter { now - it.app.firstInstall < 7L * 24 * 3600 * 1000 && it.app.firstInstall > 0 }
            AppFilter.DATA -> rows.filter { (it.dataBytes ?: 0) > 0 }
            AppFilter.USAGE -> rows.filter { (it.usage?.foregroundMs ?: 0) > 0 || (it.usage?.lastUsed ?: 0) > 0 }
        }
        if (q.isNotBlank()) {
            val needle = q.trim().lowercase()
            rows = rows.filter { needle in it.app.label.lowercase() || needle in it.app.packageName.lowercase() }
        }
        rows = when (if (f == AppFilter.DATA) AppSort.DATA else s) {
            AppSort.NAME -> rows.sortedBy { it.app.label.lowercase() }
            AppSort.INSTALLED -> rows.sortedByDescending { it.app.firstInstall }
            AppSort.UPDATED -> rows.sortedByDescending { it.app.lastUpdate }
            AppSort.DATA -> rows.sortedByDescending { it.dataBytes ?: -1 }
            AppSort.USAGE -> rows.sortedByDescending { it.usage?.foregroundMs ?: -1 }
        }
        AppsUi(l, rows, list.size, q, f, s, a)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), AppsUi())

    init {
        refresh()
        viewModelScope.launch { c.apps.packageChanges().collect { refresh() } }
    }

    fun refresh() = viewModelScope.launch {
        loading.value = true
        apps.value = c.apps.loadApps()
        loading.value = false
        val hasAccess = c.usage.hasUsageAccess()
        access.value = hasAccess
        if (hasAccess) {
            val range = UsagePeriods.range(UsagePeriod.LAST_30_DAYS, System.currentTimeMillis(), 1)
            usage.value = c.usage.appUsage(range)
            dataByUid.value = c.usage.perAppUsage(range)?.associate { it.uid to it.total }.orEmpty()
        }
    }

    fun setQuery(v: String) { query.value = v }
    fun setFilter(v: AppFilter) { filter.value = v }
    fun setSort(v: AppSort) { sort.value = v }
}
