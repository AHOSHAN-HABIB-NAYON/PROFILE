import type { Difficulty, PublicUser } from '@quizwar/shared';
import { useState } from 'react';
import { api, friendlyError } from '../lib/api';
import { num, useLang, useT } from '../lib/i18n';
import { haptic } from '../lib/platform';
import { sfx } from '../lib/sound';
import { toast } from '../lib/toast';
import { Avatar } from './Avatar';
import { CategoryPicker } from './CategoryPicker';
import { Icon } from './Icon';
import { CountPicker, DifficultyPicker, MatchSummary, useMatchOptions } from './MatchOptions';
import { Sheet } from './Sheet';
import { emit } from '../lib/socket';
import { navigateTo } from '../lib/nav';

export function ChallengeSheet({ target, onClose }: { target: PublicUser | null; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const [category, setCategory] = useState<number | null>(null);
  const opts = useMatchOptions();
  const [count, setCount] = useState(15);
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [busy, setBusy] = useState(false);
  // Every challenge first asks: Quiz or Ludo? (so the wrong game never starts)
  const [game, setGame] = useState<'quiz' | 'ludo'>('quiz');
  const ludoChallenge = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const r = await emit('ludo:create', { size: 2, teams: false });
      await emit('ludo:invite', { gameId: r.snapshot.id, to: target.id });
      haptic('success');
      toast.success(t('Ludo invite sent!', 'লুডুর ডাক পাঠানো হয়েছে!'), t(`Waiting for ${target.username} in the room…`, `রুমে ${target.username}-এর অপেক্ষা…`), 'gamepad');
      onClose();
      navigateTo(`/ludo/online/${r.snapshot.id}`);
    } catch (e) {
      toast.error(t('Could not invite', 'ডাকা গেল না'), friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={!!target} onClose={onClose} title={t('Send a challenge', 'চ্যালেঞ্জ পাঠান')} icon="swords">
      {target && (
        <div className="col">
          <div className="challenge-vs">
            <Avatar name={target.username} src={target.avatarThumbUrl} size={52} frame={target.frame} />
            <div className="grow">
              <b>{target.username}</b>
              <p className="xs muted">{target.uid} · {t('Level', 'লেভেল')} {num(target.level, lang)}</p>
            </div>
            <span className="chip danger"><Icon name="swords" /> 1 VS 1</span>
          </div>
          <div className="game-switch" role="tablist" aria-label={t('Which game?', 'কোন খেলা?')}>
            <button role="tab" aria-selected={game === 'quiz'} onClick={() => setGame('quiz')}><Icon name="brain" /> {t('Quiz', 'কুইজ')}</button>
            <button role="tab" aria-selected={game === 'ludo'} onClick={() => setGame('ludo')}><Icon name="gamepad" /> {t('Ludo', 'লুডু')}</button>
          </div>
          {game === 'ludo' ? (
            <>
              <p className="small muted" style={{ margin: '4px 2px' }}>{t('A Ludo room opens and your friend gets an invite. Start when they join.', 'একটি লুডু রুম খুলবে আর বন্ধুর কাছে ডাক যাবে। সে এলে খেলা শুরু করুন।')}</p>
              <button className="btn primary lg block" disabled={busy} onClick={() => void ludoChallenge()}>
                {busy ? <span className="spinner" /> : <Icon name="gamepad" />} {t('Invite to Ludo', 'লুডু খেলতে ডাকুন')}
              </button>
            </>
          ) : (
          <>
          <div className="section-label" style={{ marginTop: 8 }}>{t('Category', 'ক্যাটাগরি')}</div>
          <CategoryPicker value={category} onChange={setCategory} />
          <CountPicker value={count} onChange={setCount} />
          <DifficultyPicker value={difficulty} onChange={setDifficulty} />
          <MatchSummary count={count} difficulty={difficulty} seconds={opts.timeFor(difficulty)} />
          <button
            className="btn primary lg block"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api('/battles/requests', { body: { userId: target.id, categoryId: category, questionCount: count, difficulty } });
                sfx('start');
                haptic('success');
                toast.success(t('Challenge sent!', 'চ্যালেঞ্জ পাঠানো হয়েছে!'), t(`Waiting for ${target.username} to accept…`, `${target.username}-এর উত্তরের অপেক্ষায়…`), 'swords');
                onClose();
              } catch (e) {
                toast.error(t('Could not challenge', 'চ্যালেঞ্জ পাঠানো যায়নি'), friendlyError(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <span className="spinner" /> : <Icon name="swords" />} {t('Send challenge', 'চ্যালেঞ্জ পাঠান')}
          </button>
          </>
          )}
        </div>
      )}
    </Sheet>
  );
}
