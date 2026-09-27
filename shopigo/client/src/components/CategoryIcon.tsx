import '@fortawesome/fontawesome-free/css/fontawesome.min.css';
import '@fortawesome/fontawesome-free/css/solid.min.css';
import '@fortawesome/fontawesome-free/css/brands.min.css';
import '@fortawesome/fontawesome-free/css/regular.min.css';
import { cx } from '../lib/format';
import { iconUrl } from '../lib/image';

/** Admin-chosen category icon: a Font Awesome class or an uploaded image. */
export function CategoryIcon({ type, value, name, className }: { type: string; value: string | null; name: string; className?: string }) {
  if (type === 'image' && value) {
    const src = /^(https?:|\/)/.test(value) ? value : iconUrl(value, 192);
    return <img src={src} alt={name} className={cx('size-7 object-contain', className)} loading="lazy" />;
  }
  const cls = value && /^(fa-(solid|regular|brands)\s+)?fa-[a-z0-9-]+$/.test(value) ? (value.includes(' ') ? value : `fa-solid ${value}`) : 'fa-solid fa-tag';
  return <i className={cx(cls, 'text-[22px] leading-none', className)} aria-hidden="true" />;
}

export function FaIcon({ name, className }: { name: string; className?: string }) {
  return <i className={cx(name, className)} aria-hidden="true" />;
}
