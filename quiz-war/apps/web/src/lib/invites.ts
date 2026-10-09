import type { BattleRequestView } from '@quizwar/shared';
import { create } from 'zustand';

export interface FriendInvite {
  requestId: number;
  from: { id: number; username: string; uid: string; avatar: string | null; level: number };
}

/** Incoming invitations waiting for an Accept / Decline answer (shown as popups, one at a time). */
interface InviteState {
  battles: BattleRequestView[];
  friends: FriendInvite[];
  addBattle: (r: BattleRequestView) => void;
  removeBattle: (id: number) => void;
  addFriend: (f: FriendInvite) => void;
  removeFriend: (requestId: number) => void;
}

export const useInvites = create<InviteState>((set, get) => ({
  battles: [],
  friends: [],
  addBattle: (r) => set({ battles: [...get().battles.filter((x) => x.id !== r.id), r] }),
  removeBattle: (id) => set({ battles: get().battles.filter((x) => x.id !== id) }),
  addFriend: (f) => set({ friends: [...get().friends.filter((x) => x.requestId !== f.requestId), f] }),
  removeFriend: (requestId) => set({ friends: get().friends.filter((x) => x.requestId !== requestId) }),
}));
