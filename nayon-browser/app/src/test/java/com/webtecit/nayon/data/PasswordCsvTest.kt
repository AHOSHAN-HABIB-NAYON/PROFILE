package com.webtecit.nayon.data

import com.webtecit.nayon.data.security.CsvLogin
import com.webtecit.nayon.data.security.PasswordCsv
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PasswordCsvTest {

    @Test
    fun writeThenReadKeepsEveryField() {
        val logins = listOf(
            CsvLogin("example.com", "https://example.com/login", "me@example.com", "p,a\"ss\nword", "note"),
            CsvLogin("site", "https://site.org", "", "x"),
        )
        assertEquals(logins, PasswordCsv.read(PasswordCsv.write(logins)))
    }

    @Test
    fun readsChromeExport() {
        val csv = "name,url,username,password,note\r\ngoogle.com,https://accounts.google.com/,a@gmail.com,secret,\r\n"
        val rows = PasswordCsv.read(csv)
        assertEquals(1, rows.size)
        assertEquals("a@gmail.com", rows[0].username)
        assertEquals("secret", rows[0].password)
    }

    @Test
    fun readsBitwardenColumnsAndSkipsRowsWithoutPassword() {
        val csv = "folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\n" +
            ",,login,Git,,,,https://github.com,dev,pw1,\n" +
            ",,note,Secret note,,,,,,,\n"
        val rows = PasswordCsv.read(csv)
        assertEquals(1, rows.size)
        assertEquals("https://github.com", rows[0].url)
        assertEquals("pw1", rows[0].password)
    }

    @Test
    fun originIgnoresPathAndAddsHttps() {
        assertEquals("https://example.com", PasswordCsv.originOf("https://Example.com/a/b?c"))
        assertEquals("https://example.com", PasswordCsv.originOf("example.com"))
        assertEquals("http://localhost:8080", PasswordCsv.originOf("http://localhost:8080/x"))
        assertNull(PasswordCsv.originOf("android://app"))
    }

    @Test
    fun unknownFileGivesNothing() {
        assertEquals(emptyList<CsvLogin>(), PasswordCsv.read("a,b,c\n1,2,3\n"))
    }
}
