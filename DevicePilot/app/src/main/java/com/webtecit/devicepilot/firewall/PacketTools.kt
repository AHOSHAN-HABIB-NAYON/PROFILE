package com.webtecit.devicepilot.firewall

/**
 * Minimal, allocation-light helpers for the blocking firewall. Packets that reach the
 * tunnel belong only to apps the user chose to block. For TCP we answer with a RST so
 * the blocked app fails immediately instead of waiting for a timeout. Nothing is
 * forwarded and payloads are never inspected or stored.
 */
object PacketTools {

    const val PROTO_TCP = 6
    private const val FLAG_FIN = 0x01
    private const val FLAG_SYN = 0x02
    private const val FLAG_RST = 0x04
    private const val FLAG_ACK = 0x10

    fun ipVersion(p: ByteArray, len: Int): Int = if (len < 1) 0 else (p[0].toInt() ushr 4) and 0xF

    /** Builds a TCP reset answering [p], or null if [p] is not a TCP segment we should answer. */
    fun buildTcpReset(p: ByteArray, len: Int): ByteArray? = when (ipVersion(p, len)) {
        4 -> resetV4(p, len)
        6 -> resetV6(p, len)
        else -> null
    }

    private fun resetV4(p: ByteArray, len: Int): ByteArray? {
        if (len < 20) return null
        val ihl = (p[0].toInt() and 0x0F) * 4
        if (ihl < 20 || len < ihl + 20) return null
        if (u8(p, 9) != PROTO_TCP) return null
        val total = minOf(u16(p, 2), len)
        val tcp = buildTcp(p, ihl, total - ihl) ?: return null
        val out = ByteArray(40)
        out[0] = 0x45
        put16(out, 2, 40)
        put16(out, 6, 0x4000) // don't fragment
        out[8] = 64
        out[9] = PROTO_TCP.toByte()
        System.arraycopy(p, 16, out, 12, 4) // src = original dst
        System.arraycopy(p, 12, out, 16, 4) // dst = original src
        put16(out, 10, checksum(out, 0, 20, 0))
        System.arraycopy(tcp, 0, out, 20, 20)
        var pseudo = 0L
        pseudo += sumWords(out, 12, 8)
        pseudo += PROTO_TCP + 20
        put16(out, 36, checksum(out, 20, 20, pseudo))
        return out
    }

    private fun resetV6(p: ByteArray, len: Int): ByteArray? {
        if (len < 60) return null
        if (u8(p, 6) != PROTO_TCP) return null // extension headers are not handled; packet is just dropped
        val payload = minOf(u16(p, 4), len - 40)
        val tcp = buildTcp(p, 40, payload) ?: return null
        val out = ByteArray(60)
        out[0] = 0x60
        put16(out, 4, 20)
        out[6] = PROTO_TCP.toByte()
        out[7] = 64
        System.arraycopy(p, 24, out, 8, 16)
        System.arraycopy(p, 8, out, 24, 16)
        System.arraycopy(tcp, 0, out, 40, 20)
        var pseudo = sumWords(out, 8, 32)
        pseudo += 20 + PROTO_TCP
        put16(out, 56, checksum(out, 40, 20, pseudo))
        return out
    }

    /** Returns a 20-byte TCP RST header (checksum zero) for the segment at [off]. */
    private fun buildTcp(p: ByteArray, off: Int, segLen: Int): ByteArray? {
        if (segLen < 20) return null
        val flags = u8(p, off + 13)
        if (flags and FLAG_RST != 0) return null
        val dataOffset = ((u8(p, off + 12) ushr 4) and 0xF) * 4
        val payloadLen = (segLen - dataOffset).coerceAtLeast(0)
        val seq = u32(p, off + 4)
        val ack = u32(p, off + 8)
        val t = ByteArray(20)
        // ports swapped
        t[0] = p[off + 2]; t[1] = p[off + 3]; t[2] = p[off]; t[3] = p[off + 1]
        if (flags and FLAG_ACK != 0) {
            put32(t, 4, ack)
            t[13] = FLAG_RST.toByte()
        } else {
            var advance = payloadLen.toLong()
            if (flags and FLAG_SYN != 0) advance++
            if (flags and FLAG_FIN != 0) advance++
            put32(t, 4, 0)
            put32(t, 8, (seq + advance) and 0xFFFFFFFFL)
            t[13] = (FLAG_RST or FLAG_ACK).toByte()
        }
        t[12] = (5 shl 4).toByte()
        return t
    }

    fun checksum(b: ByteArray, off: Int, len: Int, initial: Long): Int {
        var sum = initial + sumWords(b, off, len)
        while (sum ushr 16 != 0L) sum = (sum and 0xFFFF) + (sum ushr 16)
        return (sum.inv() and 0xFFFF).toInt()
    }

    private fun sumWords(b: ByteArray, off: Int, len: Int): Long {
        var sum = 0L
        var i = off
        val end = off + len
        while (i + 1 < end) { sum += u16(b, i); i += 2 }
        if (i < end) sum += (u8(b, i) shl 8)
        return sum
    }

    fun u8(b: ByteArray, i: Int) = b[i].toInt() and 0xFF
    fun u16(b: ByteArray, i: Int) = (u8(b, i) shl 8) or u8(b, i + 1)
    fun u32(b: ByteArray, i: Int): Long =
        (u8(b, i).toLong() shl 24) or (u8(b, i + 1).toLong() shl 16) or (u8(b, i + 2).toLong() shl 8) or u8(b, i + 3).toLong()

    private fun put16(b: ByteArray, i: Int, v: Int) { b[i] = (v ushr 8).toByte(); b[i + 1] = v.toByte() }
    private fun put32(b: ByteArray, i: Int, v: Long) {
        b[i] = (v ushr 24).toByte(); b[i + 1] = (v ushr 16).toByte(); b[i + 2] = (v ushr 8).toByte(); b[i + 3] = v.toByte()
    }
}
