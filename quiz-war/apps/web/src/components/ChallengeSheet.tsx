import type { PublicUser } from '@quizwar/shared';
import { useState } from 'react';
import { api, friendlyError } from '../lib/api';
import { haptic } from '../lib/platform';
import { sfx } from '../lib/sound';
import { toast } from '../lib/toast';
import { Avatar } from './Avatar';
import { CategoryPicker } from './CategoryPicker';
import { Sheet } from './Sheet';

export function ChallengeSheet({ target, onClose }: { target: PublicUser | null; onClose: () => void }) {
  const [category, setCategory] = useState<number | null>(null);
  const [count, setCount] = useState(15);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open={!!target} onClose={onClose} title="⚔️ Battle Request">
      {target && (
        <div className="col">
          <div className="row"><Avatar name={target.username} src={target.avatarThumbUrl} size={48} /><div><b>{target.username}</b><p className="xs muted">{target.uid} · Lv {target.level}</p></div></div>
          <div className="section-label" style={{ marginTop: 6 }}>Category</div>
          <CategoryPicker value={category} onChange={setCategory} />
          <div className="section-label">Questions</div>
          <div className="tabs" role="radiogroup">
            {[5, 10, 15, 20].map((n) => <button key={n} role="radio" aria-checked={count === n} aria-selected={count === n} onClick={() => setCount(n)}>{n}</button>)}
          </div>
          <p className="xs muted">1 VS 1 · {count} Questions · unranked friendly battle</p>
          <button
            className="btn primary lg block"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api('/battles/requests', { body: { userId: target.id, categoryId: category, questionCount: count } });
                sfx('start');
                haptic('success');
                toast.success('Challenge sent!', `Waiting for ${target.username} to accept…`, '⚔️');
                onClose();
              } catch (e) {
                toast.error('Could not challenge', friendlyError(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Send Challenge
          </button>
        </div>
      )}
    </Sheet>
  );
}
