package com.webtecit.devicepilot

import com.webtecit.devicepilot.firewall.PacketTools
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class PacketToolsTest {

    private fun ipv4Syn(seq: Long = 1000): ByteArray {
        val p = ByteArray(40)
        p[0] = 0x45; p[2] = 0; p[3] = 40; p[8] = 64; p[9] = 6
        byteArrayOf(10, 215.toByte(), 0, 1).copyInto(p, 12)       // src 10.215.0.1
        byteArrayOf(1, 1, 1, 1).copyInto(p, 16)                    // dst 1.1.1.1
        p[20] = 0xC3.toByte(); p[21] = 0x50                         // src port 50000
        p[22] = 0x01; p[23] = 0xBB.toByte()                         // dst port 443
        p[24] = (seq ushr 24).toByte(); p[25] = (seq ushr 16).toByte(); p[26] = (seq ushr 8).toByte(); p[27] = seq.toByte()
        p[32] = 0x50; p[33] = 0x02                                  // data offset 5, SYN
        return p
    }

    @Test fun ipv4SynGetsRstAck() {
        val r = PacketTools.buildTcpReset(ipv4Syn(), 40)
        assertNotNull(r); r!!
        assertEquals(40, r.size)
        // addresses swapped
        assertEquals(1, r[12].toInt()); assertEquals(10, r[16].toInt())
        // ports swapped
        assertEquals(443, PacketTools.u16(r, 20)); assertEquals(50000, PacketTools.u16(r, 22))
        // RST|ACK and ack = seq + 1
        assertEquals(0x14, PacketTools.u8(r, 33))
        assertEquals(1001L, PacketTools.u32(r, 28))
        // IP header checksum verifies to zero
        assertEquals(0, PacketTools.checksum(r, 0, 20, 0))
        // TCP checksum verifies with pseudo header
        var pseudo = 0L
        for (i in 12 until 20 step 2) pseudo += PacketTools.u16(r, i)
        pseudo += 6 + 20
        assertEquals(0, PacketTools.checksum(r, 20, 20, pseudo))
    }

    @Test fun ackSegmentGetsPlainRst() {
        val p = ipv4Syn()
        p[33] = 0x10 // ACK
        p[28] = 0; p[29] = 0; p[30] = 0x30; p[31] = 0x39 // ack = 12345
        val r = PacketTools.buildTcpReset(p, 40)!!
        assertEquals(0x04, PacketTools.u8(r, 33))
        assertEquals(12345L, PacketTools.u32(r, 24))
    }

    @Test fun rstIsNeverAnswered() {
        val p = ipv4Syn(); p[33] = 0x04
        assertNull(PacketTools.buildTcpReset(p, 40))
    }

    @Test fun udpIsDroppedWithoutAnswer() {
        val p = ipv4Syn(); p[9] = 17
        assertNull(PacketTools.buildTcpReset(p, 40))
    }

    @Test fun truncatedPacketIsIgnored() = assertNull(PacketTools.buildTcpReset(ipv4Syn(), 10))

    @Test fun ipv6Syn() {
        val p = ByteArray(60)
        p[0] = 0x60; p[5] = 20; p[6] = 6; p[7] = 64
        p[8] = 0xFD.toByte(); p[23] = 1        // src fd..::1
        p[24] = 0x26; p[39] = 2                // dst 26..::2
        p[40] = 0x13; p[41] = 0x88.toByte(); p[42] = 0x00; p[43] = 0x50
        p[47] = 7; p[52] = 0x50; p[53] = 0x02
        val r = PacketTools.buildTcpReset(p, 60)!!
        assertEquals(60, r.size)
        assertEquals(0x26, PacketTools.u8(r, 8)); assertEquals(0xFD, PacketTools.u8(r, 24))
        assertEquals(8L, PacketTools.u32(r, 48))
        var pseudo = 0L
        for (i in 8 until 40 step 2) pseudo += PacketTools.u16(r, i)
        pseudo += 20 + 6
        assertEquals(0, PacketTools.checksum(r, 40, 20, pseudo))
    }
}
