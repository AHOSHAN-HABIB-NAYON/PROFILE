@file:OptIn(ExperimentalMaterial3Api::class)

package com.oryzenx.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import com.oryzenx.app.OryzenApp
import com.oryzenx.app.data.Api
import com.oryzenx.app.ui.components.ErrorState
import com.oryzenx.app.ui.components.LoadingList
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay

val api: Api get() = OryzenApp.instance.api

sealed interface Load<out T> {
    data object Loading : Load<Nothing>
    data class Ok<T>(val value: T) : Load<T>
    data class Err(val error: Throwable) : Load<Nothing>
}

class Loaded<T>(val state: Load<T>, val refreshing: Boolean, val reload: () -> Unit)

/**
 * Loads data with a skeleton → content / error flow. Optional polling runs only while the screen is
 * RESUMED (stops in background, saving battery and network).
 */
@Composable
fun <T> rememberLoad(vararg keys: Any?, pollMs: Long = 0L, fetch: suspend () -> T): Loaded<T> {
    var tick by remember { mutableIntStateOf(0) }
    var refreshing by remember { mutableStateOf(false) }
    var state by remember(*keys) { mutableStateOf<Load<T>>(Load.Loading) }
    LaunchedEffect(*keys, tick) {
        try {
            state = Load.Ok(fetch())
        } catch (e: CancellationException) {
            throw e
        } catch (e: Throwable) {
            if (state !is Load.Ok) state = Load.Err(e)
        } finally {
            refreshing = false
        }
    }
    if (pollMs > 0) {
        val owner = LocalLifecycleOwner.current
        LaunchedEffect(owner, *keys) {
            owner.lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
                while (true) {
                    delay(pollMs)
                    try { state = Load.Ok(fetch()) } catch (e: CancellationException) { throw e } catch (_: Throwable) { /* keep last good data */ }
                }
            }
        }
    }
    return Loaded(state, refreshing) { refreshing = true; if (state is Load.Err) state = Load.Loading; tick++ }
}

/** Scrollable screen body with pull-to-refresh and the loading/error states handled. */
@Composable
fun <T> LoadedColumn(loaded: Loaded<T>, modifier: Modifier = Modifier, content: @Composable ColumnScope.(T) -> Unit) {
    PullToRefreshBox(isRefreshing = loaded.refreshing, onRefresh = loaded.reload, modifier = modifier.fillMaxSize()) {
        when (val s = loaded.state) {
            is Load.Loading -> Box(Modifier.verticalScroll(rememberScrollState())) { LoadingList() }
            is Load.Err -> Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) { ErrorState(s.error, loaded.reload) }
            is Load.Ok -> Column(
                Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(top = 4.dp, bottom = 32.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) { content(s.value) }
        }
    }
}
