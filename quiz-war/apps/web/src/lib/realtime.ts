import { comboTier } from '@quizwar/shared';
import { queryClient } from './query';
import { useAuth } from './auth';
import { useGame } from './game';
import { navigateTo } from './nav';
import { haptic } from './platform';
import { emit, onSocket } from './socket';
import { sfx } from './sound';
import { toast } from './toast';
import { notificationIcon } from '../components/Icon';
import { tr } from './i18n';
import { useInvites } from './invites';

/** Wires server push events into client state. Registered once at startup. */
export function registerRealtime() {
  onSocket((s) => {
    s.on('room:state', (snap) => {
      const g = useGame.getState();
      if (!g.matchId || g.matchId === snap.matchId) g.applySnapshot(snap);
    });
    s.on('match:countdown', ({ matchId, startsAt }) => {
      const g = useGame.getState();
      if (g.matchId !== matchId) g.reset(matchId);
      useGame.getState().set({ countdownAt: startsAt, end: null });
      sfx('start');
      // The host started a war room this player left open in the background: go to the match.
      if (useAuth.getState().openRoomId === matchId) {
        useAuth.setState({ openRoomId: null, activeMatchId: matchId });
        if (!location.pathname.startsWith('/match/')) navigateTo(`/match/${matchId}`);
      }
    });
    s.on('match:question', ({ matchId, question }) => {
      const g = useGame.getState();
      if (g.matchId !== matchId) return;
      g.set({ question, deadline: question.deadline, reveal: null, myPick: null, myResult: null, answered: [], removed: [], hint: null, countdownAt: null });
    });
    s.on('match:answered', ({ matchId, userId }) => {
      const g = useGame.getState();
      if (g.matchId !== matchId || g.answered.includes(userId)) return;
      g.set({ answered: [...g.answered, userId] });
    });
    s.on('match:reveal', (r) => {
      const g = useGame.getState();
      if (g.matchId !== r.matchId) return;
      const me = useAuth.getState().user?.id;
      const mine = r.results.find((x) => x.userId === me);
      g.set({ reveal: r });
      if (g.snapshot) {
        const players = g.snapshot.players.map((p) => {
          const x = r.results.find((y) => y.userId === p.userId);
          return x ? { ...p, score: x.score, combo: x.combo, correct: p.correct + (x.correct ? 1 : 0) } : p;
        });
        g.set({ snapshot: { ...g.snapshot, players, teamScores: r.teamScores } });
      }
      if (mine && !g.myResult) {
        sfx(mine.correct ? 'correct' : 'wrong');
        haptic(mine.correct ? 'success' : 'error');
      }
    });
    s.on('match:player', ({ matchId, userId, connected, graceUntil }) => {
      const g = useGame.getState();
      if (g.matchId !== matchId || !g.snapshot) return;
      g.set({ snapshot: { ...g.snapshot, players: g.snapshot.players.map((p) => (p.userId === userId ? { ...p, connected, graceUntil: connected ? null : graceUntil } : p)) } });
    });
    s.on('match:end', (end) => {
      const g = useGame.getState();
      if (g.matchId !== end.matchId) return;
      g.set({ end });
      useAuth.setState({ activeMatchId: null });
      void queryClient.invalidateQueries({ queryKey: ['me'] });
    });

    s.on('mm:found', ({ matchId }) => {
      useGame.getState().reset(matchId);
      navigateTo(`/match/${matchId}`);
    });

    s.on('battle:request', (req) => {
      sfx('notify');
      haptic('heavy');
      useInvites.getState().addBattle(req);
      void queryClient.invalidateQueries({ queryKey: ['battle-requests'] });
    });
    s.on('battle:update', (req) => {
      void queryClient.invalidateQueries({ queryKey: ['battle-requests'] });
      if (req.status !== 'pending') useInvites.getState().removeBattle(req.id);
      const me = useAuth.getState().user?.id;
      if (req.from.id === me) {
        if (req.status === 'accepted' && req.matchId) {
          useGame.getState().reset(req.matchId);
          toast.success(tr(`${req.to.username} accepted!`, `${req.to.username} চ্যালেঞ্জ গ্রহণ করেছে!`), tr('Entering the War Room…', 'ওয়ার রুমে যাচ্ছেন…'), 'swords');
          navigateTo(`/war-room/${req.matchId}`);
        } else if (req.status === 'declined') toast.info(tr(`${req.to.username} declined your challenge`, `${req.to.username} চ্যালেঞ্জ ফিরিয়ে দিয়েছে`), undefined, 'shield');
        else if (req.status === 'expired') toast.info(tr('Challenge expired', 'চ্যালেঞ্জের সময় শেষ'), tr(`${req.to.username} didn't respond in time`, `${req.to.username} সময়মতো সাড়া দেয়নি`), 'hourglass');
      }
    });

    s.on('notification:new', (n) => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      if (n.type === 'battle_request') return;
      if (n.type === 'friend_request' && (n.data as any)?.requestId && (n.data as any)?.from) {
        sfx('notify');
        haptic('tap');
        useInvites.getState().addFriend({ requestId: Number((n.data as any).requestId), from: (n.data as any).from });
        void queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
        return;
      }
      if (n.type === 'achievement' || n.type === 'mission' || n.type === 'reward') sfx('reward');
      else sfx('notify');
      if (n.type === 'mission') void queryClient.invalidateQueries({ queryKey: ['missions'] });
      if (n.type === 'friend_accepted') void queryClient.invalidateQueries({ queryKey: ['friends'] });
      toast.info(n.title, n.body, notificationIcon(n.type).icon);
    });
    s.on('account:update', (p) => useAuth.getState().patchUser(p));
    s.on('missions:update', () => void queryClient.invalidateQueries({ queryKey: ['missions'] }));
    s.on('match:afk_warning', ({ limit }) => {
      haptic('error');
      sfx('tick');
      toast.custom({
        kind: 'error',
        icon: 'hourglass',
        title: tr('Are you still there?', 'আপনি কি আছেন?'),
        body: tr(`Miss ${limit} questions in a row and you’ll be removed from the match with a penalty.`, `পরপর ${limit}টি প্রশ্নের উত্তর না দিলে ম্যাচ থেকে বের করে দেওয়া হবে এবং জরিমানা কাটা হবে।`),
        ttl: 6000,
      });
    });
    s.on('match:reaction', (r) => {
      const g = useGame.getState();
      if (g.matchId !== r.matchId) return;
      g.addReaction(r);
    });
    s.on('server:announcement', (a) => toast.info(a.title, a.body, 'bell-ring'));
    s.on('presence:update', () => void queryClient.invalidateQueries({ queryKey: ['friends'] }));
  });
}

export function showCombo(combo: number) {
  return comboTier(combo);
}

export { emit };
