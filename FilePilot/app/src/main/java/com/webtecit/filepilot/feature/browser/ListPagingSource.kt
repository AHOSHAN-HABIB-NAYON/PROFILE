package com.webtecit.filepilot.feature.browser

import androidx.paging.PagingSource
import androidx.paging.PagingState

/**
 * Pages over an already-sorted folder snapshot. With placeholders the list knows its full size,
 * so fast scrolling and scroll restoration work in folders with tens of thousands of items while
 * only the visible rows are materialised.
 */
class ListPagingSource<T : Any>(private val items: List<T>) : PagingSource<Int, T>() {

    override val jumpingSupported: Boolean = true

    override fun getRefreshKey(state: PagingState<Int, T>): Int? =
        state.anchorPosition?.let { (it - state.config.initialLoadSize / 2).coerceAtLeast(0) }

    override suspend fun load(params: LoadParams<Int>): LoadResult<Int, T> {
        val key = params.key ?: 0
        val from: Int
        val to: Int
        if (params is LoadParams.Prepend) {
            to = key.coerceIn(0, items.size)
            from = (to - params.loadSize).coerceAtLeast(0)
        } else {
            from = key.coerceIn(0, items.size)
            to = (from + params.loadSize).coerceAtMost(items.size)
        }
        return LoadResult.Page(
            data = items.subList(from, to).toList(),
            prevKey = if (from > 0) from else null,
            nextKey = if (to < items.size) to else null,
            itemsBefore = from,
            itemsAfter = items.size - to,
        )
    }
}
