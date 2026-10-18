package com.appfix.core.xml

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class XmlSourceTest {
    private val layout = """
        <?xml version="1.0" encoding="utf-8"?>
        <!-- comment -->
        <LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
            android:layout_width="match_parent"
            android:orientation="vertical">

            <TextView
                android:id="@+id/title"
                android:text="Hello &amp; welcome" />

            <FrameLayout android:id="@+id/empty"/>
        </LinearLayout>
    """.trimIndent()

    @Test
    fun `parses elements with offsets`() {
        val doc = XmlSource.parse(layout)
        assertEquals("LinearLayout", doc.root.name)
        assertEquals(3, doc.root.line)
        val tv = doc.root.children[0]
        assertEquals("Hello & welcome", tv.androidAttr("text"))
        assertEquals(7, tv.line)
        assertTrue(tv.selfClosing)
        assertEquals(listOf(1), doc.root.children[1].path())
    }

    @Test
    fun `reports errors with line numbers`() {
        for ((xml, line) in listOf("<a>\n<b>\n</a>" to 3, "<a x=\"1\" x=\"2\"/>" to 1, "<a>\n\n" to 3, "<a b=c/>" to 1, "<a/>\n<b/>" to 2)) {
            try { XmlSource.parse(xml); fail(xml) } catch (e: XmlSyntaxException) { assertEquals(xml, line, e.line) }
        }
    }

    @Test
    fun `edits preserve formatting`() {
        val doc = XmlSource.parse(layout)
        val tv = doc.root.children[0]
        var out = XmlEdits.setAttribute(layout, tv, "android:textSize", "20sp")
        assertTrue(out, out.contains("android:text=\"Hello &amp; welcome\"\n        android:textSize=\"20sp\" />"))
        out = XmlEdits.setAttribute(out, XmlSource.parse(out).root.children[0], "android:text", "Hi \"you\"")
        assertTrue(out, out.contains("android:text=\"Hi &quot;you&quot;\""))
        out = XmlEdits.removeAttribute(out, XmlSource.parse(out).root, "android:orientation")
        assertTrue(out, out.contains("android:layout_width=\"match_parent\">"))
        XmlSource.parse(out)
    }

    @Test
    fun `inserts children into normal and self-closing parents`() {
        val doc = XmlSource.parse(layout)
        val appended = XmlEdits.insertChild(layout, doc.root, "<Button\n    android:id=\"@+id/ok\" />")
        assertTrue(appended, appended.contains("<FrameLayout android:id=\"@+id/empty\"/>\n    <Button\n        android:id=\"@+id/ok\" />\n</LinearLayout>"))
        val first = XmlEdits.insertChild(layout, doc.root, "<Space />", index = 0)
        assertEquals("Space", XmlSource.parse(first).root.children[0].name)
        val frame = doc.root.children[1]
        val nested = XmlEdits.insertChild(layout, frame, "<View />")
        assertTrue(nested, nested.contains("<FrameLayout android:id=\"@+id/empty\">\n        <View />\n    </FrameLayout>"))
        assertEquals(1, XmlSource.parse(nested).root.children[1].children.size)
        val removed = XmlEdits.removeNode(layout, doc.root.children[0])
        assertEquals(1, XmlSource.parse(removed).root.children.size)
    }
}
