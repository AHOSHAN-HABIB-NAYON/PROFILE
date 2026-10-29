// Socket.IO realtime (docs/CONTRACTS/websocket-events.md). Namespace /rt.
// Clients authenticate with the access JWT; the server alone decides rooms: each socket joins only
// `user:<uuid>`. Events are sent to the user rooms of the members allowed to see them (consent rules
// are applied by the sender, see family/visibility.js), so a socket never receives data it may not see.
import { Server } from 'socket.io';
import crypto from 'node:crypto';

/** A hub that works before (and without) a socket server: emits are dropped until attach() runs. */
export function createRealtimeHub() {
  let io = null;
  return {
    attach(server) {
      io = server;
    },
    /** Admin panel sockets (Phase 8) join `admins`: chat alerts only, never location data. */
    emitToAdmins(event, data, now = new Date()) {
      if (!io) return;
      io.of('/rt').to('admins').emit(event, { v: 1, id: crypto.randomUUID(), at: now.toISOString(), data });
    },
    /** Closes the sockets of deleted or blocked users. */
    disconnectUsers(userUuids) {
      if (!io) return;
      for (const u of userUuids ?? []) io.of('/rt').in(`user:${u}`).disconnectSockets(true);
    },
    /** Sends `event` to each user uuid's room with the standard envelope. */
    emitToUsers(userUuids, event, data, now = new Date()) {
      if (!io || !userUuids?.length) return;
      const envelope = { v: 1, id: crypto.randomUUID(), at: now.toISOString(), data };
      for (const u of new Set(userUuids)) io.of('/rt').to(`user:${u}`).emit(event, envelope);
    },
  };
}

export function attachRealtime(httpServer, ctx) {
  const io = new Server(httpServer, {
    path: '/socket.io',
    serveClient: false,
    cors: { origin: ctx.cfg.corsOrigins.length ? ctx.cfg.corsOrigins : false },
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });
  const rt = io.of('/rt');
  rt.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) throw Object.assign(new Error('auth'), { data: { code: 'AUTH_REQUIRED' } });
      let claims;
      try {
        claims = ctx.tokens.verifyAccess(token);
      } catch (e) {
        const code = e?.code === 'AUTH_TOKEN_EXPIRED' ? 'AUTH_TOKEN_EXPIRED' : 'AUTH_REQUIRED';
        throw Object.assign(new Error('auth'), { data: { code } });
      }
      const row = await ctx.sessions.active(claims.sid);
      if (!row || row.uuid !== claims.sub || row.revoked_at || row.expires_at <= ctx.clock.now() || row.status !== 'active') {
        throw Object.assign(new Error('auth'), { data: { code: 'AUTH_REFRESH_INVALID' } });
      }
      socket.data.userUuid = row.uuid;
      next();
    } catch (e) {
      next(e instanceof Error ? e : new Error('auth'));
    }
  });
  rt.on('connection', (socket) => {
    socket.join(`user:${socket.data.userUuid}`);
    socket.on('presence.ping', (_, ack) => typeof ack === 'function' && ack({ ok: true }));
  });
  ctx.realtime.attach(io);
  return io;
}
