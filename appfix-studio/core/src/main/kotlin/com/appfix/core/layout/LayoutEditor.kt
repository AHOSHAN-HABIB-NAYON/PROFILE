package com.appfix.core.layout

import com.appfix.core.xml.XmlEdits
import com.appfix.core.xml.XmlNode
import com.appfix.core.xml.XmlSource

/** One element of an XML layout, addressed by its child-index path from the root. */
data class LayoutNode(
    val path: List<Int>,
    val tag: String,
    val attributes: Map<String, String>,
    val children: List<LayoutNode>,
    val line: Int,
) {
    val simpleTag: String get() = tag.substringAfterLast('.')
    val id: String? get() = attributes["android:id"]?.substringAfter('/')
    val isContainer: Boolean get() = simpleTag in CONTAINERS || children.isNotEmpty()
    val label: String get() = id?.let { "$simpleTag #$it" } ?: simpleTag

    fun find(path: List<Int>): LayoutNode? {
        var n: LayoutNode = this
        for (i in path) n = n.children.getOrNull(i) ?: return null
        return n
    }

    fun flatten(): List<LayoutNode> = listOf(this) + children.flatMap { it.flatten() }

    companion object {
        val CONTAINERS = setOf(
            "LinearLayout", "FrameLayout", "RelativeLayout", "ConstraintLayout", "ScrollView", "NestedScrollView", "HorizontalScrollView",
            "CardView", "MaterialCardView", "CoordinatorLayout", "TableLayout", "TableRow", "GridLayout", "AppBarLayout", "merge",
        )
    }
}

/** Components the visual editor can insert. */
enum class ComponentKind(val displayName: String) {
    TEXT("Text"), BUTTON("Button"), IMAGE("Image"), INPUT("Text input"), CARD("Card"), DIVIDER("Divider"),
    VERTICAL_LAYOUT("Vertical layout"), HORIZONTAL_LAYOUT("Horizontal layout"), LIST("List"), SPACE("Space"), ICON_BUTTON("Icon button"), SWITCH("Switch"),
}

/** What the project offers, which decides the XML used for some components. */
data class LayoutCapabilities(val hasMaterial: Boolean, val hasAppCompat: Boolean, val hasRecyclerView: Boolean)

data class InsertResult(val layoutText: String, val newId: String, val strings: Map<String, String>)

class LayoutEditException(message: String) : RuntimeException(message)

/**
 * Editing operations on Android XML layouts. Each returns new text; untouched parts of the file stay
 * byte-for-byte identical so diffs remain small and reviewable.
 */
object LayoutEditor {
    fun parse(text: String): LayoutNode {
        val doc = XmlSource.parse(text)
        fun build(n: XmlNode, path: List<Int>): LayoutNode = LayoutNode(
            path = path,
            tag = n.name,
            attributes = n.attributes.associate { it.name to XmlSource.unescape(it.value) },
            children = n.children.mapIndexed { i, c -> build(c, path + i) },
            line = n.line,
        )
        return build(doc.root, emptyList())
    }

    private fun node(text: String, path: List<Int>): Pair<com.appfix.core.xml.XmlDocumentSource, XmlNode> {
        val doc = XmlSource.parse(text)
        return doc to (doc.nodeAt(path) ?: throw LayoutEditException("The selected element no longer exists"))
    }

    fun setAttribute(text: String, path: List<Int>, name: String, value: String?): String {
        val (_, n) = node(text, path)
        val out = if (value == null || value.isEmpty()) XmlEdits.removeAttribute(text, n, name) else XmlEdits.setAttribute(text, n, name, value)
        XmlSource.parse(out)
        return out
    }

    fun remove(text: String, path: List<Int>): String {
        if (path.isEmpty()) throw LayoutEditException("The root element cannot be removed")
        val (_, n) = node(text, path)
        return XmlEdits.removeNode(text, n).also { XmlSource.parse(it) }
    }

    /** Moves an element one position up (-1) or down (+1) among its siblings. */
    fun move(text: String, path: List<Int>, delta: Int): Pair<String, List<Int>> {
        if (path.isEmpty()) throw LayoutEditException("The root element cannot be moved")
        val (doc, n) = node(text, path)
        val parent = n.parent!!
        val index = path.last()
        val target = index + delta
        if (target !in parent.children.indices) return text to path
        val snippet = text.substring(n.start, n.end)
        val withoutNode = XmlEdits.removeNode(text, n)
        val parentAfter = XmlSource.parse(withoutNode).nodeAt(path.dropLast(1))!!
        val dedented = dedent(snippet, XmlEdits.indentOfLine(doc.text, n.start))
        val out = XmlEdits.insertChild(withoutNode, parentAfter, dedented, index = target)
        XmlSource.parse(out)
        return out to (path.dropLast(1) + target)
    }

    private fun dedent(snippet: String, indent: String): String =
        snippet.lines().joinToString("\n") { if (it.startsWith(indent)) it.substring(indent.length) else it.trimStart() }

    /** Generates an id like button_2 that is not used in [existingIds]. */
    fun uniqueId(base: String, existingIds: Set<String>): String {
        if (base !in existingIds) return base
        var i = 2
        while ("${base}_$i" in existingIds) i++
        return "${base}_$i"
    }

    /**
     * Inserts a component into the container at [parentPath]. Text is stored as string resources
     * (returned in [InsertResult.strings]) instead of hard-coded text.
     */
    fun insert(text: String, parentPath: List<Int>, index: Int?, kind: ComponentKind, caps: LayoutCapabilities, existingIds: Set<String>, label: String? = null): InsertResult {
        val (_, parent) = node(text, parentPath)
        if (!(parent.name.substringAfterLast('.') in LayoutNode.CONTAINERS || parent.children.isNotEmpty())) {
            throw LayoutEditException("<${parent.name.substringAfterLast('.')}> cannot contain other views. Select a layout container.")
        }
        val singleChild = parent.name.substringAfterLast('.') in setOf("ScrollView", "NestedScrollView", "HorizontalScrollView", "CardView", "MaterialCardView")
        if (singleChild && parent.children.isNotEmpty()) throw LayoutEditException("<${parent.name.substringAfterLast('.')}> can hold only one child. Insert into its inner layout instead.")
        val isConstraint = parent.name.endsWith("ConstraintLayout")
        val baseId = when (kind) {
            ComponentKind.TEXT -> "text"; ComponentKind.BUTTON -> "button"; ComponentKind.IMAGE -> "image"; ComponentKind.INPUT -> "input"
            ComponentKind.CARD -> "card"; ComponentKind.DIVIDER -> "divider"; ComponentKind.VERTICAL_LAYOUT, ComponentKind.HORIZONTAL_LAYOUT -> "container"
            ComponentKind.LIST -> "list"; ComponentKind.SPACE -> "space"; ComponentKind.ICON_BUTTON -> "icon_button"; ComponentKind.SWITCH -> "switch"
        }
        val id = uniqueId(baseId, existingIds)
        val strings = linkedMapOf<String, String>()
        fun str(key: String, value: String): String { strings["${id}_$key"] = value; return "@string/${id}_$key" }
        val margin = if (parent.attr("android:orientation")?.value == "horizontal") "android:layout_marginStart=\"8dp\"" else "android:layout_marginTop=\"12dp\""
        val constraint = if (isConstraint) "\n    app:layout_constraintStart_toStartOf=\"parent\"\n    app:layout_constraintTop_toTopOf=\"parent\"" else ""
        val common = "android:id=\"@+id/$id\""
        val xml = when (kind) {
            ComponentKind.TEXT -> """
                <TextView
                    $common
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    $margin
                    android:text="${str("text", label ?: "New text")}"
                    android:textSize="16sp" />""".trimIndent()
            ComponentKind.BUTTON -> """
                <Button
                    $common
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    $margin
                    android:text="${str("text", label ?: "Button")}" />""".trimIndent()
            ComponentKind.IMAGE -> """
                <ImageView
                    $common
                    android:layout_width="96dp"
                    android:layout_height="96dp"
                    $margin
                    android:contentDescription="${str("description", label ?: "Image")}"
                    android:scaleType="centerCrop"
                    android:src="@android:drawable/ic_menu_gallery" />""".trimIndent()
            ComponentKind.INPUT -> """
                <EditText
                    $common
                    android:layout_width="match_parent"
                    android:layout_height="wrap_content"
                    $margin
                    android:autofillHints="name"
                    android:hint="${str("hint", label ?: "Enter text")}"
                    android:inputType="text"
                    android:minHeight="48dp" />""".trimIndent()
            ComponentKind.CARD -> if (caps.hasMaterial) """
                <com.google.android.material.card.MaterialCardView
                    $common
                    android:layout_width="match_parent"
                    android:layout_height="wrap_content"
                    $margin>

                    <TextView
                        android:layout_width="wrap_content"
                        android:layout_height="wrap_content"
                        android:padding="16dp"
                        android:text="${str("text", label ?: "Card content")}" />
                </com.google.android.material.card.MaterialCardView>""".trimIndent() else """
                <FrameLayout
                    $common
                    android:layout_width="match_parent"
                    android:layout_height="wrap_content"
                    $margin
                    android:background="#FFF1F2F8"
                    android:padding="16dp">

                    <TextView
                        android:layout_width="wrap_content"
                        android:layout_height="wrap_content"
                        android:text="${str("text", label ?: "Card content")}" />
                </FrameLayout>""".trimIndent()
            ComponentKind.DIVIDER -> """
                <View
                    $common
                    android:layout_width="match_parent"
                    android:layout_height="1dp"
                    $margin
                    android:background="?android:attr/listDivider" />""".trimIndent()
            ComponentKind.VERTICAL_LAYOUT, ComponentKind.HORIZONTAL_LAYOUT -> """
                <LinearLayout
                    $common
                    android:layout_width="match_parent"
                    android:layout_height="wrap_content"
                    $margin
                    android:orientation="${if (kind == ComponentKind.VERTICAL_LAYOUT) "vertical" else "horizontal"}" />""".trimIndent()
            ComponentKind.LIST -> if (caps.hasRecyclerView) """
                <androidx.recyclerview.widget.RecyclerView
                    $common
                    android:layout_width="match_parent"
                    android:layout_height="240dp"
                    $margin />""".trimIndent() else """
                <ListView
                    $common
                    android:layout_width="match_parent"
                    android:layout_height="240dp"
                    $margin />""".trimIndent()
            ComponentKind.SPACE -> """
                <Space
                    $common
                    android:layout_width="match_parent"
                    android:layout_height="16dp" />""".trimIndent()
            ComponentKind.ICON_BUTTON -> """
                <ImageButton
                    $common
                    android:layout_width="48dp"
                    android:layout_height="48dp"
                    $margin
                    android:background="?android:attr/selectableItemBackgroundBorderless"
                    android:contentDescription="${str("description", label ?: "Action")}"
                    android:src="@android:drawable/ic_menu_info_details" />""".trimIndent()
            ComponentKind.SWITCH -> """
                <Switch
                    $common
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    $margin
                    android:minHeight="48dp"
                    android:text="${str("text", label ?: "Option")}" />""".trimIndent()
        }.let { x -> if (isConstraint) x.replaceFirst("\n    $margin", "\n    $margin$constraint") else x }
        var out = XmlEdits.insertChild(text, parent, xml, index)
        if (isConstraint && !text.contains("xmlns:app=")) {
            val root = XmlSource.parse(out).root
            out = XmlEdits.setAttribute(out, root, "xmlns:app", "http://schemas.android.com/apk/res-auto")
        }
        XmlSource.parse(out)
        return InsertResult(out, id, strings)
    }

    /** Ids declared with @+id/ anywhere in [text]. */
    fun declaredIds(text: String): Set<String> = Regex("@\\+id/([A-Za-z0-9_]+)").findAll(text).map { it.groupValues[1] }.toSet()
}
