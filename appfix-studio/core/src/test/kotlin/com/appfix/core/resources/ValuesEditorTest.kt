package com.appfix.core.resources

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class ValuesEditorTest {
    private val strings = """
        <?xml version="1.0" encoding="utf-8"?>
        <resources>
            <!-- Greeting -->
            <string name="app_name">Sample Notes</string>
            <string name="quote">It\'s \"fine\"</string>
            <string name="styled">Hello <b>world</b></string>
            <string name="spaced">"  two  spaces "</string>
            <string name="empty"/>
            <color name="brand">#FF1E5EFF</color>
        </resources>
    """.trimIndent() + "\n"

    @Test
    fun `reads entries and unescapes values`() {
        val e = ValuesEditor.read(strings).associateBy { it.name }
        assertEquals("Sample Notes", e["app_name"]!!.value)
        assertEquals("It's \"fine\"", e["quote"]!!.value)
        assertTrue(e["styled"]!!.isComplex)
        assertEquals("  two  spaces ", e["spaced"]!!.value)
        assertEquals("", e["empty"]!!.value)
        assertEquals("#FF1E5EFF", e["brand"]!!.value)
        assertEquals(4, e["app_name"]!!.line)
    }

    @Test
    fun `edits keep the rest of the file unchanged`() {
        val out = ValuesEditor.setValue(strings, "string", "app_name", "Tom's <Notes> @home")
        assertEquals(strings.replace("<string name=\"app_name\">Sample Notes</string>", "<string name=\"app_name\">Tom\\'s &lt;Notes&gt; @home</string>"), out)
        assertEquals("Tom's <Notes> @home", ValuesEditor.read(out).first { it.name == "app_name" }.value)
        val empty = ValuesEditor.setValue(strings, "string", "empty", "Now set")
        assertTrue(empty, empty.contains("<string name=\"empty\">Now set</string>"))
        val ref = ValuesEditor.setValue(strings, "string", "app_name", "@notareference")
        assertTrue(ref.contains(">\\@notareference<"))
    }

    @Test
    fun `round trips special characters`() {
        for (v in listOf("a\nb", "tab\there", "back\\slash", "  padded ", "?question", "100% done", "\"quoted\"")) {
            val out = ValuesEditor.setValue(strings, "string", "app_name", v)
            assertEquals(v, ValuesEditor.read(out).first { it.name == "app_name" }.value)
        }
    }

    @Test
    fun `add and remove entries`() {
        val added = ValuesEditor.add(strings, "color", "accent", "#00897B")
        assertTrue(added, added.contains("    <color name=\"brand\">#FF1E5EFF</color>\n    <color name=\"accent\">#00897B</color>\n</resources>"))
        val removed = ValuesEditor.remove(added, "string", "quote")
        assertTrue(!removed.contains("name=\"quote\""))
        assertEquals(6, ValuesEditor.read(removed).size)
        try { ValuesEditor.add(strings, "string", "app_name", "dup"); fail() } catch (e: ResourceEditException) {}
        try { ValuesEditor.setValue(strings, "string", "styled", "x"); fail() } catch (e: ResourceEditException) {}
    }

    @Test
    fun `validation`() {
        assertNull(ValuesEditor.validate("color", "a", "#FFF"))
        assertNotNull(ValuesEditor.validate("color", "a", "red"))
        assertNotNull(ValuesEditor.validate("string", "1bad", "x"))
        assertNull(ValuesEditor.validate("dimen", "pad", "16dp"))
        assertNotNull(ValuesEditor.validate("dimen", "pad", "16"))
        assertNotNull(ValuesEditor.validate("bool", "b", "yes"))
        try { ValuesEditor.read("<manifest/>"); fail() } catch (e: ResourceEditException) {}
    }
}
