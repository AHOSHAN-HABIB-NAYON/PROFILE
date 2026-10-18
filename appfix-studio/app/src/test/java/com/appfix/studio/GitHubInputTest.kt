package com.appfix.studio

import com.appfix.studio.data.repo.ProjectRepository
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class GitHubInputTest {
    @Test
    fun `accepts common repository formats`() {
        val expected = "android" to "sunflower"
        for (input in listOf(
            "android/sunflower",
            "https://github.com/android/sunflower",
            "https://github.com/android/sunflower.git",
            "github.com/android/sunflower/tree/main/app",
            "git@github.com:android/sunflower.git",
            "  https://www.github.com/android/sunflower/  ",
        )) assertEquals(input, expected, ProjectRepository.parseGitHub(input))
    }

    @Test
    fun `rejects invalid input`() {
        for (input in listOf("", "sunflower", "https://gitlab.com/a/b", "a/b/c", "../etc", "owner/..", "https://github.com/")) {
            assertNull(input, ProjectRepository.parseGitHub(input))
        }
    }

    @Test
    fun `file names are sanitised`() {
        assertEquals("my_app_.apk", ProjectRepository.safeFileName("my*app?", "apk"))
        assertEquals("evil.apk", ProjectRepository.safeFileName("../../evil.apk", "apk"))
        assertEquals("file.apk", ProjectRepository.safeFileName("", "apk"))
    }
}
