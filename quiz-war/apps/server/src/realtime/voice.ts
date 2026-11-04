import type { VoiceIceServer, VoicePeer } from '@quizwar/shared';

const STUN: VoiceIceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];

/**
 * Live voice rooms (one per match / war room). Audio goes phone-to-phone (WebRTC); the server
 * only keeps who is in which room and relays the small connection messages.
 */
export class VoiceRooms {
  /** roomId → userId → { socket, mic } */
  private rooms = new Map<string, Map<number, { socketId: string; mic: boolean }>>();
  private ice: { at: number; list: VoiceIceServer[] } | null = null;

  constructor(private readonly turn: { keyId?: string; token?: string }, private readonly log: { warn: (o: object, m: string) => void }) {}

  peers(roomId: string): VoicePeer[] {
    return [...(this.rooms.get(roomId)?.entries() ?? [])].map(([userId, v]) => ({ userId, mic: v.mic }));
  }

  socketOf(roomId: string, userId: number) {
    return this.rooms.get(roomId)?.get(userId)?.socketId ?? null;
  }

  has(roomId: string, userId: number) {
    return !!this.rooms.get(roomId)?.has(userId);
  }

  /** Returns the socket this user had in the room before (another device), if any. */
  join(roomId: string, userId: number, socketId: string, mic: boolean) {
    let room = this.rooms.get(roomId);
    if (!room) {
      if (this.rooms.size > 5000) throw new Error('too many voice rooms');
      room = new Map();
      this.rooms.set(roomId, room);
    }
    const old = room.get(userId)?.socketId;
    room.set(userId, { socketId, mic });
    return old && old !== socketId ? old : null;
  }

  setMic(roomId: string, userId: number, on: boolean) {
    const v = this.rooms.get(roomId)?.get(userId);
    if (!v) return false;
    v.mic = on;
    return true;
  }

  leave(roomId: string, userId: number, socketId?: string) {
    const room = this.rooms.get(roomId);
    const v = room?.get(userId);
    if (!room || !v || (socketId && v.socketId !== socketId)) return false;
    room.delete(userId);
    if (!room.size) this.rooms.delete(roomId);
    return true;
  }

  /** Rooms this socket was in (on disconnect). */
  leaveSocket(socketId: string): { roomId: string; userId: number }[] {
    const out: { roomId: string; userId: number }[] = [];
    for (const [roomId, room] of this.rooms) {
      for (const [userId, v] of room) {
        if (v.socketId !== socketId) continue;
        room.delete(userId);
        out.push({ roomId, userId });
      }
      if (!room.size) this.rooms.delete(roomId);
    }
    return out;
  }

  /** STUN always; Cloudflare TURN relay when configured (short-lived credentials, cached). */
  async iceServers(): Promise<VoiceIceServer[]> {
    const { keyId, token } = this.turn;
    if (!keyId || !token) return STUN;
    if (this.ice && Date.now() - this.ice.at < 6 * 3600_000) return this.ice.list;
    try {
      const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ttl: 86_400 }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`TURN ${res.status}`);
      const j = (await res.json()) as { iceServers?: VoiceIceServer | VoiceIceServer[] };
      const list = Array.isArray(j.iceServers) ? j.iceServers : j.iceServers ? [j.iceServers] : [];
      // Port 53 is blocked by many browsers; drop those URLs.
      const clean = list
        .map((s) => ({ ...s, urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => !/:53(\?|$)/.test(u)) }))
        .filter((s) => s.urls.length);
      this.ice = { at: Date.now(), list: [...STUN, ...clean] };
      return this.ice.list;
    } catch (err) {
      this.log.warn({ err }, 'turn credentials failed');
      return STUN;
    }
  }
}
