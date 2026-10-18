package com.appfix.core.layout

import java.io.File

enum class ClickAction(val displayName: String) {
    TOAST("Show a message"),
    OPEN_URL("Open a website"),
    SHARE_TEXT("Share text"),
    OPEN_SCREEN("Open another screen"),
    CONFIRM_DIALOG("Show a confirmation dialog"),
}

/** [value] is the message, URL, share text or fully-qualified activity class, depending on [action]. */
data class ClickSpec(val action: ClickAction, val value: String, val title: String = "")

data class HostActivity(val path: String, val language: String, val bindingVariable: String?)

data class GeneratedHandler(val source: String, val strings: Map<String, String>)

/**
 * Adds click handlers to the activity that inflates a layout. Generated code uses fully-qualified
 * framework names so no imports need to be managed.
 */
object ClickActions {
    /** Finds the Activity/Fragment source in [sourceRoots] that inflates `R.layout.[layoutName]`. */
    fun findHost(sourceRoots: List<File>, workspace: File, layoutName: String): HostActivity? {
        val binding = layoutName.split('_').joinToString("") { it.replaceFirstChar(Char::uppercase) } + "Binding"
        for (root in sourceRoots) {
            val hit = root.walkTopDown().filter { it.isFile && (it.extension == "kt" || it.extension == "java") && it.length() < 1_000_000 }
                .firstOrNull { f -> f.readText().let { it.contains("R.layout.$layoutName") || it.contains("$binding.inflate") } }
                ?: continue
            val text = hit.readText()
            val bindingVar = Regex("""(\w+)\s*=\s*$binding\.inflate""").find(text)?.groupValues?.get(1)
            return HostActivity(hit.relativeTo(workspace).invariantSeparatorsPath, if (hit.extension == "kt") "kotlin" else "java", bindingVar)
        }
        return null
    }

    fun camel(id: String) = id.split('_').mapIndexed { i, s -> if (i == 0) s else s.replaceFirstChar(Char::uppercase) }.joinToString("")

    /** Returns the updated host source with a click listener for [viewId]. */
    fun addHandler(source: String, host: HostActivity, viewId: String, spec: ClickSpec): GeneratedHandler {
        val kotlin = host.language == "kotlin"
        val ref = if (host.bindingVariable != null) "${host.bindingVariable}.${camel(viewId)}" else if (kotlin) "findViewById<android.view.View>(R.id.$viewId)" else "findViewById(R.id.$viewId)"
        if (source.contains("R.id.$viewId).setOnClickListener") || (host.bindingVariable != null && source.contains("${host.bindingVariable}.${camel(viewId)}.setOnClickListener"))) {
            throw LayoutEditException("#$viewId already has a click handler in ${host.path.substringAfterLast('/')}. Edit it in the code editor.")
        }
        val anchor = Regex("""setContentView\s*\(""").find(source) ?: throw LayoutEditException("Could not find setContentView(...) in ${host.path.substringAfterLast('/')}")
        // End of the setContentView statement: balance parentheses from the anchor.
        var depth = 0
        var i = anchor.range.last
        while (i < source.length) {
            when (source[i]) { '(' -> depth++; ')' -> { depth--; if (depth == 0) break } }
            i++
        }
        if (i >= source.length) throw LayoutEditException("Unbalanced parentheses after setContentView")
        var end = i + 1
        if (end < source.length && source[end] == ';') end++
        val lineStart = source.lastIndexOf('\n', anchor.range.first) + 1
        val indent = source.substring(lineStart).takeWhile { it == ' ' || it == '\t' }
        val strings = linkedMapOf<String, String>()
        val body = body(spec, viewId, kotlin, strings)
        val handler = if (kotlin) {
            "$ref.setOnClickListener {\n" + body.lines().joinToString("\n") { "    $it" } + "\n}"
        } else {
            "$ref.setOnClickListener(v -> {\n" + body.lines().joinToString("\n") { "    $it" } + "\n});"
        }
        val block = "\n" + handler.lines().joinToString("\n") { if (it.isEmpty()) it else indent + it }
        return GeneratedHandler(source.substring(0, end) + block + source.substring(end), strings)
    }

    private fun lit(s: String, kotlin: Boolean): String {
        val e = s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n")
        return "\"" + (if (kotlin) e.replace("$", "\\$") else e) + "\""
    }

    private fun body(spec: ClickSpec, id: String, kotlin: Boolean, strings: MutableMap<String, String>): String {
        fun res(key: String, value: String): String { strings["${id}_$key"] = value; return "getString(R.string.${id}_$key)" }
        val ctx = if (kotlin) "this" else "this"
        return when (spec.action) {
            ClickAction.TOAST -> if (kotlin) "android.widget.Toast.makeText($ctx, ${res("message", spec.value)}, android.widget.Toast.LENGTH_SHORT).show()"
            else "android.widget.Toast.makeText($ctx, ${res("message", spec.value)}, android.widget.Toast.LENGTH_SHORT).show();"
            ClickAction.OPEN_URL -> {
                val url = spec.value.trim().let { if (it.startsWith("http://") || it.startsWith("https://")) it else "https://$it" }
                if (kotlin) """
                    try {
                        startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(${lit(url, true)})))
                    } catch (e: android.content.ActivityNotFoundException) {
                        android.widget.Toast.makeText(this, ${res("no_browser", "No app can open this link")}, android.widget.Toast.LENGTH_SHORT).show()
                    }
                """.trimIndent() else """
                    try {
                        startActivity(new android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(${lit(url, false)})));
                    } catch (android.content.ActivityNotFoundException e) {
                        android.widget.Toast.makeText(this, ${res("no_browser", "No app can open this link")}, android.widget.Toast.LENGTH_SHORT).show();
                    }
                """.trimIndent()
            }
            ClickAction.SHARE_TEXT -> if (kotlin) """
                val share = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(android.content.Intent.EXTRA_TEXT, ${res("share_text", spec.value)})
                }
                startActivity(android.content.Intent.createChooser(share, null))
            """.trimIndent() else """
                android.content.Intent share = new android.content.Intent(android.content.Intent.ACTION_SEND);
                share.setType("text/plain");
                share.putExtra(android.content.Intent.EXTRA_TEXT, ${res("share_text", spec.value)});
                startActivity(android.content.Intent.createChooser(share, null));
            """.trimIndent()
            ClickAction.OPEN_SCREEN -> {
                val cls = spec.value.trim()
                if (!cls.matches(Regex("[A-Za-z_][\\w.]*"))) throw LayoutEditException("Enter an activity class name, e.g. com.example.app.AboutActivity")
                if (kotlin) "startActivity(android.content.Intent(this, $cls::class.java))" else "startActivity(new android.content.Intent(this, $cls.class));"
            }
            ClickAction.CONFIRM_DIALOG -> if (kotlin) """
                android.app.AlertDialog.Builder(this)
                    .setTitle(${res("dialog_title", spec.title.ifBlank { "Are you sure?" })})
                    .setMessage(${res("dialog_message", spec.value)})
                    .setPositiveButton(android.R.string.ok) { _, _ ->
                        // TODO: handle confirmation
                    }
                    .setNegativeButton(android.R.string.cancel, null)
                    .show()
            """.trimIndent() else """
                new android.app.AlertDialog.Builder(this)
                    .setTitle(${res("dialog_title", spec.title.ifBlank { "Are you sure?" })})
                    .setMessage(${res("dialog_message", spec.value)})
                    .setPositiveButton(android.R.string.ok, (dialog, which) -> {
                        // TODO: handle confirmation
                    })
                    .setNegativeButton(android.R.string.cancel, null)
                    .show();
            """.trimIndent()
        }
    }
}
