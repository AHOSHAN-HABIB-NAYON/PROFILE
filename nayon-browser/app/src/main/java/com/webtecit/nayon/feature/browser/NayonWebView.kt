package com.webtecit.nayon.feature.browser

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Rect
import android.view.ActionMode
import android.view.Menu
import android.view.MenuItem
import android.view.MotionEvent
import android.view.View
import android.webkit.WebView
import com.webtecit.nayon.R
import org.json.JSONArray

/**
 * WebView that reports what the browser chrome needs to behave like Chrome:
 * whether a pull went past the top of the page (pull-to-refresh), and how much the page can scroll.
 */
class NayonWebView(context: Context) : WebView(context) {

    /**
     * True once the current gesture pulled down past the top of the page itself. Pages that scroll
     * an inner panel (Google AI Mode, maps, chats) keep this false while the panel scrolls, so
     * pull-to-refresh no longer fights the page.
     */
    var pulledPastTop = false
        private set

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (event.actionMasked == MotionEvent.ACTION_DOWN) pulledPastTop = false
        return super.onTouchEvent(event)
    }

    override fun onOverScrolled(scrollX: Int, scrollY: Int, clampedX: Boolean, clampedY: Boolean) {
        if (clampedY && scrollY <= 0) pulledPastTop = true
        super.onOverScrolled(scrollX, scrollY, clampedX, clampedY)
    }

    /** How far the page can scroll beyond the visible height, in pixels. */
    @Suppress("DEPRECATION")
    val scrollRoom: Int
        get() = (contentHeight * scale).toInt() - height

    /** Opens a web search for the selected text in NAYON (set by the browser). */
    var onWebSearch: ((String) -> Unit)? = null

    // ---- Text selection menu ---------------------------------------------------------------
    // WebView supplies Copy, Cut, Paste, Select all and Share. NAYON adds its own Web search
    // (results open in a NAYON tab) in place of WebView's, which hands the text to other apps.

    override fun startActionMode(callback: ActionMode.Callback, type: Int): ActionMode? =
        super.startActionMode(SelectionCallback(callback), type)

    override fun startActionMode(callback: ActionMode.Callback): ActionMode? =
        super.startActionMode(SelectionCallback(callback))

    private inner class SelectionCallback(private val base: ActionMode.Callback) : ActionMode.Callback2() {
        override fun onCreateActionMode(mode: ActionMode, menu: Menu): Boolean =
            base.onCreateActionMode(mode, menu).also { tidy(menu) }

        override fun onPrepareActionMode(mode: ActionMode, menu: Menu): Boolean =
            base.onPrepareActionMode(mode, menu).also { tidy(menu) }

        override fun onActionItemClicked(mode: ActionMode, item: MenuItem): Boolean {
            if (item.itemId != R.id.menu_web_search) return base.onActionItemClicked(mode, item)
            evaluateJavascript("window.getSelection().toString()") { raw ->
                val text = runCatching { JSONArray("[$raw]").optString(0) }.getOrDefault("").trim()
                if (text.isNotEmpty()) onWebSearch?.invoke(text)
            }
            mode.finish()
            return true
        }

        override fun onDestroyActionMode(mode: ActionMode) = base.onDestroyActionMode(mode)

        override fun onGetContentRect(mode: ActionMode, view: View, outRect: Rect) {
            if (base is ActionMode.Callback2) base.onGetContentRect(mode, view, outRect)
            else super.onGetContentRect(mode, view, outRect)
        }

        private fun tidy(menu: Menu) {
            if (onWebSearch == null) return
            val ours = context.getString(R.string.action_web_search)
            // Drop WebView's own web-search item (same label, no app intent) so it isn't shown twice.
            (menu.size() - 1 downTo 0).map { menu.getItem(it) }
                .filter { it.itemId != R.id.menu_web_search && it.intent == null && it.title?.toString().equals(ours, ignoreCase = true) }
                .forEach { menu.removeItem(it.itemId) }
            if (menu.findItem(R.id.menu_web_search) == null) {
                menu.add(Menu.NONE, R.id.menu_web_search, 50, ours).setShowAsAction(MenuItem.SHOW_AS_ACTION_IF_ROOM)
            }
        }
    }
}
