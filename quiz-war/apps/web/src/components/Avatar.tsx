import type { PresenceStatus } from '@quizwar/shared';

const STATUS_LABEL: Record<PresenceStatus, string> = { online: 'Online', away: 'Away', in_match: 'In Match', offline: 'Offline', dnd: 'Do Not Disturb' };

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
  const initial = bot ? '🤖' : (name.replace(/^🤖\s*/, '').trim()[0] ?? '?').toUpperCase();
  return (
    <span className={`avatar ${bot ? 'bot' : ''} ${frame ? `frame-${frame}` : ''}`} style={{ width: size, height: size, fontSize: size }}>
      {src && !bot ? <img src={src} alt="" loading="lazy" width={size} height={size} /> : <span className="initial">{initial}</span>}
      {status && <span className={`status ${status}`} role="img" aria-label={STATUS_LABEL[status]} title={STATUS_LABEL[status]} />}
    </span>
  );
}

export const statusLabel = (s: PresenceStatus) => STATUS_LABEL[s];
export const statusEmoji: Record<PresenceStatus, string> = { online: '🟢', away: '🟡', in_match: '⚔️', offline: '🔴', dnd: '🚫' };
