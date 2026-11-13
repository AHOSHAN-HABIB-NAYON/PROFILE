package com.webtecit.devicepilot.ui.common

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.isActive

/**
 * Cold polling flow. Combined with stateIn(WhileSubscribed) and
 * collectAsStateWithLifecycle it stops automatically when the screen is not visible.
 */
fun <T> polling(intervalMs: Long, block: suspend () -> T): Flow<T> = flow {
    while (currentCoroutineContext().isActive) {
        emit(block())
        delay(intervalMs)
    }
}.flowOn(Dispatchers.IO)
