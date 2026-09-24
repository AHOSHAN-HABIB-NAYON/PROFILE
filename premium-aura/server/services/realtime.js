'use strict';
/**
 * Thin wrapper around the Socket.IO server so models/services can emit
 * without importing the HTTP layer. Rooms:
 *   user:<id>  — private events for one user
 *   admins     — admin dashboards
 *   feed       — every authenticated socket (demo feed, broadcasts)
 */
let io = null;

function attach(server) { io = server; }
function toUser(userId, event, payload) { if (io && userId) io.to(`user:${userId}`).emit(event, payload); }
function toAdmins(event, payload) { if (io) io.to('admins').emit(event, payload); }
function broadcast(event, payload) { if (io) io.to('feed').emit(event, payload); }
function onlineCount() { return io ? io.of('/').sockets.size : 0; }

module.exports = { attach, toUser, toAdmins, broadcast, onlineCount };
