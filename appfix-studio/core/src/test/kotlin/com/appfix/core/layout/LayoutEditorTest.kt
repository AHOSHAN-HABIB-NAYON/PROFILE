package com.appfix.core.layout

import com.appfix.core.TestFixtures
import com.appfix.core.xml.XmlSource
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.File

class LayoutEditorTest {
    private val ws = TestFixtures.copySample()
    private val layout = File(ws, "app/src/main/res/layout/activity_main.xml").readText()
    private val caps = LayoutCapabilities(hasMaterial = true, hasAppCompat = true, hasRecyclerView = false)

    @Test
    fun `parses the component tree`() {
        val tree = LayoutEditor.parse(layout)
        assertEquals("LinearLayout", tree.tag)
        assertEquals(listOf("title", "body", "counter", "primary_button"), tree.children.map { it.id })
        assertEquals("@string/tap_me", tree.find(listOf(3))!!.attributes["android:text"])
    }

    @Test
    fun `inserts a button below the title with a string resource`() {
        val r = LayoutEditor.insert(layout, emptyList(), 1, ComponentKind.BUTTON, caps, LayoutEditor.declaredIds(layout), label = "Buy now")
        val tree = LayoutEditor.parse(r.layoutText)
        assertEquals("button", r.newId)
        assertEquals("button", tree.children[1].id)
        assertEquals("@string/button_text", tree.children[1].attributes["android:text"])
        assertEquals(mapOf("button_text" to "Buy now"), r.strings)
        // Existing lines are unchanged.
        assertTrue(r.layoutText.contains("        android:id=\"@+id/title\"\n        android:layout_width=\"wrap_content\""))
        val second = LayoutEditor.insert(r.layoutText, emptyList(), null, ComponentKind.BUTTON, caps, LayoutEditor.declaredIds(r.layoutText))
        assertEquals("button_2", second.newId)
    }

    @Test
    fun `every component kind produces valid xml`() {
        var text = layout
        for (kind in ComponentKind.entries) {
            val r = LayoutEditor.insert(text, emptyList(), null, kind, caps, LayoutEditor.declaredIds(text), label = if (kind == ComponentKind.LOTTIE) "intro" else null)
            XmlSource.parse(r.layoutText)
            text = r.layoutText
        }
        assertEquals(4 + ComponentKind.entries.size, LayoutEditor.parse(text).children.size)
        assertTrue("lottie needs the app namespace", text.contains("xmlns:app=\"http://schemas.android.com/apk/res-auto\""))
        try { LayoutEditor.insert(layout, emptyList(), null, ComponentKind.LOTTIE, caps, emptySet()); fail() } catch (e: LayoutEditException) {}
    }

    @Test
    fun `attributes, moves and removals`() {
        var t = LayoutEditor.setAttribute(layout, listOf(0), "android:textColor", "#FF0000")
        assertEquals("#FF0000", LayoutEditor.parse(t).children[0].attributes["android:textColor"])
        t = LayoutEditor.setAttribute(t, listOf(0), "android:textColor", null)
        assertEquals(layout, t)
        val (moved, newPath) = LayoutEditor.move(layout, listOf(3), -1)
        assertEquals(listOf(2), newPath)
        assertEquals(listOf("title", "body", "primary_button", "counter"), LayoutEditor.parse(moved).children.map { it.id })
        val (back, _) = LayoutEditor.move(moved, listOf(2), 1)
        assertEquals(listOf("title", "body", "counter", "primary_button"), LayoutEditor.parse(back).children.map { it.id })
        val removed = LayoutEditor.remove(layout, listOf(1))
        assertEquals(listOf("title", "counter", "primary_button"), LayoutEditor.parse(removed).children.map { it.id })
        try { LayoutEditor.remove(layout, emptyList()); fail() } catch (e: LayoutEditException) {}
        try { LayoutEditor.insert(layout, listOf(0), null, ComponentKind.TEXT, caps, emptySet()); fail() } catch (e: LayoutEditException) {
            assertTrue(e.message!!.contains("cannot contain"))
        }
    }

    @Test
    fun `click handlers are added after setContentView`() {
        val host = ClickActions.findHost(listOf(File(ws, "app/src/main/java")), ws, "activity_main")!!
        assertEquals("app/src/main/java/com/appfix/sample/MainActivity.kt", host.path)
        val src = File(ws, host.path).readText()
        val out = ClickActions.addHandler(src, host, "title", ClickSpec(ClickAction.TOAST, "Hello \$user"))
        assertTrue(out.source, out.source.contains("        setContentView(R.layout.activity_main)\n        findViewById<android.view.View>(R.id.title).setOnClickListener {\n            android.widget.Toast.makeText(this, getString(R.string.title_message), android.widget.Toast.LENGTH_SHORT).show()\n        }\n"))
        assertEquals(mapOf("title_message" to "Hello \$user"), out.strings)
        try { ClickActions.addHandler(out.source, host, "title", ClickSpec(ClickAction.TOAST, "x")); fail() } catch (e: LayoutEditException) {}
        val binding = HostActivity("A.kt", "kotlin", "binding")
        val b = ClickActions.addHandler("class A { fun onCreate() {\n    setContentView(binding.root)\n} }", binding, "primary_button", ClickSpec(ClickAction.OPEN_URL, "example.com"))
        assertTrue(b.source, b.source.contains("binding.primaryButton.setOnClickListener {") && b.source.contains("Uri.parse(\"https://example.com\")"))
    }
}

class ReservedNameTest {
    @Test
    fun `ids never use java keywords and the analyzer reports them`() {
        org.junit.Assert.assertEquals("switch_view", LayoutEditor.uniqueId("switch", emptySet()))
        org.junit.Assert.assertNotNull(com.appfix.core.resources.ValuesEditor.validate("string", "new", "x"))
        val ws = TestFixtures.copySample()
        val layout = File(ws, "app/src/main/res/layout/activity_main.xml")
        layout.writeText(layout.readText().replace("@+id/counter", "@+id/switch").replace("R.id.counter", "R.id.switch"))
        val report = com.appfix.core.analysis.ProjectAnalyzer(ws).analyze(com.appfix.core.project.ProjectDetector.detect(ws))
        assertTrue(report.findings.any { it.ruleId == "resources.reserved_name" && it.title.contains("@id/switch") })
    }
}
