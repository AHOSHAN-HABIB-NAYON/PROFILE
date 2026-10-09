import type { PresenceStatus } from '@quizwar/shared';
import { tr } from '../lib/i18n';
import { Icon } from './Icon';

const STATUS: Record<PresenceStatus, [string, string]> = {
  online: ['Online', 'অনলাইন'],
  away: ['Away', 'দূরে'],
  in_match: ['In a match', 'খেলছে'],
  offline: ['Offline', 'অফলাইন'],
  dnd: ['Do not disturb', 'বিরক্ত করবেন না'],
};

export const statusLabel = (s: PresenceStatus) => tr(...STATUS[s]);

export function Avatar({
  name,
  src,
  size = 44,
  status,
  frame,
  bot,
}: {
  name: string;
  src?: string | null;
  size?: number;
  status?: PresenceStatus | null;
  frame?: string | null;
  bot?: boolean;
}) {
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <span className={`avatar ${bot ? 'bot' : ''} ${frame ? `frame-${frame}` : ''}`} style={{ width: size, height: size, fontSize: size }}>
      {bot ? <Icon name="bot" size={Math.round(size * 0.55)} /> : src ? <img src={src} alt="" loading="lazy" width={size} height={size} /> : <span className="initial">{initial}</span>}
      {status && <span className={`status ${status}`} role="img" aria-label={statusLabel(status)} title={statusLabel(status)} />}
    </span>
  );
}
