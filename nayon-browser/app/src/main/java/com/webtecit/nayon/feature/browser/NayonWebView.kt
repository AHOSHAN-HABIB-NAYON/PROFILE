package com.webtecit.nayon.feature.browser

import android.annotation.SuppressLint
import android.content.Context
import android.view.MotionEvent
import android.webkit.WebView

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
}
