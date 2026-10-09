import type { PublicUser } from '@quizwar/shared';
import { useState } from 'react';
import { api, friendlyError } from '../lib/api';
import { num, useLang, useT } from '../lib/i18n';
import { haptic } from '../lib/platform';
import { sfx } from '../lib/sound';
import { toast } from '../lib/toast';
import { Avatar } from './Avatar';
import { CategoryPicker } from './CategoryPicker';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

export function ChallengeSheet({ target, onClose }: { target: PublicUser | null; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const [category, setCategory] = useState<number | null>(null);
  const [count, setCount] = useState(15);
  const [busy, setBusy] = useState(false);
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
          <div className="section-label" style={{ marginTop: 8 }}>{t('Category', 'ক্যাটাগরি')}</div>
          <CategoryPicker value={category} onChange={setCategory} />
          <div className="section-label">{t('Questions', 'প্রশ্নের সংখ্যা')}</div>
          <div className="tabs" role="radiogroup" aria-label={t('Questions', 'প্রশ্নের সংখ্যা')}>
            {[5, 10, 15, 20].map((n) => (
              <button key={n} role="radio" aria-checked={count === n} aria-selected={count === n} onClick={() => setCount(n)}>{num(n, lang)}</button>
            ))}
          </div>
          <p className="xs muted">{t(`Friendly unranked battle · ${count} questions`, `বন্ধুত্বপূর্ণ আনর‍্যাংকড ব্যাটল · ${num(count, lang)}টি প্রশ্ন`)}</p>
          <button
            className="btn primary lg block"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api('/battles/requests', { body: { userId: target.id, categoryId: category, questionCount: count } });
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
        </div>
      )}
    </Sheet>
  );
}
