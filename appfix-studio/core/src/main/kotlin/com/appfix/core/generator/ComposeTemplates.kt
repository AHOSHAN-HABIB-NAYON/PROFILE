package com.appfix.core.generator

/** Templates for Jetpack Compose screens (hosted in their own ComponentActivity). */
internal object ComposeTemplates {
    private fun esc(s: String) = s.replace("\\", "\\\\").replace("\"", "\\\"").replace("$", "\\$")

    fun activity(kind: FeatureKind, style: ProjectStyle, o: FeatureOptions): String {
        val p = kind.prefix
        val m3 = style.material3Compose
        val material = if (m3) "androidx.compose.material3" else "androidx.compose.material"
        val titleStyle = if (m3) "MaterialTheme.typography.headlineSmall" else "MaterialTheme.typography.h5"
        val bodyStyle = if (m3) "MaterialTheme.typography.bodyLarge" else "MaterialTheme.typography.body1"
        val labelStyle = if (m3) "MaterialTheme.typography.titleMedium" else "MaterialTheme.typography.subtitle1"
        val screen = kind.className.removeSuffix("Activity") + "Screen"
        val imports = sortedSetOf(
            "android.os.Bundle", "androidx.activity.ComponentActivity", "androidx.activity.compose.setContent",
            "androidx.compose.foundation.layout.Arrangement", "androidx.compose.foundation.layout.Column", "androidx.compose.foundation.layout.fillMaxSize",
            "androidx.compose.foundation.layout.padding", "androidx.compose.foundation.rememberScrollState", "androidx.compose.foundation.verticalScroll",
            "$material.MaterialTheme", "$material.Surface", "$material.Text", "androidx.compose.runtime.Composable", "androidx.compose.ui.Modifier",
            "androidx.compose.ui.res.stringResource", "androidx.compose.ui.unit.dp",
        )
        val content = StringBuilder()
        content.append("        Text(stringResource(R.string.${p}_title), style = $titleStyle)\n")
        val helpers = StringBuilder()
        when (kind) {
            FeatureKind.ABOUT -> {
                imports += "androidx.compose.ui.platform.LocalContext"
                content.append("""
                    |        val context = LocalContext.current
                    |        val version = remember {
                    |            try {
                    |                context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "?"
                    |            } catch (e: Exception) {
                    |                "?"
                    |            }
                    |        }
                    |        Text(stringResource(R.string.${p}_version, version))
                    |        Text(stringResource(R.string.${p}_description), style = $bodyStyle)
                    |""".trimMargin())
                imports += "androidx.compose.runtime.remember"
            }
            FeatureKind.CONTACT, FeatureKind.PRIVACY -> {
                imports += listOf("android.content.ActivityNotFoundException", "android.content.Context", "android.content.Intent", "android.net.Uri", "android.widget.Toast", "$material.Button", "androidx.compose.ui.platform.LocalContext")
                content.append("        val context = LocalContext.current\n")
                content.append("        Text(stringResource(R.string.${p}_${if (kind == FeatureKind.PRIVACY) "body" else "description"}), style = $bodyStyle)\n")
                if (kind == FeatureKind.CONTACT && o.email.isNotBlank()) {
                    content.append("        Button(onClick = { open(context, Intent(Intent.ACTION_SENDTO, Uri.parse(\"mailto:${esc(o.email.trim())}\"))) }) {\n")
                    content.append("            Text(stringResource(R.string.${p}_email_button))\n        }\n")
                }
                if (o.website.isNotBlank()) {
                    content.append("        Button(onClick = { open(context, Intent(Intent.ACTION_VIEW, Uri.parse(\"${esc(ViewTemplates.url(o.website))}\"))) }) {\n")
                    content.append("            Text(stringResource(R.string.${p}_website_button))\n        }\n")
                }
                helpers.append("""
                    |
                    |private fun open(context: Context, intent: Intent) {
                    |    try {
                    |        context.startActivity(intent)
                    |    } catch (e: ActivityNotFoundException) {
                    |        Toast.makeText(context, R.string.${p}_no_app, Toast.LENGTH_SHORT).show()
                    |    }
                    |}
                    |""".trimMargin())
            }
            FeatureKind.HELP -> for (i in 1..3) {
                content.append("        Text(stringResource(R.string.${p}_q$i), style = $labelStyle)\n")
                content.append("        Text(stringResource(R.string.${p}_a$i), style = $bodyStyle)\n")
            }
            FeatureKind.SETTINGS -> {
                imports += listOf(
                    "android.content.Context", "$material.Switch", "androidx.compose.foundation.layout.Row", "androidx.compose.foundation.layout.fillMaxWidth",
                    "androidx.compose.runtime.getValue", "androidx.compose.runtime.mutableStateOf", "androidx.compose.runtime.remember", "androidx.compose.runtime.setValue",
                    "androidx.compose.ui.Alignment", "androidx.compose.ui.platform.LocalContext",
                )
                content.append("""
                    |        val prefs = LocalContext.current.getSharedPreferences("settings", Context.MODE_PRIVATE)
                    |        var dark by remember { mutableStateOf(prefs.getBoolean("dark_theme", false)) }
                    |        var notifications by remember { mutableStateOf(prefs.getBoolean("notifications", true)) }
                    |        SettingRow(stringResource(R.string.${p}_dark_theme), stringResource(R.string.${p}_dark_theme_summary), dark) {
                    |            dark = it
                    |            prefs.edit().putBoolean("dark_theme", it).apply()
                    |        }
                    |        SettingRow(stringResource(R.string.${p}_notifications), stringResource(R.string.${p}_notifications_summary), notifications) {
                    |            notifications = it
                    |            prefs.edit().putBoolean("notifications", it).apply()
                    |        }
                    |""".trimMargin())
                helpers.append("""
                    |
                    |@Composable
                    |private fun SettingRow(title: String, summary: String, checked: Boolean, onChange: (Boolean) -> Unit) {
                    |    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    |        Column(Modifier.weight(1f)) {
                    |            Text(title, style = $labelStyle)
                    |            Text(summary, style = $bodyStyle)
                    |        }
                    |        Switch(checked = checked, onCheckedChange = onChange)
                    |    }
                    |}
                    |""".trimMargin())
            }
        }
        return buildString {
            append("package ${style.namespace}\n\n")
            imports.forEach { append("import $it\n") }
            append("""
                |
                |class ${kind.className} : ComponentActivity() {
                |    override fun onCreate(savedInstanceState: Bundle?) {
                |        super.onCreate(savedInstanceState)
                |        setTitle(R.string.${p}_title)
                |        // Uses the default MaterialTheme; wrap it in your app's theme to match the rest of the app.
                |        setContent { MaterialTheme { Surface { $screen() } } }
                |    }
                |}
                |
                |@Composable
                |fun $screen() {
                |    Column(
                |        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
                |        verticalArrangement = Arrangement.spacedBy(12.dp),
                |    ) {
                |""".trimMargin() + "\n")
            append(content)
            append("    }\n}\n")
            append(helpers)
        }
    }
}
