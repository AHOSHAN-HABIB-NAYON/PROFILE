package com.appfix.studio

import androidx.compose.ui.graphics.Color
import com.appfix.studio.ui.resources.parseColor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ColorParsingTest {
    @Test
    fun `parses android colour literals`() {
        assertEquals(Color(0xFFFF0000.toInt()), parseColor("#F00"))
        assertEquals(Color(0x88FF0000.toInt()), parseColor("#8F00"))
        assertEquals(Color(0xFF2753E0.toInt()), parseColor("#2753E0"))
        assertEquals(Color(0x802753E0.toInt()), parseColor(" #802753E0 "))
        assertNull(parseColor("@color/brand"))
        assertNull(parseColor("#12345"))
        assertNull(parseColor("#GGGGGG"))
    }
}
