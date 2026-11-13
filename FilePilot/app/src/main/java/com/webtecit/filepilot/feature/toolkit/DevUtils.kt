package com.webtecit.filepilot.feature.toolkit

import java.security.MessageDigest
import java.security.SecureRandom
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

/** Small text converters for developers. Pure functions; every one returns a result or throws a readable error. */
object DevUtils {

    // ----- JSON ---------------------------------------------------------------------------------

    /** Re-indents JSON with [indent] spaces (0 = minify). Validates while it goes. */
    fun formatJson(input: String, indent: Int): String {
        val text = input.trim()
        require(text.isNotEmpty()) { "Paste some JSON first." }
        val out = StringBuilder()
        var depth = 0
        var inString = false
        var escape = false
        val stack = ArrayDeque<Char>()
        fun newline() {
            if (indent > 0) {
                out.append('\n')
                repeat(depth * indent) { out.append(' ') }
            }
        }
        var i = 0
        while (i < text.length) {
            val c = text[i]
            if (inString) {
                out.append(c)
                when {
                    escape -> escape = false
                    c == '\\' -> escape = true
                    c == '"' -> inString = false
                }
                i++
                continue
            }
            when (c) {
                '"' -> { inString = true; out.append(c) }
                '{', '[' -> {
                    stack.addLast(c)
                    out.append(c)
                    // keep empty {} and [] on one line
                    var j = i + 1
                    while (j < text.length && text[j].isWhitespace()) j++
                    if (j < text.length && (text[j] == '}' || text[j] == ']')) {
                        val close = text[j]
                        require((c == '{' && close == '}') || (c == '[' && close == ']')) { "Brackets don't match near position ${j + 1}." }
                        stack.removeLast()
                        out.append(close)
                        i = j
                    } else {
                        depth++
                        newline()
                    }
                }
                '}', ']' -> {
                    require(stack.isNotEmpty()) { "Unexpected '$c' at position ${i + 1}." }
                    val open = stack.removeLast()
                    require((open == '{' && c == '}') || (open == '[' && c == ']')) { "Brackets don't match at position ${i + 1}." }
                    depth--
                    newline()
                    out.append(c)
                }
                ',' -> { out.append(c); newline() }
                ':' -> out.append(if (indent > 0) ": " else ":")
                else -> if (!c.isWhitespace()) out.append(c)
            }
            i++
        }
        require(!inString) { "A string isn't closed." }
        require(stack.isEmpty()) { "Missing ${if (stack.last() == '{') "}" else "]"} at the end." }
        return out.toString()
    }

    // ----- Encoding -----------------------------------------------------------------------------

    private const val B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

    /** Base64 (RFC 4648), written here because java.util.Base64 needs Android 8. */
    fun base64Encode(text: String, urlSafe: Boolean = false): String = encodeBytes(text.toByteArray(Charsets.UTF_8), urlSafe)

    fun encodeBytes(data: ByteArray, urlSafe: Boolean = false): String {
        val out = StringBuilder((data.size + 2) / 3 * 4)
        var i = 0
        while (i < data.size) {
            val b0 = data[i].toInt() and 0xFF
            val b1 = if (i + 1 < data.size) data[i + 1].toInt() and 0xFF else -1
            val b2 = if (i + 2 < data.size) data[i + 2].toInt() and 0xFF else -1
            out.append(B64[b0 shr 2])
            out.append(B64[((b0 and 3) shl 4) or (if (b1 >= 0) b1 shr 4 else 0)])
            if (b1 >= 0) out.append(B64[((b1 and 15) shl 2) or (if (b2 >= 0) b2 shr 6 else 0)]) else if (!urlSafe) out.append('=')
            if (b2 >= 0) out.append(B64[b2 and 63]) else if (!urlSafe) out.append('=')
            i += 3
        }
        return if (urlSafe) out.toString().replace('+', '-').replace('/', '_') else out.toString()
    }

    fun decodeBytes(text: String): ByteArray {
        val clean = text.filterNot { it.isWhitespace() }.replace('-', '+').replace('_', '/').trimEnd('=')
        val out = java.io.ByteArrayOutputStream(clean.length * 3 / 4)
        var buffer = 0
        var bits = 0
        for (c in clean) {
            val v = B64.indexOf(c)
            require(v >= 0) { "This isn't valid Base64." }
            buffer = (buffer shl 6) or v
            bits += 6
            if (bits >= 8) {
                bits -= 8
                out.write((buffer shr bits) and 0xFF)
            }
        }
        require(clean.length % 4 != 1) { "This isn't valid Base64." }
        return out.toByteArray()
    }

    fun base64Decode(text: String): String = String(decodeBytes(text), Charsets.UTF_8)

    fun urlEncode(text: String): String = java.net.URLEncoder.encode(text, "UTF-8").replace("+", "%20")
    fun urlDecode(text: String): String = runCatching { java.net.URLDecoder.decode(text, "UTF-8") }
        .getOrElse { throw IllegalArgumentException("This text has a broken % code.") }

    fun hash(text: String, algorithm: String): String =
        MessageDigest.getInstance(algorithm).digest(text.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

    /** Shows the header and payload of a JSON Web Token (the signature isn't checked). */
    fun decodeJwt(token: String): String {
        val parts = token.trim().split('.')
        require(parts.size >= 2) { "A JWT has three parts separated by dots." }
        fun part(p: String) = String(decodeBytes(p), Charsets.UTF_8)
        val header = runCatching { formatJson(part(parts[0]), 2) }.getOrElse { throw IllegalArgumentException("The header isn't valid.") }
        val payload = runCatching { formatJson(part(parts[1]), 2) }.getOrElse { throw IllegalArgumentException("The payload isn't valid.") }
        return "Header\n$header\n\nPayload\n$payload\n\nThe signature isn't verified."
    }

    // ----- Generators ---------------------------------------------------------------------------

    fun uuids(count: Int): String = (1..count.coerceIn(1, 100)).joinToString("\n") { UUID.randomUUID().toString() }

    private val random = SecureRandom()

    fun password(length: Int, upper: Boolean, lower: Boolean, digits: Boolean, symbols: Boolean): String {
        val sets = buildList {
            if (upper) add("ABCDEFGHJKLMNPQRSTUVWXYZ")
            if (lower) add("abcdefghijkmnopqrstuvwxyz")
            if (digits) add("23456789")
            if (symbols) add("!@#$%^&*()-_=+[]{};:,.?")
        }
        require(sets.isNotEmpty()) { "Choose at least one kind of character." }
        val n = length.coerceIn(4, 128)
        val all = sets.joinToString("")
        // one character from each chosen set, the rest from all of them, then shuffled
        val chars = sets.map { it[random.nextInt(it.length)] }.toMutableList()
        while (chars.size < n) chars += all[random.nextInt(all.length)]
        for (i in chars.indices.reversed()) {
            val j = random.nextInt(i + 1)
            val t = chars[i]; chars[i] = chars[j]; chars[j] = t
        }
        return chars.joinToString("")
    }

    /** Rough strength in bits and a word for it. */
    fun strength(password: String): Pair<Int, String> {
        var pool = 0
        if (password.any { it.isUpperCase() }) pool += 26
        if (password.any { it.isLowerCase() }) pool += 26
        if (password.any { it.isDigit() }) pool += 10
        if (password.any { !it.isLetterOrDigit() }) pool += 32
        val bits = if (pool == 0) 0 else (password.length * (Math.log(pool.toDouble()) / Math.log(2.0))).toInt()
        val word = when {
            bits < 40 -> "Weak"
            bits < 60 -> "Fair"
            bits < 80 -> "Strong"
            else -> "Very strong"
        }
        return bits to word
    }

    // ----- Time ---------------------------------------------------------------------------------

    /** Unix seconds or milliseconds → readable dates; a date "yyyy-MM-dd HH:mm:ss" → Unix time. */
    fun timestamp(input: String): String {
        val text = input.trim()
        if (text.isEmpty()) {
            val now = System.currentTimeMillis()
            return "Now\n${now / 1000} (seconds)\n$now (milliseconds)\n${fmt(now, TimeZone.getDefault())}"
        }
        text.toLongOrNull()?.let { n ->
            val ms = if (n > 99_999_999_999L) n else n * 1000
            return "Local: ${fmt(ms, TimeZone.getDefault())}\nUTC:   ${fmt(ms, TimeZone.getTimeZone("UTC"))}"
        }
        val parser = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)
        val date = runCatching { parser.parse(text) }.getOrNull()
            ?: runCatching { SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(text) }.getOrNull()
            ?: throw IllegalArgumentException("Enter a Unix time like 1700000000, or a date like 2026-11-13 21:30:00.")
        return "${date.time / 1000} (seconds)\n${date.time} (milliseconds)"
    }

    private fun fmt(ms: Long, zone: TimeZone): String =
        SimpleDateFormat("yyyy-MM-dd HH:mm:ss zzz", Locale.US).apply { timeZone = zone }.format(Date(ms))

    // ----- Colours and numbers ------------------------------------------------------------------

    /** "#2F6BFF", "2f6bff", "#abc" or "rgb(47, 107, 255)" → all forms. */
    fun color(input: String): String {
        val t = input.trim().lowercase()
        val rgb = Regex("""rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})""").find(t)
        val (r, g, b) = if (rgb != null) {
            rgb.groupValues.drop(1).map { it.toInt().also { v -> require(v in 0..255) { "Values must be 0–255." } } }
        } else {
            var hex = t.removePrefix("#")
            if (hex.length == 3) hex = hex.map { "$it$it" }.joinToString("")
            require(hex.length == 6 && hex.all { it in "0123456789abcdef" }) { "Enter a colour like #2F6BFF or rgb(47, 107, 255)." }
            listOf(hex.substring(0, 2).toInt(16), hex.substring(2, 4).toInt(16), hex.substring(4, 6).toInt(16))
        }
        val hsl = hsl(r, g, b)
        return "HEX  #%02X%02X%02X\nRGB  rgb(%d, %d, %d)\nHSL  hsl(%d, %d%%, %d%%)\nAndroid  0xFF%02X%02X%02X".format(r, g, b, r, g, b, hsl[0], hsl[1], hsl[2], r, g, b)
    }

    private fun hsl(r: Int, g: Int, b: Int): IntArray {
        val rf = r / 255f; val gf = g / 255f; val bf = b / 255f
        val max = maxOf(rf, gf, bf); val min = minOf(rf, gf, bf)
        val l = (max + min) / 2
        val d = max - min
        val s = if (d == 0f) 0f else d / (1 - kotlin.math.abs(2 * l - 1))
        val h = when {
            d == 0f -> 0f
            max == rf -> 60 * (((gf - bf) / d) % 6)
            max == gf -> 60 * (((bf - rf) / d) + 2)
            else -> 60 * (((rf - gf) / d) + 4)
        }.let { if (it < 0) it + 360 else it }
        return intArrayOf(Math.round(h), Math.round(s * 100), Math.round(l * 100))
    }

    /** A number in decimal, hex (0x), binary (0b) or octal (0o) → all four. */
    fun numberBases(input: String): String {
        val t = input.trim().lowercase().replace("_", "").replace(" ", "")
        require(t.isNotEmpty()) { "Enter a number, e.g. 255, 0xFF or 0b1010." }
        val negative = t.startsWith("-")
        val body = t.removePrefix("-")
        val value = when {
            body.startsWith("0x") -> body.drop(2).toLongOrNull(16)
            body.startsWith("0b") -> body.drop(2).toLongOrNull(2)
            body.startsWith("0o") -> body.drop(2).toLongOrNull(8)
            else -> body.toLongOrNull()
        } ?: throw IllegalArgumentException("\"$input\" isn't a number this tool understands.")
        val v = if (negative) -value else value
        return "Decimal  $v\nHex      0x${java.lang.Long.toHexString(v).uppercase()}\nBinary   0b${java.lang.Long.toBinaryString(v)}\nOctal    0o${java.lang.Long.toOctalString(v)}"
    }

    // ----- Text ---------------------------------------------------------------------------------

    fun textStats(text: String): String {
        val words = if (text.isBlank()) 0 else text.trim().split(Regex("\\s+")).size
        val lines = if (text.isEmpty()) 0 else text.lines().size
        val minutes = (words / 200.0)
        return "Characters  ${text.length}\nNo spaces   ${text.count { !it.isWhitespace() }}\nWords       $words\nLines       $lines\nReading     ${if (minutes < 1) "under a minute" else "about ${Math.round(minutes)} min"}"
    }

    fun titleCase(text: String): String = text.lowercase().split(" ").joinToString(" ") { w -> w.replaceFirstChar { it.titlecase() } }
    fun removeDuplicateLines(text: String): String = text.lines().distinct().joinToString("\n")
    fun sortLines(text: String): String = text.lines().sortedWith(String.CASE_INSENSITIVE_ORDER).joinToString("\n")

    /** Tests [pattern] on [text]: each match with its groups. */
    fun regexTest(pattern: String, text: String, ignoreCase: Boolean): String {
        require(pattern.isNotEmpty()) { "Enter a pattern." }
        val regex = runCatching { if (ignoreCase) Regex(pattern, RegexOption.IGNORE_CASE) else Regex(pattern) }
            .getOrElse { throw IllegalArgumentException("Pattern error: ${it.message?.lineSequence()?.firstOrNull()}") }
        val matches = regex.findAll(text).take(200).toList()
        if (matches.isEmpty()) return "No matches."
        return buildString {
            append("${matches.size} match${if (matches.size == 1) "" else "es"}\n")
            matches.forEachIndexed { i, m ->
                append("\n${i + 1}. \"${m.value}\" at ${m.range.first}")
                m.groupValues.drop(1).forEachIndexed { g, v -> append("\n   $${g + 1} = \"$v\"") }
            }
        }
    }

    /** File-size units: "1.5 GB" → bytes, KB, MB, GB (both 1000 and 1024 bases). */
    fun sizeUnits(input: String): String {
        val m = Regex("""^\s*([\d.]+)\s*([kmgt]?i?b?)?\s*$""", RegexOption.IGNORE_CASE).find(input)
            ?: throw IllegalArgumentException("Enter a size like 1.5 GB, 700 MB or 123456.")
        val n = m.groupValues[1].toDoubleOrNull() ?: throw IllegalArgumentException("\"${m.groupValues[1]}\" isn't a number.")
        val unit = m.groupValues[2].lowercase()
        val power = when (unit.firstOrNull()) { 'k' -> 1; 'm' -> 2; 'g' -> 3; 't' -> 4; else -> 0 }
        val bytes = n * Math.pow(1024.0, power.toDouble())
        fun f(div: Double) = "%,.2f".format(Locale.US, bytes / div)
        return "Bytes  %,.0f\nKB     ${f(1024.0)}\nMB     ${f(1024.0 * 1024)}\nGB     ${f(1024.0 * 1024 * 1024)}".format(Locale.US, bytes)
    }
}
