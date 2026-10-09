import type { SquadRole } from '@quizwar/shared';
import { z } from 'zod';
import { exec, query, queryOne, tx } from '../../db/pool';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import type { NotificationService } from '../notifications/notification.service';
import { PUBLIC_USER_COLUMNS, toPublicUser } from '../users/users.repo';

export const squadCreateSchema = z.object({
  name: z.string().trim().min(3).max(40).regex(/^[\p{L}\p{N} _.-]+$/u, 'Letters, numbers, spaces, _ . -'),
  tag: z.string().trim().toUpperCase().min(2).max(6).regex(/^[A-Z0-9]+$/, '2–6 letters/numbers'),
  description: z.string().trim().max(300).optional().nullable(),
  isOpen: z.boolean().default(true),
});

const RANK: Record<SquadRole, number> = { captain: 3, officer: 2, member: 1 };

/** Squads (clans). Architecture is ready for Squad Wars: squad rooms use the generic team engine. */
export class SquadService {
  constructor(private readonly notifications: NotificationService) {}

  async membership(userId: number) {
    return queryOne<{ squad_id: number; role: SquadRole }>('SELECT squad_id, role FROM squad_members WHERE user_id = ?', [userId]);
  }

  private async requireRole(userId: number, squadId: number, min: SquadRole) {
    const m = await this.membership(userId);
    if (!m || m.squad_id !== squadId) throw forbidden('You are not in this squad');
    if (RANK[m.role] < RANK[min]) throw forbidden('Your squad role does not allow that');
    return m;
  }

  async create(userId: number, input: z.infer<typeof squadCreateSchema>) {
    if (await this.membership(userId)) throw conflict('Leave your current squad first', 'already_in_squad');
    return tx(async (conn) => {
      try {
        const res = await exec('INSERT INTO squads (name, tag, description, captain_id, is_open) VALUES (?, ?, ?, ?, ?)', [
          input.name,
          input.tag,
          input.description ?? null,
          userId,
          input.isOpen ? 1 : 0,
        ], conn);
        await exec(`INSERT INTO squad_members (squad_id, user_id, role) VALUES (?, ?, 'captain')`, [res.insertId, userId], conn);
        return { id: res.insertId };
      } catch (err: any) {
        if (err?.code === 'ER_DUP_ENTRY') throw conflict('Squad name or tag is already taken', 'squad_taken');
        throw err;
      }
    });
  }

  async get(squadId: number) {
    const s = await queryOne<any>(
      `SELECT s.id, s.name, s.tag, s.logo_url AS logoUrl, s.description, s.xp, s.rank_points AS rankPoints, s.member_limit AS memberLimit,
              s.is_open AS isOpen, s.created_at AS createdAt,
              (SELECT COUNT(*) FROM squad_members m WHERE m.squad_id = s.id) AS memberCount,
              (SELECT COUNT(*) + 1 FROM squads s2 WHERE s2.deleted_at IS NULL AND s2.xp > s.xp) AS squadRank
       FROM squads s WHERE s.id = ? AND s.deleted_at IS NULL`,
      [squadId],
    );
    if (!s) throw notFound('Squad not found');
    const members = await query<any>(
      `SELECT ${PUBLIC_USER_COLUMNS}, sm.role, sm.contributed_xp, sm.joined_at FROM squad_members sm
       JOIN users u ON u.id = sm.user_id JOIN user_profiles p ON p.user_id = u.id
       WHERE sm.squad_id = ? ORDER BY FIELD(sm.role, 'captain', 'officer', 'member'), sm.contributed_xp DESC`,
      [squadId],
    );
    return {
      ...s,
      isOpen: !!s.isOpen,
      xp: Number(s.xp),
      memberCount: Number(s.memberCount),
      squadRank: Number(s.squadRank),
      members: members.map((m) => ({ user: toPublicUser(m), role: m.role, contributedXp: Number(m.contributed_xp), joinedAt: m.joined_at })),
    };
  }

  async search(q: string, page: number, pageSize: number) {
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    return query<any>(
      `SELECT s.id, s.name, s.tag, s.logo_url AS logoUrl, s.xp, s.is_open AS isOpen,
              (SELECT COUNT(*) FROM squad_members m WHERE m.squad_id = s.id) AS memberCount, s.member_limit AS memberLimit
       FROM squads s WHERE s.deleted_at IS NULL ${q ? 'AND (s.name LIKE ? OR s.tag LIKE ?)' : ''}
       ORDER BY s.xp DESC LIMIT ? OFFSET ?`,
      q ? [like, like, pageSize, (page - 1) * pageSize] : [pageSize, (page - 1) * pageSize],
    );
  }

  async join(userId: number, squadId: number, viaInvite = false) {
    if (await this.membership(userId)) throw conflict('Leave your current squad first', 'already_in_squad');
    await tx(async (conn) => {
      const s = await queryOne<{ is_open: number; member_limit: number }>('SELECT is_open, member_limit FROM squads WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [squadId], conn);
      if (!s) throw notFound('Squad not found');
      if (!s.is_open && !viaInvite) throw forbidden('This squad is invite-only');
      const n = await queryOne<{ n: number }>('SELECT COUNT(*) n FROM squad_members WHERE squad_id = ?', [squadId], conn);
      if (Number(n?.n) >= s.member_limit) throw conflict('This squad is full', 'squad_full');
      await exec(`INSERT INTO squad_members (squad_id, user_id, role) VALUES (?, ?, 'member')`, [squadId, userId], conn);
    });
  }

  async leave(userId: number) {
    const m = await this.membership(userId);
    if (!m) return;
    await tx(async (conn) => {
      await exec('DELETE FROM squad_members WHERE user_id = ?', [userId], conn);
      if (m.role === 'captain') {
        const next = await queryOne<{ user_id: number }>(
          `SELECT user_id FROM squad_members WHERE squad_id = ? ORDER BY FIELD(role, 'officer', 'member'), joined_at LIMIT 1`,
          [m.squad_id],
          conn,
        );
        if (next) {
          await exec(`UPDATE squad_members SET role = 'captain' WHERE squad_id = ? AND user_id = ?`, [m.squad_id, next.user_id], conn);
          await exec('UPDATE squads SET captain_id = ? WHERE id = ?', [next.user_id, m.squad_id], conn);
        } else {
          // Empty squad: soft delete and free the name/tag.
          await exec(`UPDATE squads SET deleted_at = UTC_TIMESTAMP(), captain_id = NULL, name = CONCAT(name, '#', id), tag = CONCAT('X', id) WHERE id = ?`, [m.squad_id], conn);
        }
      }
    });
  }

  async invite(byUserId: number, squadId: number, targetId: number) {
    await this.requireRole(byUserId, squadId, 'officer');
    if (await this.membership(targetId)) throw conflict('Player is already in a squad', 'already_in_squad');
    const dup = await queryOne(`SELECT id FROM squad_invites WHERE squad_id = ? AND user_id = ? AND status = 'pending'`, [squadId, targetId]);
    if (dup) throw conflict('Already invited', 'already_invited');
    const res = await exec('INSERT INTO squad_invites (squad_id, user_id, invited_by) VALUES (?, ?, ?)', [squadId, targetId, byUserId]);
    const s = await queryOne<{ name: string }>('SELECT name FROM squads WHERE id = ?', [squadId]);
    await this.notifications.notify(targetId, {
      type: 'squad_invite',
      title: { en: 'Squad invitation', bn: 'স্কোয়াডের আমন্ত্রণ' },
      body: { en: `You were invited to join ${s?.name}.`, bn: `আপনাকে ${s?.name} স্কোয়াডে যোগ দিতে আমন্ত্রণ জানানো হয়েছে।` },
      url: `/squads/${squadId}`,
      data: { inviteId: res.insertId, squadId },
    });
  }

  async invites(userId: number) {
    return query<any>(
      `SELECT i.id, s.id AS squadId, s.name, s.tag, s.logo_url AS logoUrl FROM squad_invites i JOIN squads s ON s.id = i.squad_id
       WHERE i.user_id = ? AND i.status = 'pending' AND s.deleted_at IS NULL ORDER BY i.id DESC LIMIT 20`,
      [userId],
    );
  }

  async respondInvite(userId: number, inviteId: number, accept: boolean) {
    const inv = await queryOne<{ squad_id: number; user_id: number; status: string }>('SELECT squad_id, user_id, status FROM squad_invites WHERE id = ?', [inviteId]);
    if (!inv || inv.user_id !== userId || inv.status !== 'pending') throw notFound('Invitation not found');
    if (accept) await this.join(userId, inv.squad_id, true);
    await exec('UPDATE squad_invites SET status = ? WHERE id = ?', [accept ? 'accepted' : 'declined', inviteId]);
  }

  async kick(byUserId: number, squadId: number, targetId: number) {
    const me = await this.requireRole(byUserId, squadId, 'officer');
    const target = await this.membership(targetId);
    if (!target || target.squad_id !== squadId) throw notFound('Member not found');
    if (RANK[target.role] >= RANK[me.role]) throw forbidden('You can only remove members below your role');
    await exec('DELETE FROM squad_members WHERE squad_id = ? AND user_id = ?', [squadId, targetId]);
  }

  async setRole(byUserId: number, squadId: number, targetId: number, role: SquadRole) {
    await this.requireRole(byUserId, squadId, 'captain');
    if (targetId === byUserId) throw badRequest('Choose another member');
    const target = await this.membership(targetId);
    if (!target || target.squad_id !== squadId) throw notFound('Member not found');
    await tx(async (conn) => {
      if (role === 'captain') {
        await exec(`UPDATE squad_members SET role = 'officer' WHERE squad_id = ? AND user_id = ?`, [squadId, byUserId], conn);
        await exec('UPDATE squads SET captain_id = ? WHERE id = ?', [targetId, squadId], conn);
      }
      await exec('UPDATE squad_members SET role = ? WHERE squad_id = ? AND user_id = ?', [role, squadId, targetId], conn);
    });
  }

  async update(byUserId: number, squadId: number, patch: { description?: string | null; isOpen?: boolean; logoUrl?: string | null }) {
    await this.requireRole(byUserId, squadId, 'captain');
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.description !== undefined) (sets.push('description = ?'), params.push(patch.description));
    if (patch.isOpen !== undefined) (sets.push('is_open = ?'), params.push(patch.isOpen ? 1 : 0));
    if (patch.logoUrl !== undefined) (sets.push('logo_url = ?'), params.push(patch.logoUrl));
    if (sets.length) await exec(`UPDATE squads SET ${sets.join(', ')} WHERE id = ?`, [...params, squadId]);
  }
}
