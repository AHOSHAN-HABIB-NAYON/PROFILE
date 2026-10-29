import { z } from 'zod';
import { ApiError } from '../errors.js';

/** The family if the caller is an active member; NOT_FOUND otherwise (existence is never revealed). */
export async function familyForMember(db, familyUuid, userId) {
  const id = z.uuid().safeParse(familyUuid);
  if (!id.success) throw new ApiError('NOT_FOUND');
  const row = await db('families as f')
    .join('family_members as m', 'm.family_id', 'f.id')
    .where({ 'f.uuid': id.data, 'm.user_id': userId })
    .whereNull('m.left_at')
    .whereNull('f.deleted_at')
    .first('f.*', 'm.role as my_role', 'm.id as my_member_row_id');
  if (!row) throw new ApiError('NOT_FOUND');
  return row;
}

/** An active member of `familyId` by the member's user uuid (member ids in the API are user uuids). */
export async function memberOf(db, familyId, memberUuid) {
  const id = z.uuid().safeParse(memberUuid);
  if (!id.success) throw new ApiError('NOT_FOUND');
  const row = await db('family_members as m')
    .join('users as u', 'u.id', 'm.user_id')
    .where({ 'm.family_id': familyId, 'u.uuid': id.data })
    .whereNull('m.left_at')
    .first('m.*', 'u.uuid', 'u.name', 'u.auth_provider');
  if (!row) throw new ApiError('NOT_FOUND');
  return row;
}

export const isAdultRole = (role) => role === 'parent' || role === 'guardian';

export function adultOnly(req) {
  if (req.session.isChildDevice || req.user.auth_provider === 'device') throw new ApiError('FORBIDDEN');
}
