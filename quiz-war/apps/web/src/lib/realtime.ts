import { comboTier } from '@quizwar/shared';
import { queryClient } from './query';
import { useAuth } from './auth';
import { useGame } from './game';
import { navigateTo } from './nav';
import { haptic } from './platform';
import { emit, onSocket } from './socket';
import { sfx } from './sound';
import { toast } from './toast';
import { api, friendlyError } from './api';

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
    s.on('match:player', ({ matchId, userId, connected }) => {
      const g = useGame.getState();
      if (g.matchId !== matchId || !g.snapshot) return;
      g.set({ snapshot: { ...g.snapshot, players: g.snapshot.players.map((p) => (p.userId === userId ? { ...p, connected } : p)) } });
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
      const id = toast.custom({
        kind: 'info',
        icon: '⚔️',
        title: 'Battle Request',
        body: `${req.from.username} challenged you! 1 VS 1 · ${req.questionCount} Questions · ${req.questionTimeSec}s/Question`,
        ttl: Math.max(3000, req.expiresAt - Date.now()),
        actions: [
          {
            label: 'Accept',
            primary: true,
            onClick: async () => {
              toast.dismiss(id);
              try {
                const r = await api<{ matchId: string }>(`/battles/requests/${req.id}/accept`, { method: 'POST' });
                useGame.getState().reset(r.matchId);
                navigateTo(`/war-room/${r.matchId}`);
              } catch (e) {
                toast.error('Could not accept', friendlyError(e));
              }
            },
          },
          {
            label: 'Decline',
            onClick: () => {
              toast.dismiss(id);
              void api(`/battles/requests/${req.id}/decline`, { method: 'POST' }).catch(() => undefined);
            },
          },
        ],
      });
      void queryClient.invalidateQueries({ queryKey: ['battle-requests'] });
    });
    s.on('battle:update', (req) => {
      void queryClient.invalidateQueries({ queryKey: ['battle-requests'] });
      const me = useAuth.getState().user?.id;
      if (req.from.id === me) {
        if (req.status === 'accepted' && req.matchId) {
          useGame.getState().reset(req.matchId);
          toast.success(`${req.to.username} accepted!`, 'Entering the War Room…', '⚔️');
          navigateTo(`/war-room/${req.matchId}`);
        } else if (req.status === 'declined') toast.info(`${req.to.username} declined your challenge`, undefined, '🛡️');
        else if (req.status === 'expired') toast.info('Challenge expired', `${req.to.username} didn't respond in time`, '⌛');
      }
    });

    s.on('notification:new', (n) => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      if (n.type === 'battle_request') return;
      if (n.type === 'achievement') sfx('reward');
      toast.info(n.title, n.body, n.type === 'achievement' ? '🏅' : '🔔');
    });
    s.on('account:update', (p) => useAuth.getState().patchUser(p));
    s.on('server:announcement', (a) => toast.info(a.title, a.body, '📢'));
    s.on('presence:update', () => void queryClient.invalidateQueries({ queryKey: ['friends'] }));
  });
}

export function showCombo(combo: number) {
  return comboTier(combo);
}

export { emit };
