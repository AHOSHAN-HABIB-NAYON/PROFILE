package com.webtecit.nayon.data.security

import java.net.URI

/** One sign-in read from, or written to, a password CSV file. */
data class CsvLogin(val name: String, val url: String, val username: String, val password: String, val note: String = "")

/**
 * Password files in the format Chrome and Google Password Manager use
 * (`name,url,username,password,note`). Import also understands the column names used by
 * Firefox, Edge, Samsung Pass exports, Bitwarden and 1Password.
 */
object PasswordCsv {
    private val HEADER = listOf("name", "url", "username", "password", "note")

    fun write(logins: List<CsvLogin>): String = buildString {
        appendLine(HEADER.joinToString(","))
        logins.forEach { l -> appendLine(listOf(l.name, l.url, l.username, l.password, l.note).joinToString(",") { escape(it) }) }
    }

    /** Reads every row that has a web address and a password. Unknown columns are ignored. */
    fun read(text: String): List<CsvLogin> {
        val rows = parse(text.removePrefix("﻿"))
        if (rows.isEmpty()) return emptyList()
        val header = rows.first().map { it.trim().lowercase() }
        fun col(vararg names: String) = names.firstNotNullOfOrNull { n -> header.indexOf(n).takeIf { it >= 0 } }
        val url = col("url", "login_uri", "website", "origin", "web site", "login url") ?: return emptyList()
        val user = col("username", "login_username", "user", "email", "login")
        val pass = col("password", "login_password") ?: return emptyList()
        val name = col("name", "title")
        val note = col("note", "notes", "extra")
        return rows.drop(1).mapNotNull { r ->
            val u = r.getOrNull(url)?.trim().orEmpty()
            val p = r.getOrNull(pass).orEmpty()
            if (u.isBlank() || p.isEmpty() || originOf(u) == null) return@mapNotNull null
            CsvLogin(
                name = name?.let { r.getOrNull(it) }?.trim().orEmpty(),
                url = u,
                username = user?.let { r.getOrNull(it) }?.trim().orEmpty(),
                password = p,
                note = note?.let { r.getOrNull(it) }.orEmpty(),
            )
        }
    }

    /** "https://host[:port]" for a web address; a missing scheme is taken as https. */
    fun originOf(url: String): String? = runCatching {
        val withScheme = if ("://" in url) url.trim() else "https://${url.trim()}"
        val uri = URI(withScheme)
        val scheme = uri.scheme?.lowercase() ?: return null
        if (scheme != "https" && scheme != "http") return null
        val host = uri.host?.lowercase()?.takeIf { it.isNotBlank() } ?: return null
        val port = if (uri.port != -1) ":${uri.port}" else ""
        "$scheme://$host$port"
    }.getOrNull()

    private fun escape(value: String): String =
        if (value.any { it == ',' || it == '"' || it == '\n' || it == '\r' }) "\"" + value.replace("\"", "\"\"") + "\"" else value

    /** RFC 4180 parsing: quoted fields, doubled quotes, and line breaks inside quotes. */
    private fun parse(text: String): List<List<String>> {
        val rows = mutableListOf<List<String>>()
        var row = mutableListOf<String>()
        val field = StringBuilder()
        var quoted = false
        var i = 0
        while (i < text.length) {
            val c = text[i]
            if (quoted) {
                if (c == '"') {
                    if (i + 1 < text.length && text[i + 1] == '"') { field.append('"'); i++ } else quoted = false
                } else field.append(c)
            } else when (c) {
                '"' -> quoted = true
                ',' -> { row.add(field.toString()); field.clear() }
                '\r' -> {}
                '\n' -> { row.add(field.toString()); field.clear(); if (row.any { it.isNotEmpty() }) rows.add(row); row = mutableListOf() }
                else -> field.append(c)
            }
            i++
        }
        row.add(field.toString())
        if (row.any { it.isNotEmpty() }) rows.add(row)
        return rows
    }
}
