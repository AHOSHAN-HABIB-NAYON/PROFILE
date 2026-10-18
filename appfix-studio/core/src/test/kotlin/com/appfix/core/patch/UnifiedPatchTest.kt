package com.appfix.core.patch

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class UnifiedPatchTest {
    @get:Rule val tmp = TemporaryFolder()

    private fun project(): File = tmp.newFolder("p").apply {
        File(this, "app/src/main/java/a").mkdirs()
        File(this, "app/src/main/java/a/Main.kt").writeText((1..20).joinToString("\n") { "line $it" } + "\n")
        File(this, "app/build.gradle").writeText("android {\n    compileSdk 33\n}\n")
        File(this, "keystore.properties").writeText("storePassword=x\n")
    }

    @Test fun `modify with exact context`() {
        val root = project()
        val patch = """
            diff --git a/app/build.gradle b/app/build.gradle
            --- a/app/build.gradle
            +++ b/app/build.gradle
            @@ -1,3 +1,3 @@
             android {
            -    compileSdk 33
            +    compileSdk 36
             }
        """.trimIndent()
        val r = UnifiedPatch.toChangeSet(root, patch, "t", "ai")
        assertTrue(r.problems.toString(), r.ok)
        val c = r.changeSet!!.changes.single()
        assertEquals("android {\n    compileSdk 36\n}\n", c.after)
        // Nothing is written until the change set is applied.
        assertEquals("android {\n    compileSdk 33\n}\n", File(root, "app/build.gradle").readText())
    }

    @Test fun `hunk with wrong line numbers is found nearby and multiple hunks apply`() {
        val root = project()
        val patch = """
            --- a/app/src/main/java/a/Main.kt
            +++ b/app/src/main/java/a/Main.kt
            @@ -8,3 +8,4 @@
             line 3
             line 4
            +inserted
             line 5
            @@ -15,3 +16,2 @@
             line 15
            -line 16
             line 17
        """.trimIndent()
        val r = UnifiedPatch.toChangeSet(root, patch, "t", "ai")
        assertTrue(r.problems.toString(), r.ok)
        val after = r.changeSet!!.changes.single().after!!.lines()
        assertEquals("inserted", after[4])
        assertTrue("line 16" !in after)
        assertEquals("line 20", after[19])
    }

    @Test fun `create and delete files`() {
        val root = project()
        File(root, "old.txt").writeText("a\nb\n")
        val patch = """
            --- /dev/null
            +++ b/app/src/main/res/values/extra.xml
            @@ -0,0 +1,3 @@
            +<resources>
            +    <string name="x">X</string>
            +</resources>
            --- a/old.txt
            +++ /dev/null
            @@ -1,2 +0,0 @@
            -a
            -b
        """.trimIndent()
        val r = UnifiedPatch.toChangeSet(root, patch, "t", "ai")
        assertTrue(r.problems.toString(), r.ok)
        val (create, delete) = r.changeSet!!.changes
        assertEquals(FileChange.Kind.CREATE, create.kind)
        assertEquals("<resources>\n    <string name=\"x\">X</string>\n</resources>\n", create.after)
        assertEquals(FileChange.Kind.DELETE, delete.kind)
    }

    @Test fun `crlf files keep crlf`() {
        val root = project()
        File(root, "w.txt").writeText("one\r\ntwo\r\nthree\r\n")
        val r = UnifiedPatch.toChangeSet(root, "--- a/w.txt\n+++ b/w.txt\n@@ -1,3 +1,3 @@\n one\n-two\n+TWO\n three\n", "t", "ai")
        assertTrue(r.problems.toString(), r.ok)
        assertEquals("one\r\nTWO\r\nthree\r\n", r.changeSet!!.changes.single().after)
    }

    @Test fun `stale context is rejected`() {
        val root = project()
        val r = UnifiedPatch.toChangeSet(root, "--- a/app/build.gradle\n+++ b/app/build.gradle\n@@ -1,3 +1,3 @@\n android {\n-    compileSdk 30\n+    compileSdk 36\n }\n", "t", "ai")
        assertNull(r.changeSet)
        assertTrue(r.problems.single().contains("does not match"))
    }

    @Test fun `unsafe paths and secrets are rejected`() {
        val root = project()
        fun problems(path: String) = UnifiedPatch.toChangeSet(root, "--- /dev/null\n+++ b/$path\n@@ -0,0 +1 @@\n+x\n", "t", "ai").problems
        assertTrue(problems("../evil.sh").single().contains("Unsafe"))
        assertTrue(problems("a/../../evil").single().contains("Unsafe"))
        assertTrue(problems("release.jks").single().contains("secret"))
        assertTrue(problems(".git/hooks/pre-commit").single().contains(".git"))
        val abs = UnifiedPatch.toChangeSet(root, "--- /dev/null\n+++ /etc/passwd\n@@ -0,0 +1 @@\n+x\n", "t", "ai").problems
        assertTrue(abs.single().contains("Unsafe"))
        val sec = UnifiedPatch.toChangeSet(root, "--- a/keystore.properties\n+++ b/keystore.properties\n@@ -1 +1 @@\n-storePassword=x\n+storePassword=y\n", "t", "ai").problems
        assertTrue(sec.single().contains("secret"))
    }

    @Test fun `malformed, binary, rename and existing-file patches are rejected`() {
        val root = project()
        assertTrue(UnifiedPatch.toChangeSet(root, "hello", "t", "ai").problems.single().contains("No unified diff"))
        assertTrue(UnifiedPatch.toChangeSet(root, "--- a/x.png\n+++ b/x.png\nGIT binary patch\n", "t", "ai").problems.single().contains("Binary"))
        assertTrue(UnifiedPatch.toChangeSet(root, "--- a/app/build.gradle\n+++ b/app/build.gradle\n@@ -1,3 +1,3 @@\n android {\n", "t", "ai").problems.single().contains("counts"))
        assertTrue(UnifiedPatch.toChangeSet(root, "--- a/app/build.gradle\n+++ b/other.gradle\n@@ -1 +1 @@\n-android {\n+x {\n", "t", "ai").problems.single().contains("Renames"))
        assertTrue(UnifiedPatch.toChangeSet(root, "--- /dev/null\n+++ b/app/build.gradle\n@@ -0,0 +1 @@\n+x\n", "t", "ai").problems.single().contains("already exists"))
    }

    @Test fun `extract finds the diff block in a chat answer`() {
        val answer = "Here is the fix:\n\n```diff\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n```\nRebuild to confirm."
        val d = UnifiedPatch.extract(answer)
        assertNotNull(d)
        assertEquals(1, UnifiedPatch.parse(d!!).size)
        assertNull(UnifiedPatch.extract("No changes needed."))
    }

    @Test fun `applied ai patch can be undone`() {
        val root = project()
        val r = UnifiedPatch.toChangeSet(root, "--- a/app/build.gradle\n+++ b/app/build.gradle\n@@ -2 +2 @@\n-    compileSdk 33\n+    compileSdk 36\n", "t", "ai")
        assertTrue(r.problems.toString(), r.ok)
        val applier = ChangeApplier(root, tmp.newFolder("history"))
        val rec = applier.apply(r.changeSet!!)
        assertTrue(File(root, "app/build.gradle").readText().contains("36"))
        applier.undo(rec.changeSet.id)
        assertTrue(File(root, "app/build.gradle").readText().contains("33"))
    }
}
