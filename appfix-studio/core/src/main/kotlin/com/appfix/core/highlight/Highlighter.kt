package com.appfix.core.highlight

enum class TokenKind { NORMAL, KEYWORD, STRING, NUMBER, COMMENT, ANNOTATION, FUNCTION, TYPE, TAG, ATTR_NAME, ATTR_VALUE, OPERATOR }

/** A style change at [column] of [line] (both 0-based). It lasts until the next span on the same line. */
data class Span(val line: Int, val column: Int, val kind: TokenKind)

enum class SyntaxLanguage { KOTLIN, JAVA, GROOVY, JAVASCRIPT, DART, XML, HTML, JSON, CSS, PROPERTIES, YAML, TOML, SMALI, PLAIN }

/**
 * Small, fast lexical highlighters for the file types AppFix Studio edits. They are not parsers:
 * the goal is readable colouring that never throws, even on broken code.
 */
object Highlighter {
    fun languageFor(fileName: String): SyntaxLanguage = when (fileName.substringAfterLast('.', "").lowercase()) {
        "kt", "kts" -> SyntaxLanguage.KOTLIN
        "java", "aidl" -> SyntaxLanguage.JAVA
        "gradle" -> SyntaxLanguage.GROOVY
        "js", "jsx", "ts", "tsx", "mjs", "cjs" -> SyntaxLanguage.JAVASCRIPT
        "dart" -> SyntaxLanguage.DART
        "xml", "svg", "plist" -> SyntaxLanguage.XML
        "html", "htm" -> SyntaxLanguage.HTML
        "json" -> SyntaxLanguage.JSON
        "css" -> SyntaxLanguage.CSS
        "properties", "pro", "cfg", "ini" -> SyntaxLanguage.PROPERTIES
        "yaml", "yml" -> SyntaxLanguage.YAML
        "toml" -> SyntaxLanguage.TOML
        "smali" -> SyntaxLanguage.SMALI
        else -> if (fileName == "gradlew" || fileName.endsWith(".sh")) SyntaxLanguage.PROPERTIES else SyntaxLanguage.PLAIN
    }

    fun highlight(text: CharSequence, language: SyntaxLanguage, cancelled: () -> Boolean = { false }): List<Span> {
        val out = SpanSink()
        when (language) {
            SyntaxLanguage.KOTLIN, SyntaxLanguage.JAVA, SyntaxLanguage.GROOVY, SyntaxLanguage.JAVASCRIPT, SyntaxLanguage.DART ->
                CLike(language).run(text, out, cancelled)
            SyntaxLanguage.XML, SyntaxLanguage.HTML -> Markup.run(text, out, cancelled)
            SyntaxLanguage.JSON -> Json.run(text, out, cancelled)
            SyntaxLanguage.CSS -> Css.run(text, out, cancelled)
            SyntaxLanguage.PROPERTIES, SyntaxLanguage.YAML, SyntaxLanguage.TOML -> KeyValue(language).run(text, out, cancelled)
            SyntaxLanguage.SMALI -> Smali.run(text, out, cancelled)
            SyntaxLanguage.PLAIN -> Unit
        }
        return out.spans
    }
}

/** Collects spans, tracking line/column while lexers walk the text by absolute offset. */
internal class SpanSink {
    val spans = ArrayList<Span>()
    private var line = 0
    private var lineStart = 0
    private var lastKindOnLine: TokenKind? = null
    private var scanned = 0

    /** Must be called with non-decreasing offsets. */
    fun mark(text: CharSequence, offset: Int, kind: TokenKind) {
        advance(text, offset)
        if (kind == lastKindOnLine) return
        val col = offset - lineStart
        val last = spans.lastOrNull()
        if (last != null && last.line == line && last.column == col) {
            // A zero-width style is replaced by the one that follows it.
            spans[spans.lastIndex] = Span(line, col, kind)
            val previous = spans.getOrNull(spans.lastIndex - 1)
            if (previous != null && previous.line == line && previous.kind == kind) spans.removeAt(spans.lastIndex)
        } else {
            spans += Span(line, col, kind)
        }
        lastKindOnLine = kind
    }

    private fun advance(text: CharSequence, offset: Int) {
        var i = scanned
        while (i < offset && i < text.length) {
            if (text[i] == '\n') {
                line++
                lineStart = i + 1
                // A token that spans lines (block comments, multi-line strings) continues on the next line.
                val carry = lastKindOnLine
                lastKindOnLine = null
                if (carry != null && carry != TokenKind.NORMAL) {
                    spans += Span(line, 0, carry)
                    lastKindOnLine = carry
                }
            }
            i++
        }
        scanned = maxOf(scanned, i)
    }
}

private fun isIdentStart(c: Char) = c.isLetter() || c == '_' || c == '$'
private fun isIdentPart(c: Char) = c.isLetterOrDigit() || c == '_' || c == '$'

private class CLike(private val lang: SyntaxLanguage) {
    private val keywords: Set<String> = when (lang) {
        SyntaxLanguage.KOTLIN -> setOf(
            "package", "import", "class", "interface", "object", "fun", "val", "var", "if", "else", "when", "for", "while", "do", "return",
            "break", "continue", "throw", "try", "catch", "finally", "in", "is", "as", "null", "true", "false", "this", "super", "typealias",
            "private", "public", "protected", "internal", "open", "abstract", "final", "override", "data", "sealed", "enum", "companion",
            "inline", "suspend", "operator", "infix", "lateinit", "const", "vararg", "out", "reified", "annotation", "by", "init", "constructor",
            "get", "set", "where", "crossinline", "noinline", "tailrec", "external", "inner", "value", "expect", "actual", "it",
        )
        SyntaxLanguage.JAVA -> setOf(
            "package", "import", "class", "interface", "enum", "extends", "implements", "new", "return", "if", "else", "for", "while", "do",
            "switch", "case", "default", "break", "continue", "throw", "throws", "try", "catch", "finally", "public", "private", "protected",
            "static", "final", "abstract", "synchronized", "volatile", "transient", "native", "void", "boolean", "int", "long", "short", "byte",
            "char", "float", "double", "null", "true", "false", "this", "super", "instanceof", "var", "record", "yield", "sealed", "permits",
        )
        SyntaxLanguage.GROOVY -> setOf(
            "def", "plugins", "apply", "plugin", "android", "dependencies", "repositories", "implementation", "api", "compileOnly", "runtimeOnly",
            "testImplementation", "androidTestImplementation", "kapt", "ksp", "if", "else", "for", "return", "true", "false", "null", "new", "id",
            "version", "include", "buildscript", "allprojects", "task", "classpath", "maven", "google", "mavenCentral",
        )
        SyntaxLanguage.DART -> setOf(
            "import", "export", "library", "part", "class", "extends", "implements", "with", "mixin", "enum", "void", "var", "final", "const",
            "late", "required", "return", "if", "else", "for", "while", "do", "switch", "case", "default", "break", "continue", "new", "null",
            "true", "false", "this", "super", "async", "await", "yield", "static", "dynamic", "try", "catch", "finally", "throw", "is", "as", "in",
        )
        else -> setOf(
            "var", "let", "const", "function", "return", "if", "else", "for", "while", "do", "switch", "case", "default", "break", "continue",
            "new", "class", "extends", "import", "export", "from", "async", "await", "try", "catch", "finally", "throw", "typeof", "instanceof",
            "null", "undefined", "true", "false", "this", "super", "of", "in", "yield", "interface", "type", "enum", "public", "private", "static",
        )
    }
    private val tripleStrings = lang == SyntaxLanguage.KOTLIN || lang == SyntaxLanguage.GROOVY || lang == SyntaxLanguage.DART
    private val templates = lang == SyntaxLanguage.JAVASCRIPT

    fun run(t: CharSequence, out: SpanSink, cancelled: () -> Boolean) {
        var i = 0
        val n = t.length
        var steps = 0
        while (i < n) {
            if (++steps % 4096 == 0 && cancelled()) return
            val c = t[i]
            when {
                c == '/' && i + 1 < n && t[i + 1] == '/' -> {
                    out.mark(t, i, TokenKind.COMMENT)
                    while (i < n && t[i] != '\n') i++
                    out.mark(t, i, TokenKind.NORMAL)
                }
                c == '/' && i + 1 < n && t[i + 1] == '*' -> {
                    out.mark(t, i, TokenKind.COMMENT)
                    val end = indexOf(t, "*/", i + 2)
                    i = if (end < 0) n else end + 2
                    out.mark(t, i, TokenKind.NORMAL)
                }
                lang == SyntaxLanguage.GROOVY && c == '#' && i + 1 < n && t[i + 1] == '!' -> {
                    out.mark(t, i, TokenKind.COMMENT); while (i < n && t[i] != '\n') i++; out.mark(t, i, TokenKind.NORMAL)
                }
                tripleStrings && c == '"' && startsWith(t, i, "\"\"\"") -> {
                    out.mark(t, i, TokenKind.STRING)
                    val end = indexOf(t, "\"\"\"", i + 3)
                    i = if (end < 0) n else end + 3
                    out.mark(t, i, TokenKind.NORMAL)
                }
                c == '"' || c == '\'' || (templates && c == '`') -> {
                    out.mark(t, i, TokenKind.STRING)
                    i = skipString(t, i, c, multiLine = c == '`')
                    out.mark(t, i, TokenKind.NORMAL)
                }
                c == '@' && i + 1 < n && isIdentStart(t[i + 1]) -> {
                    out.mark(t, i, TokenKind.ANNOTATION)
                    i++
                    while (i < n && (isIdentPart(t[i]) || t[i] == '.')) i++
                    out.mark(t, i, TokenKind.NORMAL)
                }
                c.isDigit() -> {
                    out.mark(t, i, TokenKind.NUMBER)
                    while (i < n && (t[i].isLetterOrDigit() || t[i] == '.' || t[i] == '_') && !(t[i] == '.' && i + 1 < n && !t[i + 1].isDigit())) i++
                    out.mark(t, i, TokenKind.NORMAL)
                }
                isIdentStart(c) -> {
                    val s = i
                    while (i < n && isIdentPart(t[i])) i++
                    val word = t.subSequence(s, i).toString()
                    var j = i
                    while (j < n && (t[j] == ' ' || t[j] == '\t')) j++
                    val kind = when {
                        word in keywords -> TokenKind.KEYWORD
                        j < n && t[j] == '(' -> TokenKind.FUNCTION
                        word[0].isUpperCase() -> TokenKind.TYPE
                        else -> TokenKind.NORMAL
                    }
                    out.mark(t, s, kind)
                    out.mark(t, i, TokenKind.NORMAL)
                }
                c in "+-*/%=<>!&|^~?:" -> {
                    out.mark(t, i, TokenKind.OPERATOR)
                    i++
                    out.mark(t, i, TokenKind.NORMAL)
                }
                else -> i++
            }
        }
    }
}

private fun startsWith(t: CharSequence, i: Int, s: String): Boolean {
    if (i + s.length > t.length) return false
    for (k in s.indices) if (t[i + k] != s[k]) return false
    return true
}

private fun indexOf(t: CharSequence, s: String, from: Int): Int {
    var i = from
    while (i <= t.length - s.length) {
        if (startsWith(t, i, s)) return i
        i++
    }
    return -1
}

/** Returns the offset just after the closing quote (or end of line for unterminated strings). */
private fun skipString(t: CharSequence, start: Int, quote: Char, multiLine: Boolean): Int {
    var i = start + 1
    while (i < t.length) {
        val c = t[i]
        if (c == '\\') { i += 2; continue }
        if (c == quote) return i + 1
        if (c == '\n' && !multiLine) return i
        i++
    }
    return t.length
}

private object Markup {
    fun run(t: CharSequence, out: SpanSink, cancelled: () -> Boolean) {
        var i = 0
        val n = t.length
        var steps = 0
        while (i < n) {
            if (++steps % 4096 == 0 && cancelled()) return
            when {
                startsWith(t, i, "<!--") -> {
                    out.mark(t, i, TokenKind.COMMENT)
                    val e = indexOf(t, "-->", i + 4)
                    i = if (e < 0) n else e + 3
                    out.mark(t, i, TokenKind.NORMAL)
                }
                startsWith(t, i, "<![CDATA[") -> {
                    out.mark(t, i, TokenKind.STRING)
                    val e = indexOf(t, "]]>", i)
                    i = if (e < 0) n else e + 3
                    out.mark(t, i, TokenKind.NORMAL)
                }
                t[i] == '<' -> {
                    out.mark(t, i, TokenKind.TAG)
                    i++
                    if (i < n && (t[i] == '/' || t[i] == '?' || t[i] == '!')) i++
                    while (i < n && !t[i].isWhitespace() && t[i] != '>' && t[i] != '/') i++
                    // attributes
                    while (i < n && t[i] != '>') {
                        val c = t[i]
                        when {
                            c == '"' || c == '\'' -> {
                                out.mark(t, i, TokenKind.ATTR_VALUE)
                                val e = t.indexOfChar(c, i + 1)
                                i = if (e < 0) n else e + 1
                            }
                            c == '/' || c == '?' -> { out.mark(t, i, TokenKind.TAG); i++ }
                            c.isWhitespace() || c == '=' -> { out.mark(t, i, TokenKind.NORMAL); i++ }
                            else -> {
                                out.mark(t, i, TokenKind.ATTR_NAME)
                                while (i < n && !t[i].isWhitespace() && t[i] != '=' && t[i] != '>' && t[i] != '/') i++
                            }
                        }
                    }
                    if (i < n) { out.mark(t, i, TokenKind.TAG); i++ }
                    out.mark(t, i, TokenKind.NORMAL)
                }
                t[i] == '&' -> {
                    val e = t.indexOfChar(';', i)
                    if (e in (i + 1)..(i + 10)) {
                        out.mark(t, i, TokenKind.KEYWORD); i = e + 1; out.mark(t, i, TokenKind.NORMAL)
                    } else i++
                }
                else -> i++
            }
        }
    }
}

private fun CharSequence.indexOfChar(c: Char, from: Int): Int {
    for (k in from until length) if (this[k] == c) return k
    return -1
}

private object Json {
    fun run(t: CharSequence, out: SpanSink, cancelled: () -> Boolean) {
        var i = 0
        val n = t.length
        var steps = 0
        while (i < n) {
            if (++steps % 4096 == 0 && cancelled()) return
            val c = t[i]
            when {
                c == '"' -> {
                    val end = skipString(t, i, '"', false)
                    var j = end
                    while (j < n && t[j].isWhitespace()) j++
                    out.mark(t, i, if (j < n && t[j] == ':') TokenKind.ATTR_NAME else TokenKind.STRING)
                    i = end
                    out.mark(t, i, TokenKind.NORMAL)
                }
                c == '-' || c.isDigit() -> {
                    out.mark(t, i, TokenKind.NUMBER)
                    i++
                    while (i < n && (t[i].isDigit() || t[i] in ".eE+-")) i++
                    out.mark(t, i, TokenKind.NORMAL)
                }
                c.isLetter() -> {
                    val s = i
                    while (i < n && t[i].isLetter()) i++
                    out.mark(t, s, TokenKind.KEYWORD)
                    out.mark(t, i, TokenKind.NORMAL)
                }
                c == '/' && i + 1 < n && t[i + 1] == '/' -> {
                    out.mark(t, i, TokenKind.COMMENT); while (i < n && t[i] != '\n') i++; out.mark(t, i, TokenKind.NORMAL)
                }
                else -> i++
            }
        }
    }
}

private object Css {
    fun run(t: CharSequence, out: SpanSink, cancelled: () -> Boolean) {
        var i = 0
        val n = t.length
        var depth = 0
        var steps = 0
        while (i < n) {
            if (++steps % 4096 == 0 && cancelled()) return
            val c = t[i]
            when {
                c == '/' && i + 1 < n && t[i + 1] == '*' -> {
                    out.mark(t, i, TokenKind.COMMENT)
                    val e = indexOf(t, "*/", i + 2)
                    i = if (e < 0) n else e + 2
                    out.mark(t, i, TokenKind.NORMAL)
                }
                c == '{' -> { depth++; i++ }
                c == '}' -> { depth = maxOf(0, depth - 1); i++ }
                c == '"' || c == '\'' -> { out.mark(t, i, TokenKind.STRING); i = skipString(t, i, c, false); out.mark(t, i, TokenKind.NORMAL) }
                c == '#' && depth > 0 -> {
                    out.mark(t, i, TokenKind.NUMBER); i++
                    while (i < n && t[i].isLetterOrDigit()) i++
                    out.mark(t, i, TokenKind.NORMAL)
                }
                c.isDigit() && depth > 0 -> {
                    out.mark(t, i, TokenKind.NUMBER)
                    while (i < n && (t[i].isLetterOrDigit() || t[i] == '.' || t[i] == '%')) i++
                    out.mark(t, i, TokenKind.NORMAL)
                }
                (c.isLetter() || c == '-' || c == '.' || c == '#') && i < n -> {
                    val s = i
                    while (i < n && (t[i].isLetterOrDigit() || t[i] in "-_.#")) i++
                    var j = i
                    while (j < n && t[j] == ' ') j++
                    val kind = when {
                        depth == 0 -> TokenKind.TAG
                        j < n && t[j] == ':' -> TokenKind.ATTR_NAME
                        else -> TokenKind.ATTR_VALUE
                    }
                    if (s == i) i++ else { out.mark(t, s, kind); out.mark(t, i, TokenKind.NORMAL) }
                }
                else -> i++
            }
        }
    }
}

private class KeyValue(private val lang: SyntaxLanguage) {
    fun run(t: CharSequence, out: SpanSink, cancelled: () -> Boolean) {
        var lineStart = 0
        val n = t.length
        var lines = 0
        while (lineStart <= n) {
            if (++lines % 512 == 0 && cancelled()) return
            var lineEnd = t.indexOfChar('\n', lineStart)
            if (lineEnd < 0) lineEnd = n
            var i = lineStart
            while (i < lineEnd && (t[i] == ' ' || t[i] == '\t')) i++
            if (i < lineEnd) {
                val c = t[i]
                when {
                    c == '#' || (lang == SyntaxLanguage.PROPERTIES && (c == '!' || c == ';')) -> {
                        out.mark(t, i, TokenKind.COMMENT); out.mark(t, lineEnd, TokenKind.NORMAL)
                    }
                    lang == SyntaxLanguage.TOML && c == '[' -> { out.mark(t, i, TokenKind.TAG); out.mark(t, lineEnd, TokenKind.NORMAL) }
                    else -> {
                        val sepChars = if (lang == SyntaxLanguage.YAML) ":" else "=:"
                        var sep = i
                        while (sep < lineEnd && t[sep] !in sepChars) sep++
                        if (sep < lineEnd) {
                            out.mark(t, i, TokenKind.ATTR_NAME)
                            out.mark(t, sep, TokenKind.OPERATOR)
                            var v = sep + 1
                            out.mark(t, v, TokenKind.NORMAL)
                            while (v < lineEnd && t[v] == ' ') v++
                            if (v < lineEnd) {
                                val vc = t[v]
                                val kind = when {
                                    vc == '"' || vc == '\'' -> TokenKind.STRING
                                    vc.isDigit() || vc == '-' && v + 1 < lineEnd && t[v + 1].isDigit() -> TokenKind.NUMBER
                                    t.subSequence(v, lineEnd).toString().trim() in setOf("true", "false", "null", "yes", "no") -> TokenKind.KEYWORD
                                    else -> TokenKind.ATTR_VALUE
                                }
                                out.mark(t, v, kind)
                                out.mark(t, lineEnd, TokenKind.NORMAL)
                            }
                        }
                    }
                }
            }
            lineStart = lineEnd + 1
        }
    }
}

private object Smali {
    fun run(t: CharSequence, out: SpanSink, cancelled: () -> Boolean) {
        var i = 0
        val n = t.length
        var steps = 0
        while (i < n) {
            if (++steps % 4096 == 0 && cancelled()) return
            val c = t[i]
            when {
                c == '#' -> { out.mark(t, i, TokenKind.COMMENT); while (i < n && t[i] != '\n') i++; out.mark(t, i, TokenKind.NORMAL) }
                c == '"' -> { out.mark(t, i, TokenKind.STRING); i = skipString(t, i, '"', false); out.mark(t, i, TokenKind.NORMAL) }
                c == '.' && i + 1 < n && t[i + 1].isLetter() -> {
                    out.mark(t, i, TokenKind.KEYWORD); i++
                    while (i < n && (t[i].isLetterOrDigit() || t[i] == '-')) i++
                    out.mark(t, i, TokenKind.NORMAL)
                }
                (c == 'v' || c == 'p') && i + 1 < n && t[i + 1].isDigit() && (i == 0 || !isIdentPart(t[i - 1])) -> {
                    out.mark(t, i, TokenKind.ANNOTATION); i++
                    while (i < n && t[i].isDigit()) i++
                    out.mark(t, i, TokenKind.NORMAL)
                }
                c == 'L' && (i == 0 || !isIdentPart(t[i - 1])) && t.indexOfChar(';', i).let { it in (i + 2)..(i + 300) && !t.subSequence(i, it).contains(' ') && !t.subSequence(i, it).contains('\n') } -> {
                    val e = t.indexOfChar(';', i)
                    out.mark(t, i, TokenKind.TYPE); i = e + 1; out.mark(t, i, TokenKind.NORMAL)
                }
                c.isLetter() && (i == 0 || t[i - 1].isWhitespace()) -> {
                    val s = i
                    while (i < n && (t[i].isLetterOrDigit() || t[i] == '-' || t[i] == '/')) i++
                    val word = t.subSequence(s, i).toString()
                    if (word.startsWith("invoke") || word.startsWith("move") || word.startsWith("const") || word.startsWith("return") ||
                        word.startsWith("if-") || word.startsWith("goto") || word.startsWith("new-") || word.startsWith("iget") ||
                        word.startsWith("iput") || word.startsWith("sget") || word.startsWith("sput") || word.startsWith("check-cast")
                    ) {
                        out.mark(t, s, TokenKind.FUNCTION); out.mark(t, i, TokenKind.NORMAL)
                    }
                }
                c == '0' && i + 1 < n && t[i + 1] == 'x' || c.isDigit() && (i == 0 || !isIdentPart(t[i - 1])) -> {
                    out.mark(t, i, TokenKind.NUMBER)
                    while (i < n && t[i].isLetterOrDigit()) i++
                    out.mark(t, i, TokenKind.NORMAL)
                }
                else -> i++
            }
        }
    }
}
