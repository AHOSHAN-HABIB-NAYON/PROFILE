package com.appfix.studio.ui.editor

import androidx.compose.material3.ColorScheme
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import com.appfix.core.highlight.Highlighter
import com.appfix.core.highlight.SyntaxLanguage
import com.appfix.core.highlight.TokenKind
import io.github.rosemoe.sora.lang.EmptyLanguage
import io.github.rosemoe.sora.lang.analysis.AnalyzeManager
import io.github.rosemoe.sora.lang.analysis.SimpleAnalyzeManager
import io.github.rosemoe.sora.lang.styling.MappedSpans
import io.github.rosemoe.sora.lang.styling.Styles
import io.github.rosemoe.sora.lang.styling.TextStyle
import io.github.rosemoe.sora.text.ContentReference
import io.github.rosemoe.sora.widget.SymbolPairMatch
import io.github.rosemoe.sora.widget.schemes.EditorColorScheme

/** Files larger than this are edited without syntax colouring to keep typing responsive. */
const val MAX_HIGHLIGHT_CHARS = 600_000

/**
 * sora-editor language backed by AppFix Studio's own lexers (see core/highlight).
 * Highlighting runs on sora's background analysis thread and is cancelled when text changes.
 */
class AppFixLanguage(private val syntax: SyntaxLanguage) : EmptyLanguage() {
    private val pairs = SymbolPairMatch.DefaultSymbolPairs()

    private val manager = object : SimpleAnalyzeManager<Unit>() {
        override fun analyze(text: StringBuilder, delegate: SimpleAnalyzeManager<Unit>.Delegate<Unit>): Styles {
            val builder = MappedSpans.Builder(1024)
            val lang = if (text.length > MAX_HIGHLIGHT_CHARS) SyntaxLanguage.PLAIN else syntax
            val spans = Highlighter.highlight(text, lang) { delegate.isCancelled }
            var currentLine = -1
            builder.addIfNeeded(0, 0, styleOf(TokenKind.NORMAL))
            for (s in spans) {
                if (s.line != currentLine) {
                    currentLine = s.line
                    if (s.column > 0) builder.addIfNeeded(s.line, 0, styleOf(TokenKind.NORMAL))
                }
                builder.addIfNeeded(s.line, s.column, styleOf(s.kind))
            }
            var lines = 0
            for (i in text.indices) if (text[i] == '\n') lines++
            builder.determine(lines)
            return Styles(builder.build())
        }
    }

    override fun getAnalyzeManager(): AnalyzeManager = manager

    override fun getSymbolPairs(): SymbolPairMatch = pairs

    override fun useTab(): Boolean = false

    /** Indents one level after an unclosed {, ( or [ (and after an opening XML tag). */
    override fun getIndentAdvance(content: ContentReference, line: Int, column: Int): Int {
        val text = content.getLine(line).take(column)
        var depth = 0
        for (c in text) when (c) {
            '{', '(', '[' -> depth++
            '}', ')', ']' -> depth--
        }
        val xmlOpen = (syntax == SyntaxLanguage.XML || syntax == SyntaxLanguage.HTML) &&
            text.trimEnd().endsWith(">") && !text.trimEnd().endsWith("/>") && Regex("<[A-Za-z][^/!?]*>\\s*$").containsMatchIn(text) && !text.contains("</")
        return if (depth > 0 || xmlOpen) 4 else 0
    }

    override fun destroy() {
        manager.destroy()
    }

    companion object {
        fun styleOf(kind: TokenKind): Long = when (kind) {
            TokenKind.NORMAL -> TextStyle.makeStyle(EditorColorScheme.TEXT_NORMAL)
            TokenKind.KEYWORD -> TextStyle.makeStyle(EditorColorScheme.KEYWORD, 0, true, false, false)
            TokenKind.STRING -> TextStyle.makeStyle(EditorColorScheme.LITERAL)
            TokenKind.NUMBER -> TextStyle.makeStyle(EditorColorScheme.IDENTIFIER_VAR)
            TokenKind.COMMENT -> TextStyle.makeStyle(EditorColorScheme.COMMENT, 0, false, true, false)
            TokenKind.ANNOTATION -> TextStyle.makeStyle(EditorColorScheme.ANNOTATION)
            TokenKind.FUNCTION -> TextStyle.makeStyle(EditorColorScheme.FUNCTION_NAME)
            TokenKind.TYPE -> TextStyle.makeStyle(EditorColorScheme.IDENTIFIER_NAME)
            TokenKind.TAG -> TextStyle.makeStyle(EditorColorScheme.HTML_TAG)
            TokenKind.ATTR_NAME -> TextStyle.makeStyle(EditorColorScheme.ATTRIBUTE_NAME)
            TokenKind.ATTR_VALUE -> TextStyle.makeStyle(EditorColorScheme.ATTRIBUTE_VALUE)
            TokenKind.OPERATOR -> TextStyle.makeStyle(EditorColorScheme.OPERATOR)
        }

    }
}

/** Builds an editor colour scheme that matches the app's Material colours. */
fun editorColorScheme(c: ColorScheme, dark: Boolean): EditorColorScheme {
    val s = EditorColorScheme()
    fun set(id: Int, color: Color) = s.setColor(id, color.toArgb())
    set(EditorColorScheme.WHOLE_BACKGROUND, c.surfaceContainerLowest)
    set(EditorColorScheme.TEXT_NORMAL, c.onSurface)
    set(EditorColorScheme.LINE_NUMBER_BACKGROUND, c.surfaceContainerLow)
    set(EditorColorScheme.LINE_NUMBER, c.onSurfaceVariant.copy(alpha = 0.7f))
    set(EditorColorScheme.LINE_NUMBER_CURRENT, c.primary)
    set(EditorColorScheme.LINE_NUMBER_PANEL, c.inverseSurface)
    set(EditorColorScheme.LINE_NUMBER_PANEL_TEXT, c.inverseOnSurface)
    set(EditorColorScheme.LINE_DIVIDER, c.outlineVariant)
    set(EditorColorScheme.CURRENT_LINE, c.primaryContainer.copy(alpha = 0.35f))
    set(EditorColorScheme.SELECTED_TEXT_BACKGROUND, c.primary.copy(alpha = 0.28f))
    set(EditorColorScheme.SELECTION_INSERT, c.primary)
    set(EditorColorScheme.SELECTION_HANDLE, c.primary)
    set(EditorColorScheme.MATCHED_TEXT_BACKGROUND, c.tertiaryContainer)
    set(EditorColorScheme.BLOCK_LINE, c.outlineVariant)
    set(EditorColorScheme.BLOCK_LINE_CURRENT, c.outline)
    set(EditorColorScheme.SCROLL_BAR_THUMB, c.outline.copy(alpha = 0.5f))
    set(EditorColorScheme.SCROLL_BAR_THUMB_PRESSED, c.primary)
    set(EditorColorScheme.HIGHLIGHTED_DELIMITERS_FOREGROUND, c.primary)
    set(EditorColorScheme.COMPLETION_WND_BACKGROUND, c.surfaceContainerHigh)
    set(EditorColorScheme.TEXT_ACTION_WINDOW_BACKGROUND, c.surfaceContainerHigh)
    set(EditorColorScheme.TEXT_ACTION_WINDOW_ICON_COLOR, c.onSurface)
    if (dark) {
        set(EditorColorScheme.KEYWORD, Color(0xFFCF8EF4))
        set(EditorColorScheme.LITERAL, Color(0xFF9CD67C))
        set(EditorColorScheme.IDENTIFIER_VAR, Color(0xFF6FC3FF))
        set(EditorColorScheme.COMMENT, Color(0xFF8A8F98))
        set(EditorColorScheme.ANNOTATION, Color(0xFFE5C07B))
        set(EditorColorScheme.FUNCTION_NAME, Color(0xFF7FB6FF))
        set(EditorColorScheme.IDENTIFIER_NAME, Color(0xFFFFB86C))
        set(EditorColorScheme.HTML_TAG, Color(0xFFFF7B9C))
        set(EditorColorScheme.ATTRIBUTE_NAME, Color(0xFFE5C07B))
        set(EditorColorScheme.ATTRIBUTE_VALUE, Color(0xFF9CD67C))
        set(EditorColorScheme.OPERATOR, Color(0xFF8BE9FD))
    } else {
        set(EditorColorScheme.KEYWORD, Color(0xFF7B2FBF))
        set(EditorColorScheme.LITERAL, Color(0xFF1B7F3B))
        set(EditorColorScheme.IDENTIFIER_VAR, Color(0xFF0B57C9))
        set(EditorColorScheme.COMMENT, Color(0xFF6B7280))
        set(EditorColorScheme.ANNOTATION, Color(0xFF9A5B00))
        set(EditorColorScheme.FUNCTION_NAME, Color(0xFF00639B))
        set(EditorColorScheme.IDENTIFIER_NAME, Color(0xFFB0440E))
        set(EditorColorScheme.HTML_TAG, Color(0xFFB0124A))
        set(EditorColorScheme.ATTRIBUTE_NAME, Color(0xFF9A5B00))
        set(EditorColorScheme.ATTRIBUTE_VALUE, Color(0xFF1B7F3B))
        set(EditorColorScheme.OPERATOR, Color(0xFF475569))
    }
    return s
}
