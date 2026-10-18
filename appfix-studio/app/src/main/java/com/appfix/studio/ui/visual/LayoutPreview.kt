package com.appfix.studio.ui.visual

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.ViewList
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.appfix.core.layout.LayoutNode
import com.appfix.studio.ui.resources.parseColor

/**
 * Approximate Compose rendering of an XML layout, for selecting and arranging elements.
 * It is not the compiled app: themes, custom views, constraints and styles are simplified.
 */
@Composable
fun LayoutPreview(node: LayoutNode, res: PreviewResources, selected: List<Int>?, onSelect: (List<Int>) -> Unit) {
    PreviewNode(node, res, selected, onSelect, parentVertical = true)
}

private fun LayoutNode.a(name: String) = attributes["android:$name"]

private fun dp(v: String?): Dp? {
    val m = Regex("^(-?\\d+(?:\\.\\d+)?)(dp|dip|px|sp)$").find(v?.trim() ?: return null) ?: return null
    return m.groupValues[1].toFloat().dp
}

private fun resolveText(v: String?, res: PreviewResources): String = when {
    v == null -> ""
    v.startsWith("@string/") -> res.strings[v.removePrefix("@string/")] ?: v
    v.startsWith("@android:string/") -> v.substringAfter('/').replace('_', ' ')
    else -> v
}

private fun resolveColor(v: String?, res: PreviewResources, depth: Int = 0): Color? = when {
    v == null || depth > 4 -> null
    v.startsWith("#") -> parseColor(v)
    v.startsWith("@color/") -> resolveColor(res.colors[v.removePrefix("@color/")], res, depth + 1)
    v == "@android:color/white" -> Color.White
    v == "@android:color/black" -> Color.Black
    v == "@android:color/transparent" -> Color.Transparent
    else -> null
}

@Composable
private fun PreviewNode(node: LayoutNode, res: PreviewResources, selected: List<Int>?, onSelect: (List<Int>) -> Unit, parentVertical: Boolean) {
    if (node.a("visibility") == "gone") return
    val isSelected = selected == node.path
    val tag = node.simpleTag
    val width = node.a("layout_width")
    val height = node.a("layout_height")
    val marginAll = dp(node.a("layout_margin"))
    val mStart = dp(node.a("layout_marginStart") ?: node.a("layout_marginLeft") ?: node.a("layout_marginHorizontal")) ?: marginAll ?: 0.dp
    val mEnd = dp(node.a("layout_marginEnd") ?: node.a("layout_marginRight") ?: node.a("layout_marginHorizontal")) ?: marginAll ?: 0.dp
    val mTop = dp(node.a("layout_marginTop") ?: node.a("layout_marginVertical")) ?: marginAll ?: 0.dp
    val mBottom = dp(node.a("layout_marginBottom") ?: node.a("layout_marginVertical")) ?: marginAll ?: 0.dp
    val pAll = dp(node.a("padding"))
    val pStart = dp(node.a("paddingStart") ?: node.a("paddingLeft") ?: node.a("paddingHorizontal")) ?: pAll ?: 0.dp
    val pEnd = dp(node.a("paddingEnd") ?: node.a("paddingRight") ?: node.a("paddingHorizontal")) ?: pAll ?: 0.dp
    val pTop = dp(node.a("paddingTop") ?: node.a("paddingVertical")) ?: pAll ?: 0.dp
    val pBottom = dp(node.a("paddingBottom") ?: node.a("paddingVertical")) ?: pAll ?: 0.dp
    val bgValue = node.a("background")
    val rounded = bgValue?.startsWith("@drawable/bg_") == true && bgValue.endsWith("_rounded")
    val bg = resolveColor(bgValue, res) ?: if (tag.contains("Card")) MaterialTheme.colorScheme.surfaceContainerHigh else null
    val shape = RoundedCornerShape(if (rounded || tag.contains("Card")) 12.dp else 0.dp)

    var m: Modifier = Modifier.padding(start = mStart, end = mEnd, top = mTop, bottom = mBottom)
    m = when {
        width == "match_parent" || width == "fill_parent" || (width == "0dp" && !parentVertical) -> m.fillMaxWidth()
        dp(width) != null -> m.width(dp(width)!!)
        else -> m
    }
    dp(height)?.let { if (it > 0.dp) m = m.height(it) }
    if (isSelected) m = m.border(2.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(4.dp))
    m = m.clickable { onSelect(node.path) }
    if (bg != null) m = m.background(bg, shape) else if (rounded) m = m.background(MaterialTheme.colorScheme.surfaceContainerHigh, shape)
    m = m.padding(start = pStart, end = pEnd, top = pTop, bottom = pBottom)
    if (node.a("visibility") == "invisible") m = m.alpha(0.25f)

    val textColor = resolveColor(node.a("textColor"), res) ?: Color.Unspecified
    val textSize = node.a("textSize")?.let { Regex("^(\\d+(?:\\.\\d+)?)").find(it)?.groupValues?.get(1)?.toFloatOrNull() }
    val style = node.a("textStyle").orEmpty()
    val weight = if (style.contains("bold")) FontWeight.Bold else null
    val fontStyle = if (style.contains("italic")) FontStyle.Italic else null
    val gravity = node.a("gravity").orEmpty()
    val horizontal = when {
        gravity.contains("center") -> Alignment.CenterHorizontally
        gravity.contains("end") || gravity.contains("right") -> Alignment.End
        else -> Alignment.Start
    }

    when {
        tag == "LinearLayout" && node.a("orientation") == "horizontal" || tag == "TableRow" -> Row(m, verticalAlignment = Alignment.CenterVertically) {
            node.children.forEach { PreviewNode(it, res, selected, onSelect, parentVertical = false) }
        }
        node.isContainer -> Column(m, horizontalAlignment = horizontal) {
            if (tag in setOf("ConstraintLayout", "RelativeLayout", "CoordinatorLayout") && node.children.size > 1) {
                Text("$tag: children shown stacked", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (node.children.isEmpty()) {
                Box(Modifier.fillMaxWidth().height(40.dp).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(6.dp)), contentAlignment = Alignment.Center) {
                    Text("Empty ${tag}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            node.children.forEach { PreviewNode(it, res, selected, onSelect, parentVertical = true) }
        }
        tag.endsWith("Button") && tag != "ImageButton" && !tag.contains("Radio") && !tag.contains("Toggle") -> Button(onClick = { onSelect(node.path) }, modifier = m.wrapContentSize()) {
            Text(resolveText(node.a("text"), res), fontWeight = weight)
        }
        tag.endsWith("EditText") -> OutlinedTextField(
            value = resolveText(node.a("text"), res), onValueChange = {}, readOnly = true, enabled = false,
            placeholder = { Text(resolveText(node.a("hint"), res)) }, modifier = m,
        )
        tag in setOf("ImageView", "ImageButton", "ShapeableImageView", "AppCompatImageView") -> Box(m.then(if (dp(width) == null) Modifier.size(48.dp) else Modifier).background(MaterialTheme.colorScheme.surfaceContainer, RoundedCornerShape(8.dp)), contentAlignment = Alignment.Center) {
            Icon(Icons.Outlined.Image, contentDescription = resolveText(node.a("contentDescription"), res), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        tag.contains("Switch") || tag == "CheckBox" -> Row(m, verticalAlignment = Alignment.CenterVertically) {
            Text(resolveText(node.a("text"), res), modifier = Modifier.weight(1f, fill = false))
            Spacer(Modifier.width(8.dp))
            Switch(checked = node.a("checked") == "true", onCheckedChange = null, enabled = false)
        }
        tag == "View" && (dp(height) ?: 99.dp) <= 2.dp -> HorizontalDivider(m)
        tag == "ProgressBar" || tag.endsWith("ProgressIndicator") -> Box(m) { CircularProgressIndicator(Modifier.size(36.dp)) }
        tag == "LottieAnimationView" -> Box(m.then(if (dp(width) == null) Modifier.size(120.dp) else Modifier).background(MaterialTheme.colorScheme.tertiaryContainer, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
            Text("Lottie\n${node.attributes["app:lottie_rawRes"]?.substringAfter('/') ?: ""}", style = MaterialTheme.typography.labelMedium)
        }
        tag == "Space" -> Spacer(m.height(dp(height) ?: 8.dp))
        tag in setOf("RecyclerView", "ListView", "GridView") -> Surface(m.height(dp(height) ?: 120.dp), color = MaterialTheme.colorScheme.surfaceContainer, shape = RoundedCornerShape(8.dp)) {
            Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.ViewList, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("$tag — items are added in code", style = MaterialTheme.typography.bodySmall)
            }
        }
        tag.endsWith("TextView") || tag == "Chip" -> Text(
            resolveText(node.a("text"), res).ifEmpty { if (node.a("hint") != null) resolveText(node.a("hint"), res) else "" },
            modifier = m, color = textColor, fontSize = (textSize ?: 14f).sp, fontWeight = weight, fontStyle = fontStyle,
        )
        else -> Box(m.background(MaterialTheme.colorScheme.surfaceContainer, RoundedCornerShape(6.dp)).padding(8.dp)) {
            Text("<$tag>", style = MaterialTheme.typography.labelSmall)
        }
    }
}

