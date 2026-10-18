package com.appfix.core.xml

class XmlSyntaxException(message: String, val line: Int, val column: Int) :
    RuntimeException("$message (line $line, column $column)")

data class XmlAttr(
    val name: String,
    val value: String,
    /** Offset of the first character of the attribute name. */
    val start: Int,
    /** Offsets of the value *inside* the quotes. */
    val valueStart: Int,
    val valueEnd: Int,
) {
    /** Offset just after the closing quote. */
    val end: Int get() = valueEnd + 1
    val localName: String get() = name.substringAfter(':')
    val prefix: String? get() = if (name.contains(':')) name.substringBefore(':') else null
}

class XmlNode(
    val name: String,
    val attributes: List<XmlAttr>,
    /** Offset of '<'. */
    val start: Int,
    /** Offset just after the '>' of the start tag. */
    val startTagEnd: Int,
    val selfClosing: Boolean,
    val line: Int,
    val parent: XmlNode?,
) {
    val children = mutableListOf<XmlNode>()
    /** Offset just after the closing tag's '>' (equals [startTagEnd] for self-closing tags). */
    var end: Int = startTagEnd
        internal set
    /** Offset of the '<' of the end tag (equals [startTagEnd] when self-closing). */
    var endTagStart: Int = startTagEnd
        internal set

    fun attr(name: String): XmlAttr? = attributes.firstOrNull { it.name == name }
    fun attrValue(name: String): String? = attr(name)?.value?.let(XmlSource::unescape)
    fun androidAttr(local: String): String? = attrValue("android:$local")
    fun child(name: String): XmlNode? = children.firstOrNull { it.name == name }
    fun childrenNamed(name: String): List<XmlNode> = children.filter { it.name == name }

    fun descendants(): Sequence<XmlNode> = sequence {
        yield(this@XmlNode)
        for (c in children) yieldAll(c.descendants())
    }

    /** Index path from the root, used to re-find a node after the text is re-parsed. */
    fun path(): List<Int> {
        val out = ArrayDeque<Int>()
        var n: XmlNode = this
        while (n.parent != null) {
            out.addFirst(n.parent!!.children.indexOf(n))
            n = n.parent!!
        }
        return out.toList()
    }

    override fun toString() = "<$name> @line $line"
}

class XmlDocumentSource(val text: String, val root: XmlNode) {
    fun nodeAt(path: List<Int>): XmlNode? {
        var n = root
        for (i in path) n = n.children.getOrNull(i) ?: return null
        return n
    }

    fun lineOf(offset: Int): Int = XmlSource.lineOf(text, offset)
}

/**
 * A small, strict XML parser that records source offsets. It does not build a DOM of text nodes;
 * it is designed for analysing and surgically editing Android XML files while preserving formatting.
 */
object XmlSource {
    private const val MAX_DEPTH = 512

    fun parse(text: String): XmlDocumentSource {
        var i = 0
        val n = text.length
        var root: XmlNode? = null
        var current: XmlNode? = null
        var depth = 0

        fun err(msg: String, at: Int = i): Nothing {
            val (l, c) = lineCol(text, at)
            throw XmlSyntaxException(msg, l, c)
        }
        fun isNameStart(ch: Char) = ch.isLetter() || ch == '_' || ch == ':'
        fun isNameChar(ch: Char) = ch.isLetterOrDigit() || ch == '_' || ch == ':' || ch == '-' || ch == '.'
        fun readName(): String {
            val s = i
            if (i >= n || !isNameStart(text[i])) err("Expected a name")
            while (i < n && isNameChar(text[i])) i++
            return text.substring(s, i)
        }
        fun skipWs() { while (i < n && text[i].isWhitespace()) i++ }

        if (text.startsWith("﻿")) i = 1
        while (i < n) {
            val ch = text[i]
            if (ch != '<') {
                val s = i
                while (i < n && text[i] != '<') i++
                if (current == null && text.substring(s, i).isNotBlank()) err("Text is not allowed outside the root element", s)
                continue
            }
            when {
                text.startsWith("<!--", i) -> {
                    val e = text.indexOf("-->", i + 4)
                    if (e < 0) err("Unterminated comment")
                    i = e + 3
                }
                text.startsWith("<![CDATA[", i) -> {
                    if (current == null) err("CDATA outside the root element")
                    val e = text.indexOf("]]>", i)
                    if (e < 0) err("Unterminated CDATA section")
                    i = e + 3
                }
                text.startsWith("<?", i) -> {
                    val e = text.indexOf("?>", i)
                    if (e < 0) err("Unterminated processing instruction")
                    i = e + 2
                }
                text.startsWith("<!", i) -> {
                    val e = text.indexOf('>', i)
                    if (e < 0) err("Unterminated declaration")
                    i = e + 1
                }
                text.startsWith("</", i) -> {
                    val tagStart = i
                    i += 2
                    val name = readName()
                    skipWs()
                    if (i >= n || text[i] != '>') err("Expected '>' to close </$name")
                    i++
                    val c = current ?: err("Unexpected closing tag </$name>", tagStart)
                    if (c.name != name) err("Closing tag </$name> does not match <${c.name}> opened on line ${c.line}", tagStart)
                    c.endTagStart = tagStart
                    c.end = i
                    current = c.parent
                    depth--
                }
                else -> {
                    val tagStart = i
                    i++
                    val name = readName()
                    val attrs = mutableListOf<XmlAttr>()
                    var selfClosing = false
                    while (true) {
                        val beforeWs = i
                        skipWs()
                        if (i >= n) err("Unterminated start tag <$name", tagStart)
                        if (text[i] == '>') { i++; break }
                        if (text.startsWith("/>", i)) { i += 2; selfClosing = true; break }
                        if (i == beforeWs) err("Expected whitespace before attribute in <$name>")
                        val aStart = i
                        val aName = readName()
                        skipWs()
                        if (i >= n || text[i] != '=') err("Attribute $aName in <$name> has no value")
                        i++
                        skipWs()
                        if (i >= n || (text[i] != '"' && text[i] != '\'')) err("Attribute $aName in <$name> must be quoted")
                        val q = text[i]
                        val vStart = i + 1
                        val vEnd = text.indexOf(q, vStart)
                        if (vEnd < 0) err("Unterminated value for $aName", aStart)
                        if (text.substring(vStart, vEnd).contains('<')) err("'<' is not allowed in attribute values ($aName)", vStart)
                        if (attrs.any { it.name == aName }) err("Duplicate attribute $aName in <$name>", aStart)
                        attrs += XmlAttr(aName, text.substring(vStart, vEnd), aStart, vStart, vEnd)
                        i = vEnd + 1
                    }
                    if (current == null && root != null) err("Only one root element is allowed", tagStart)
                    val node = XmlNode(name, attrs, tagStart, i, selfClosing, lineOf(text, tagStart), current)
                    if (current == null) root = node else current.children += node
                    if (!selfClosing) {
                        if (++depth > MAX_DEPTH) err("XML nesting is too deep")
                        current = node
                    }
                }
            }
        }
        if (current != null) err("Element <${current.name}> opened on line ${current.line} is never closed", n)
        return XmlDocumentSource(text, root ?: err("The document has no root element", 0))
    }

    fun lineOf(text: String, offset: Int): Int {
        var line = 1
        for (k in 0 until minOf(offset, text.length)) if (text[k] == '\n') line++
        return line
    }

    fun lineCol(text: String, offset: Int): Pair<Int, Int> {
        var line = 1
        var col = 1
        for (k in 0 until minOf(offset, text.length)) {
            if (text[k] == '\n') { line++; col = 1 } else col++
        }
        return line to col
    }

    fun escapeAttr(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace("\"", "&quot;")
    fun escapeText(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    fun unescape(s: String) = s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'").replace("&amp;", "&")
}

/** Formatting-preserving edits. Each function returns new text; callers should re-parse to validate. */
object XmlEdits {
    fun indentOfLine(text: String, offset: Int): String {
        val lineStart = text.lastIndexOf('\n', offset - 1) + 1
        var k = lineStart
        while (k < text.length && (text[k] == ' ' || text[k] == '\t')) k++
        return text.substring(lineStart, k)
    }

    fun setAttribute(text: String, node: XmlNode, name: String, value: String): String {
        val escaped = XmlSource.escapeAttr(value)
        val existing = node.attr(name)
        if (existing != null) return text.substring(0, existing.valueStart) + escaped + text.substring(existing.valueEnd)
        val insertion: String
        val at: Int
        val last = node.attributes.lastOrNull()
        if (last != null) {
            at = last.end
            val multiLine = node.attributes.size >= 2 && XmlSource.lineOf(text, node.attributes.first().start) != XmlSource.lineOf(text, last.start) ||
                (node.attributes.size == 1 && XmlSource.lineOf(text, last.start) != XmlSource.lineOf(text, node.start))
            insertion = if (multiLine) "\n" + indentOfLine(text, last.start) + "$name=\"$escaped\"" else " $name=\"$escaped\""
        } else {
            at = node.start + 1 + node.name.length
            insertion = " $name=\"$escaped\""
        }
        return text.substring(0, at) + insertion + text.substring(at)
    }

    fun removeAttribute(text: String, node: XmlNode, name: String): String {
        val a = node.attr(name) ?: return text
        var s = a.start
        while (s > 0 && text[s - 1].isWhitespace()) s--
        return text.substring(0, s) + text.substring(a.end)
    }

    /**
     * Inserts [snippet] (one or more lines, unindented) as a child of [parent].
     * [index] = null appends after the last child.
     */
    fun insertChild(text: String, parent: XmlNode, snippet: String, index: Int? = null, indentUnit: String = detectIndentUnit(text)): String {
        val parentIndent = indentOfLine(text, parent.start)
        val childIndent = parent.children.firstOrNull()?.let { indentOfLine(text, it.start) } ?: (parentIndent + indentUnit)
        val body = snippet.trimEnd().lines().joinToString("\n") { if (it.isBlank()) "" else childIndent + it }
        if (parent.selfClosing) {
            // Turn <x ... /> into <x ...>child</x>
            val closeStart = text.lastIndexOf("/>", parent.startTagEnd)
            var s = closeStart
            while (s > parent.start && text[s - 1] == ' ') s--
            return text.substring(0, s) + ">\n" + body + "\n" + parentIndent + "</${parent.name}>" + text.substring(parent.startTagEnd)
        }
        val anchorEnd: Int = when {
            parent.children.isEmpty() -> parent.startTagEnd
            index == null || index >= parent.children.size -> parent.children.last().end
            index <= 0 -> parent.startTagEnd
            else -> parent.children[index - 1].end
        }
        if (parent.children.isEmpty()) {
            val inner = text.substring(parent.startTagEnd, parent.endTagStart)
            return if (inner.isBlank()) {
                text.substring(0, parent.startTagEnd) + "\n" + body + "\n" + parentIndent + text.substring(parent.endTagStart)
            } else {
                text.substring(0, parent.endTagStart) + body + "\n" + parentIndent + text.substring(parent.endTagStart)
            }
        }
        return text.substring(0, anchorEnd) + "\n" + body + text.substring(anchorEnd)
    }

    fun removeNode(text: String, node: XmlNode): String {
        var s = node.start
        while (s > 0 && (text[s - 1] == ' ' || text[s - 1] == '\t')) s--
        if (s > 0 && text[s - 1] == '\n') s--
        return text.substring(0, s) + text.substring(node.end)
    }

    fun detectIndentUnit(text: String): String {
        val counts = text.lines().map { l -> l.takeWhile { it == ' ' }.length }.filter { it > 0 }
        if (text.lines().any { it.startsWith("\t") }) return "\t"
        val min = counts.minOrNull() ?: 4
        return " ".repeat(if (min in 2..8) min else 4)
    }
}
