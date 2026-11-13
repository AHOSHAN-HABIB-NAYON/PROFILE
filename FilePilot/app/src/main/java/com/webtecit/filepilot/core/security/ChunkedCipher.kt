package com.webtecit.filepilot.core.security

import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.EOFException
import java.io.InputStream
import java.io.OutputStream
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive

/**
 * Encrypts a stream with AES-256-GCM in independent 1 MB chunks so memory use stays small for
 * any file size. Each chunk has its own random 96-bit nonce and authentication tag, and the
 * chunk index is bound as associated data so chunks can't be reordered, dropped or appended.
 *
 * Format: "FPV1" | header length | header | chunks (length, nonce, ciphertext+tag) | end marker.
 */
object ChunkedCipher {
    private val MAGIC = byteArrayOf('F'.code.toByte(), 'P'.code.toByte(), 'V'.code.toByte(), '1'.code.toByte())
    const val CHUNK = 1 shl 20
    private const val NONCE = 12
    private const val TAG_BITS = 128
    private val random = SecureRandom()

    fun newDataKey(): SecretKey = SecretKeySpec(ByteArray(32).also(random::nextBytes), "AES")

    /** Writes [header] (for example the wrapped data key) and the encrypted content of [input]. */
    suspend fun encrypt(input: InputStream, output: OutputStream, key: SecretKey, header: ByteArray, onProgress: (Long) -> Unit = {}) {
        val out = DataOutputStream(output)
        out.write(MAGIC)
        out.writeInt(header.size)
        out.write(header)
        val buffer = ByteArray(CHUNK)
        var index = 0L
        var total = 0L
        while (true) {
            currentCoroutineContext().ensureActive()
            val n = readFully(input, buffer)
            if (n <= 0) break
            val nonce = ByteArray(NONCE).also(random::nextBytes)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(TAG_BITS, nonce))
            cipher.updateAAD(aad(index, last = false))
            val ct = cipher.doFinal(buffer, 0, n)
            out.writeInt(ct.size)
            out.write(nonce)
            out.write(ct)
            total += n
            index++
            onProgress(total)
        }
        // A final authenticated empty chunk marks the true end of the file (detects truncation).
        val nonce = ByteArray(NONCE).also(random::nextBytes)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(TAG_BITS, nonce))
        cipher.updateAAD(aad(index, last = true))
        val end = cipher.doFinal(ByteArray(0))
        out.writeInt(end.size)
        out.write(nonce)
        out.write(end)
        out.flush()
    }

    /** Reads the header written by [encrypt]. */
    fun readHeader(input: InputStream): ByteArray {
        val din = DataInputStream(input)
        val magic = ByteArray(4)
        din.readFully(magic)
        require(magic.contentEquals(MAGIC)) { "Not a FilePilot vault file." }
        val len = din.readInt()
        require(len in 0..4096) { "Damaged vault file." }
        return ByteArray(len).also(din::readFully)
    }

    /** Decrypts content after [readHeader]; throws if anything was modified or cut off. */
    suspend fun decrypt(input: InputStream, output: OutputStream, key: SecretKey, onProgress: (Long) -> Unit = {}) {
        val din = DataInputStream(input)
        var index = 0L
        var total = 0L
        while (true) {
            currentCoroutineContext().ensureActive()
            val len = try { din.readInt() } catch (e: EOFException) { throw SecurityException("The encrypted file is incomplete.") }
            require(len in 16..(CHUNK + 16)) { "Damaged vault file." }
            val nonce = ByteArray(NONCE).also(din::readFully)
            val ct = ByteArray(len).also(din::readFully)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, nonce))
            if (len == 16) {
                cipher.updateAAD(aad(index, last = true))
                cipher.doFinal(ct)
                break
            }
            cipher.updateAAD(aad(index, last = false))
            val plain = cipher.doFinal(ct)
            output.write(plain)
            total += plain.size
            index++
            onProgress(total)
        }
        output.flush()
    }

    private fun aad(index: Long, last: Boolean): ByteArray =
        java.nio.ByteBuffer.allocate(9).putLong(index).put(if (last) 1 else 0).array()

    private fun readFully(input: InputStream, buffer: ByteArray): Int {
        var read = 0
        while (read < buffer.size) {
            val n = input.read(buffer, read, buffer.size - read)
            if (n < 0) break
            read += n
        }
        return read
    }
}
