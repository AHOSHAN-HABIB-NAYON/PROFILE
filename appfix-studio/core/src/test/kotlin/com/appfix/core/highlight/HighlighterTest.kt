package com.appfix.core.highlight

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class HighlighterTest {
    private fun kindAt(spans: List<Span>, line: Int, col: Int): TokenKind =
        spans.filter { it.line == line && it.column <= col }.maxByOrNull { it.column }?.kind ?: TokenKind.NORMAL

    @Test
    fun `kotlin tokens`() {
        val code = "package a\n/* block\ncomment */\n@Composable fun Greeting(name: String) = \"Hi \$name\" // note\nval x = 42"
        val s = Highlighter.highlight(code, SyntaxLanguage.KOTLIN)
        assertEquals(TokenKind.KEYWORD, kindAt(s, 0, 0))
        assertEquals(TokenKind.COMMENT, kindAt(s, 1, 3))
        assertEquals("block comment continues on the next line", TokenKind.COMMENT, kindAt(s, 2, 2))
        assertEquals(TokenKind.NORMAL, kindAt(s, 2, 11))
        assertEquals(TokenKind.ANNOTATION, kindAt(s, 3, 1))
        assertEquals(TokenKind.KEYWORD, kindAt(s, 3, 12))
        assertEquals(TokenKind.FUNCTION, kindAt(s, 3, 17))
        assertEquals(TokenKind.TYPE, kindAt(s, 3, 32))
        assertEquals(TokenKind.STRING, kindAt(s, 3, 43))
        assertEquals(TokenKind.COMMENT, kindAt(s, 3, 54))
        assertEquals(TokenKind.NUMBER, kindAt(s, 4, 8))
    }

    @Test
    fun `xml tokens`() {
        val xml = "<!-- c -->\n<TextView android:text=\"@string/hi\" />\n&amp;"
        val s = Highlighter.highlight(xml, SyntaxLanguage.XML)
        assertEquals(TokenKind.COMMENT, kindAt(s, 0, 2))
        assertEquals(TokenKind.TAG, kindAt(s, 1, 2))
        assertEquals(TokenKind.ATTR_NAME, kindAt(s, 1, 12))
        assertEquals(TokenKind.ATTR_VALUE, kindAt(s, 1, 25))
        assertEquals(TokenKind.KEYWORD, kindAt(s, 2, 1))
    }

    @Test
    fun `json and properties tokens`() {
        val s = Highlighter.highlight("{\"key\": \"value\", \"n\": 12, \"b\": true}", SyntaxLanguage.JSON)
        assertEquals(TokenKind.ATTR_NAME, kindAt(s, 0, 2))
        assertEquals(TokenKind.STRING, kindAt(s, 0, 10))
        assertEquals(TokenKind.NUMBER, kindAt(s, 0, 23))
        assertEquals(TokenKind.KEYWORD, kindAt(s, 0, 32))
        val p = Highlighter.highlight("# comment\norg.gradle.jvmargs=-Xmx2g\nenabled=true", SyntaxLanguage.PROPERTIES)
        assertEquals(TokenKind.COMMENT, kindAt(p, 0, 3))
        assertEquals(TokenKind.ATTR_NAME, kindAt(p, 1, 2))
        assertEquals(TokenKind.KEYWORD, kindAt(p, 2, 9))
    }

    @Test
    fun `broken input never throws and language detection works`() {
        val samples = listOf("\"unterminated", "/* open", "<tag attr=\"x", "{\"a\": [", "\"\"\"", "@", "0x", ".method", "a=")
        for (lang in SyntaxLanguage.entries) for (s in samples) Highlighter.highlight(s, lang)
        assertEquals(SyntaxLanguage.KOTLIN, Highlighter.languageFor("build.gradle.kts"))
        assertEquals(SyntaxLanguage.GROOVY, Highlighter.languageFor("build.gradle"))
        assertEquals(SyntaxLanguage.XML, Highlighter.languageFor("AndroidManifest.xml"))
        assertEquals(SyntaxLanguage.PLAIN, Highlighter.languageFor("LICENSE"))
    }

    @Test
    fun `large files are highlighted quickly and can be cancelled`() {
        val big = buildString { repeat(20_000) { append("val item$it = listOf(\"a\", 1, 2.5) // row $it\n") } }
        val start = System.nanoTime()
        val spans = Highlighter.highlight(big, SyntaxLanguage.KOTLIN)
        val ms = (System.nanoTime() - start) / 1_000_000
        assertTrue("took $ms ms", ms < 3000)
        assertTrue(spans.size > 100_000)
        var calls = 0
        val partial = Highlighter.highlight(big, SyntaxLanguage.KOTLIN) { ++calls > 2 }
        assertTrue(partial.size < spans.size)
    }
}
