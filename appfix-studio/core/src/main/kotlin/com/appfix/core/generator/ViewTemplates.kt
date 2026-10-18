package com.appfix.core.generator

import java.io.File

/** Templates for XML-layout (View system) screens. */
internal object ViewTemplates {
    private fun esc(s: String) = s.replace("\\", "\\\\").replace("\"", "\\\"").replace("$", "\\$")

    fun layout(kind: FeatureKind, style: ProjectStyle, o: FeatureOptions, resDir: File): String {
        val p = kind.prefix
        val hasIcon = resDir.listFiles().orEmpty().any { d -> d.isDirectory && d.name.startsWith("mipmap") && d.listFiles().orEmpty().any { it.nameWithoutExtension == "ic_launcher" } }
        val switchTag = if (style.appCompat) "androidx.appcompat.widget.SwitchCompat" else "Switch"
        val body = StringBuilder()
        fun text(id: String?, res: String, size: String = "16sp", bold: Boolean = false, top: String = "12dp") {
            body.append("\n        <TextView\n")
            if (id != null) body.append("            android:id=\"@+id/$id\"\n")
            body.append("            android:layout_width=\"match_parent\"\n            android:layout_height=\"wrap_content\"\n")
            body.append("            android:layout_marginTop=\"$top\"\n            android:text=\"@string/$res\"\n            android:textSize=\"$size\"")
            if (bold) body.append("\n            android:textStyle=\"bold\"")
            body.append(" />\n")
        }
        fun button(id: String, res: String) {
            body.append("\n        <Button\n            android:id=\"@+id/$id\"\n            android:layout_width=\"wrap_content\"\n            android:layout_height=\"wrap_content\"\n")
            body.append("            android:layout_marginTop=\"16dp\"\n            android:text=\"@string/$res\" />\n")
        }
        fun switch(id: String, res: String, summary: String) {
            body.append("\n        <$switchTag\n            android:id=\"@+id/$id\"\n            android:layout_width=\"match_parent\"\n            android:layout_height=\"wrap_content\"\n")
            body.append("            android:layout_marginTop=\"16dp\"\n            android:minHeight=\"48dp\"\n            android:text=\"@string/$res\" />\n")
            text(null, summary, size = "14sp", top = "0dp")
        }
        if (kind == FeatureKind.ABOUT && hasIcon) {
            body.append("\n        <ImageView\n            android:layout_width=\"72dp\"\n            android:layout_height=\"72dp\"\n")
            body.append("            android:contentDescription=\"@string/${p}_title\"\n            android:src=\"@mipmap/ic_launcher\" />\n")
        }
        text(null, "${p}_title", size = "24sp", bold = true, top = if (kind == FeatureKind.ABOUT && hasIcon) "16dp" else "0dp")
        when (kind) {
            FeatureKind.ABOUT -> { text("${p}_version", "${p}_version", size = "14sp", top = "4dp"); text(null, "${p}_description") }
            FeatureKind.CONTACT -> {
                text(null, "${p}_description")
                if (o.email.isNotBlank()) button("${p}_email", "${p}_email_button")
                if (o.website.isNotBlank()) button("${p}_website", "${p}_website_button")
            }
            FeatureKind.PRIVACY -> {
                text(null, "${p}_body")
                if (o.website.isNotBlank()) button("${p}_website", "${p}_website_button")
            }
            FeatureKind.HELP -> for (i in 1..3) { text(null, "${p}_q$i", bold = true, top = "20dp"); text(null, "${p}_a$i", top = "4dp") }
            FeatureKind.SETTINGS -> {
                switch("${p}_dark_theme", "${p}_dark_theme", "${p}_dark_theme_summary")
                switch("${p}_notifications", "${p}_notifications", "${p}_notifications_summary")
            }
        }
        return """
            |<?xml version="1.0" encoding="utf-8"?>
            |<ScrollView xmlns:android="http://schemas.android.com/apk/res/android"
            |    android:layout_width="match_parent"
            |    android:layout_height="match_parent"
            |    android:fillViewport="true">
            |
            |    <LinearLayout
            |        android:layout_width="match_parent"
            |        android:layout_height="wrap_content"
            |        android:orientation="vertical"
            |        android:padding="24dp">
            |""".trimMargin() + body.toString().replace("\n        ", "\n        ") + "\n    </LinearLayout>\n</ScrollView>\n"
    }

    fun activity(kind: FeatureKind, style: ProjectStyle, o: FeatureOptions): String =
        if (style.kotlin) kotlinActivity(kind, style, o) else javaActivity(kind, style, o)

    private fun base(style: ProjectStyle) = if (style.appCompat) "androidx.appcompat.app.AppCompatActivity" to "AppCompatActivity" else "android.app.Activity" to "Activity"

    private fun kotlinActivity(kind: FeatureKind, style: ProjectStyle, o: FeatureOptions): String {
        val p = kind.prefix
        val (baseImport, baseName) = base(style)
        val imports = sortedSetOf("android.os.Bundle", baseImport)
        val body = StringBuilder()
        val helpers = StringBuilder()
        when (kind) {
            FeatureKind.ABOUT -> {
                imports += "android.widget.TextView"
                body.append("""
                    |        val version = try {
                    |            packageManager.getPackageInfo(packageName, 0).versionName ?: "?"
                    |        } catch (e: Exception) {
                    |            "?"
                    |        }
                    |        findViewById<TextView>(R.id.${p}_version).text = getString(R.string.${p}_version, version)
                    |""".trimMargin())
            }
            FeatureKind.CONTACT, FeatureKind.PRIVACY -> {
                imports += listOf("android.content.ActivityNotFoundException", "android.content.Intent", "android.net.Uri", "android.view.View", "android.widget.Toast")
                if (kind == FeatureKind.CONTACT && o.email.isNotBlank()) body.append("        findViewById<View>(R.id.${p}_email).setOnClickListener { open(Intent(Intent.ACTION_SENDTO, Uri.parse(\"mailto:${esc(o.email.trim())}\"))) }\n")
                if (o.website.isNotBlank()) body.append("        findViewById<View>(R.id.${p}_website).setOnClickListener { open(Intent(Intent.ACTION_VIEW, Uri.parse(\"${esc(url(o.website))}\"))) }\n")
                helpers.append("""
                    |
                    |    private fun open(intent: Intent) {
                    |        try {
                    |            startActivity(intent)
                    |        } catch (e: ActivityNotFoundException) {
                    |            Toast.makeText(this, R.string.${p}_no_app, Toast.LENGTH_SHORT).show()
                    |        }
                    |    }
                    |""".trimMargin())
            }
            FeatureKind.HELP -> Unit
            FeatureKind.SETTINGS -> {
                imports += "android.widget.CompoundButton"
                if (style.appCompat) imports += "androidx.appcompat.app.AppCompatDelegate"
                body.append("""
                    |        val prefs = getSharedPreferences("settings", MODE_PRIVATE)
                    |        val dark = findViewById<CompoundButton>(R.id.${p}_dark_theme)
                    |        dark.isChecked = prefs.getBoolean("dark_theme", false)
                    |        dark.setOnCheckedChangeListener { _, checked ->
                    |            prefs.edit().putBoolean("dark_theme", checked).apply()
                    |""".trimMargin() + "\n")
                if (style.appCompat) body.append("            AppCompatDelegate.setDefaultNightMode(if (checked) AppCompatDelegate.MODE_NIGHT_YES else AppCompatDelegate.MODE_NIGHT_NO)\n")
                body.append("""
                    |        }
                    |        val notifications = findViewById<CompoundButton>(R.id.${p}_notifications)
                    |        notifications.isChecked = prefs.getBoolean("notifications", true)
                    |        notifications.setOnCheckedChangeListener { _, checked -> prefs.edit().putBoolean("notifications", checked).apply() }
                    |""".trimMargin())
            }
        }
        return buildString {
            append("package ${style.namespace}\n\n")
            imports.forEach { append("import $it\n") }
            append("\nclass ${kind.className} : $baseName() {\n")
            append("    override fun onCreate(savedInstanceState: Bundle?) {\n")
            append("        super.onCreate(savedInstanceState)\n")
            append("        setContentView(R.layout.activity_$p)\n")
            append("        setTitle(R.string.${p}_title)\n")
            append(body)
            if (body.isNotEmpty() && !body.endsWith("\n")) append("\n")
            append("    }\n")
            append(helpers)
            append("}\n")
        }
    }

    private fun javaActivity(kind: FeatureKind, style: ProjectStyle, o: FeatureOptions): String {
        val p = kind.prefix
        val (baseImport, baseName) = base(style)
        val imports = sortedSetOf("android.os.Bundle", baseImport)
        val body = StringBuilder()
        val helpers = StringBuilder()
        when (kind) {
            FeatureKind.ABOUT -> {
                imports += "android.widget.TextView"
                body.append("""
                    |        String version = "?";
                    |        try {
                    |            version = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
                    |        } catch (Exception ignored) {
                    |        }
                    |        ((TextView) findViewById(R.id.${p}_version)).setText(getString(R.string.${p}_version, version));
                    |""".trimMargin())
            }
            FeatureKind.CONTACT, FeatureKind.PRIVACY -> {
                imports += listOf("android.content.ActivityNotFoundException", "android.content.Intent", "android.net.Uri", "android.widget.Toast")
                if (kind == FeatureKind.CONTACT && o.email.isNotBlank()) body.append("        findViewById(R.id.${p}_email).setOnClickListener(v -> open(new Intent(Intent.ACTION_SENDTO, Uri.parse(\"mailto:${esc(o.email.trim()).replace("\\$", "$")}\"))));\n")
                if (o.website.isNotBlank()) body.append("        findViewById(R.id.${p}_website).setOnClickListener(v -> open(new Intent(Intent.ACTION_VIEW, Uri.parse(\"${esc(url(o.website)).replace("\\$", "$")}\"))));\n")
                helpers.append("""
                    |
                    |    private void open(Intent intent) {
                    |        try {
                    |            startActivity(intent);
                    |        } catch (ActivityNotFoundException e) {
                    |            Toast.makeText(this, R.string.${p}_no_app, Toast.LENGTH_SHORT).show();
                    |        }
                    |    }
                    |""".trimMargin())
            }
            FeatureKind.HELP -> Unit
            FeatureKind.SETTINGS -> {
                imports += listOf("android.content.SharedPreferences", "android.widget.CompoundButton")
                if (style.appCompat) imports += "androidx.appcompat.app.AppCompatDelegate"
                body.append("""
                    |        SharedPreferences prefs = getSharedPreferences("settings", MODE_PRIVATE);
                    |        CompoundButton dark = findViewById(R.id.${p}_dark_theme);
                    |        dark.setChecked(prefs.getBoolean("dark_theme", false));
                    |        dark.setOnCheckedChangeListener((button, checked) -> {
                    |            prefs.edit().putBoolean("dark_theme", checked).apply();
                    |""".trimMargin() + "\n")
                if (style.appCompat) body.append("            AppCompatDelegate.setDefaultNightMode(checked ? AppCompatDelegate.MODE_NIGHT_YES : AppCompatDelegate.MODE_NIGHT_NO);\n")
                body.append("""
                    |        });
                    |        CompoundButton notifications = findViewById(R.id.${p}_notifications);
                    |        notifications.setChecked(prefs.getBoolean("notifications", true));
                    |        notifications.setOnCheckedChangeListener((button, checked) -> prefs.edit().putBoolean("notifications", checked).apply());
                    |""".trimMargin())
            }
        }
        return buildString {
            append("package ${style.namespace};\n\n")
            imports.forEach { append("import $it;\n") }
            append("\npublic class ${kind.className} extends $baseName {\n")
            append("    @Override\n    protected void onCreate(Bundle savedInstanceState) {\n")
            append("        super.onCreate(savedInstanceState);\n")
            append("        setContentView(R.layout.activity_$p);\n")
            append("        setTitle(R.string.${p}_title);\n")
            append(body)
            if (body.isNotEmpty() && !body.endsWith("\n")) append("\n")
            append("    }\n")
            append(helpers)
            append("}\n")
        }
    }

    fun url(s: String) = s.trim().let { if (it.startsWith("http://") || it.startsWith("https://")) it else "https://$it" }
}
