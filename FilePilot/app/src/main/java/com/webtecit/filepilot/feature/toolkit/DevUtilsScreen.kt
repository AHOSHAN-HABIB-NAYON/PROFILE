@file:OptIn(ExperimentalMaterial3Api::class)

package com.webtecit.filepilot.feature.toolkit

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.webtecit.filepilot.core.designsystem.Palette

enum class DevUtil(val label: String) {
    JSON("JSON"), BASE64("Base64"), URL("URL"), HASH("Hash"), JWT("JWT"), UUID("UUID"), TIME("Timestamp"),
    COLOR("Colour"), NUMBER("Number base"), REGEX("Regex"), TEXT("Text"), SIZE("File size"), PASSWORD("Password"),
}

@Composable
fun DevUtilsScreen(start: DevUtil, onBack: () -> Unit) {
    var util by remember { mutableStateOf(start) }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (start == DevUtil.PASSWORD) "Password generator" else "Developer utilities") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).imePadding()) {
            if (start != DevUtil.PASSWORD) {
                Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    DevUtil.entries.forEach { u -> FilterChip(selected = util == u, onClick = { util = u }, label = { Text(u.label) }) }
                }
            }
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                when (util) {
                    DevUtil.PASSWORD -> PasswordTool()
                    else -> TextTool(util)
                }
            }
        }
    }
}

private fun copy(context: Context, text: String) {
    (context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("FilePilot", text))
    android.widget.Toast.makeText(context, "Copied", android.widget.Toast.LENGTH_SHORT).show()
}

@Composable
private fun TextTool(util: DevUtil) {
    // Each utility keeps its own input while the user switches between them.
    var input by remember(util) { mutableStateOf("") }
    var extra by remember(util) { mutableStateOf("") }
    var mode by remember(util) { mutableStateOf(0) }
    val modes: List<String> = when (util) {
        DevUtil.JSON -> listOf("Format", "Minify")
        DevUtil.BASE64 -> listOf("Encode", "Decode", "URL-safe")
        DevUtil.URL -> listOf("Encode", "Decode")
        DevUtil.HASH -> listOf("SHA-256", "SHA-1", "MD5", "SHA-512")
        DevUtil.TEXT -> listOf("Stats", "UPPER", "lower", "Title Case", "Unique lines", "Sort lines")
        DevUtil.REGEX -> listOf("Match case", "Ignore case")
        DevUtil.UUID -> listOf("1", "5", "20")
        else -> emptyList()
    }
    val hint = when (util) {
        DevUtil.JSON -> "Paste JSON"
        DevUtil.JWT -> "Paste a token (xxxxx.yyyyy.zzzzz)"
        DevUtil.TIME -> "Unix time or a date (empty = now)"
        DevUtil.COLOR -> "#2F6BFF or rgb(47, 107, 255)"
        DevUtil.NUMBER -> "255, 0xFF, 0b1010 or 0o17"
        DevUtil.REGEX -> "Text to search in"
        DevUtil.SIZE -> "1.5 GB, 700 MB, 123456"
        DevUtil.UUID -> ""
        else -> "Text"
    }
    val result: Result<String> = remember(util, input, extra, mode) {
        runCatching {
            when (util) {
                DevUtil.JSON -> DevUtils.formatJson(input, if (mode == 0) 2 else 0)
                DevUtil.BASE64 -> when (mode) { 1 -> DevUtils.base64Decode(input); 2 -> DevUtils.base64Encode(input, urlSafe = true); else -> DevUtils.base64Encode(input) }
                DevUtil.URL -> if (mode == 0) DevUtils.urlEncode(input) else DevUtils.urlDecode(input)
                DevUtil.HASH -> DevUtils.hash(input, modes[mode])
                DevUtil.JWT -> DevUtils.decodeJwt(input)
                DevUtil.UUID -> DevUtils.uuids(modes[mode].toInt()) + extra.take(0)
                DevUtil.TIME -> DevUtils.timestamp(input)
                DevUtil.COLOR -> DevUtils.color(input)
                DevUtil.NUMBER -> DevUtils.numberBases(input)
                DevUtil.REGEX -> DevUtils.regexTest(extra, input, ignoreCase = mode == 1)
                DevUtil.SIZE -> DevUtils.sizeUnits(input)
                DevUtil.TEXT -> when (mode) {
                    1 -> input.uppercase()
                    2 -> input.lowercase()
                    3 -> DevUtils.titleCase(input)
                    4 -> DevUtils.removeDuplicateLines(input)
                    5 -> DevUtils.sortLines(input)
                    else -> DevUtils.textStats(input)
                }
                DevUtil.PASSWORD -> ""
            }
        }
    }
    val context = LocalContext.current
    if (modes.isNotEmpty()) {
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            modes.forEachIndexed { i, m -> FilterChip(selected = mode == i, onClick = { mode = i }, label = { Text(m) }) }
        }
    }
    if (util == DevUtil.REGEX) {
        OutlinedTextField(extra, { extra = it }, label = { Text("Pattern, e.g. (\\d+)-(\\w+)") }, singleLine = true,
            textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace), modifier = Modifier.fillMaxWidth())
    }
    if (util != DevUtil.UUID) {
        OutlinedTextField(
            input, { input = it }, label = { Text(hint) },
            textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
            minLines = if (util in setOf(DevUtil.JSON, DevUtil.TEXT, DevUtil.REGEX, DevUtil.BASE64, DevUtil.JWT)) 5 else 1,
            modifier = Modifier.fillMaxWidth(),
        )
    }
    val empty = input.isEmpty() && util !in setOf(DevUtil.UUID, DevUtil.TIME)
    if (!empty) {
        val text = result.getOrNull()
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = if (text != null) MaterialTheme.colorScheme.surfaceContainerLowest else MaterialTheme.colorScheme.errorContainer,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f)),
        ) {
            Column(Modifier.fillMaxWidth().padding(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(if (text != null) "Result" else "Problem", style = MaterialTheme.typography.labelLarge, color = if (text != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error, modifier = Modifier.weight(1f))
                    if (text != null) IconButton(onClick = { copy(context, text) }) { Icon(Icons.Rounded.ContentCopy, "Copy result") }
                    if (util == DevUtil.UUID) IconButton(onClick = { extra += " " }) { Icon(Icons.Rounded.Refresh, "New") }
                }
                SelectionContainer {
                    Text(
                        text ?: (result.exceptionOrNull()?.message ?: "This input can't be used."),
                        fontFamily = if (text != null) FontFamily.Monospace else FontFamily.Default,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.heightIn(min = 24.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun PasswordTool() {
    val context = LocalContext.current
    var length by remember { mutableFloatStateOf(16f) }
    var upper by remember { mutableStateOf(true) }
    var lower by remember { mutableStateOf(true) }
    var digits by remember { mutableStateOf(true) }
    var symbols by remember { mutableStateOf(true) }
    var seed by remember { mutableStateOf(0) }
    val result = remember(length.toInt(), upper, lower, digits, symbols, seed) {
        runCatching { DevUtils.password(length.toInt(), upper, lower, digits, symbols) }
    }
    val pw = result.getOrNull()
    Surface(shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.surfaceContainerLowest, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f))) {
        Column(Modifier.fillMaxWidth().padding(16.dp)) {
            SelectionContainer {
                Text(pw ?: result.exceptionOrNull()?.message.orEmpty(), fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            }
            if (pw != null) {
                val (bits, word) = DevUtils.strength(pw)
                val color = when (word) { "Weak" -> Palette.Red; "Fair" -> Palette.Orange; else -> Palette.Green }
                Spacer(Modifier.size(8.dp))
                Text("$word · about $bits bits", color = color, style = MaterialTheme.typography.labelLarge)
            }
            Spacer(Modifier.size(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { seed++ }, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Rounded.Refresh, null, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("New")
                }
                Button(onClick = { pw?.let { copy(context, it) } }, enabled = pw != null, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Rounded.ContentCopy, null, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Copy")
                }
            }
        }
    }
    OptionCard("Length: ${length.toInt()}") {
        Slider(value = length, onValueChange = { length = it }, valueRange = 6f..64f)
    }
    OptionCard("Characters") {
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            FilterChip(selected = upper, onClick = { upper = !upper }, label = { Text("A–Z") })
            FilterChip(selected = lower, onClick = { lower = !lower }, label = { Text("a–z") })
            FilterChip(selected = digits, onClick = { digits = !digits }, label = { Text("0–9") })
            FilterChip(selected = symbols, onClick = { symbols = !symbols }, label = { Text("!@#") })
        }
        Text("Look-alike characters (0/O, 1/l) are left out. Passwords are made on your phone and never saved.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
