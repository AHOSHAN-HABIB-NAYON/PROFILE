import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Award,
  Ban,
  Banknote,
  BookOpen,
  Bot,
  Brain,
  Building2,
  Calculator,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Coins,
  Cpu,
  Crown,
  Ellipsis,
  ExternalLink,
  FlaskConical,
  Flag,
  FolderTree,
  Gamepad2,
  Gift,
  Globe,
  GraduationCap,
  HeartPulse,
  Hourglass,
  Image,
  Info,
  Landmark,
  Languages,
  LayoutDashboard,
  Lightbulb,
  Link,
  LogOut,
  Mail,
  Medal,
  Megaphone,
  Moon,
  Music,
  Newspaper,
  Pause,
  Pencil,
  Phone,
  Play,
  Plus,
  ScrollText,
  Settings,
  Shield,
  ShieldCheck,
  ShieldUser,
  Smartphone,
  Sparkles,
  Star,
  Sun,
  Swords,
  Target,
  ThumbsUp,
  Trash2,
  TriangleAlert,
  Trophy,
  Upload,
  Users,
  Volleyball,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { CSSProperties, ReactElement } from 'react';

/** Line icons (lucide). Keys shared with the player app use the same glyphs as apps/web Icon.tsx. */
const LINE = {
  dashboard: LayoutDashboard,
  users: Users,
  flag: Flag,
  swords: Swords,
  question: CircleHelp,
  sparkles: Sparkles,
  folder: FolderTree,
  award: Award,
  target: Target,
  megaphone: Megaphone,
  gamepad: Gamepad2,
  settings: Settings,
  'shield-user': ShieldUser,
  scroll: ScrollText,
  more: Ellipsis,
  sun: Sun,
  moon: Moon,
  logout: LogOut,
  close: X,
  check: Check,
  plus: Plus,
  trash: Trash2,
  edit: Pencil,
  'arrow-up': ArrowUp,
  'arrow-down': ArrowDown,
  'arrow-right': ArrowRight,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  hourglass: Hourglass,
  bulb: Lightbulb,
  link: Link,
  external: ExternalLink,
  globe: Globe,
  coins: Coins,
  star: Star,
  image: Image,
  bot: Bot,
  alert: TriangleAlert,
  info: Info,
  pause: Pause,
  play: Play,
  ban: Ban,
  upload: Upload,
  music: Music,
  mail: Mail,
  phone: Phone,
  smartphone: Smartphone,
  like: ThumbsUp,
  medal: Medal,
  shield: Shield,
  'shield-check': ShieldCheck,
  trophy: Trophy,
  brain: Brain,
  calendar: Calendar,
  bolt: Zap,
  'heart-pulse': HeartPulse,
  crown: Crown,
  gift: Gift,
  landmark: Landmark,
  building: Building2,
  graduation: GraduationCap,
  banknote: Banknote,
  book: BookOpen,
  languages: Languages,
  calculator: Calculator,
  flask: FlaskConical,
  cpu: Cpu,
  newspaper: Newspaper,
  sports: Volleyball,
} satisfies Record<string, LucideIcon>;

type CustomProps = { size: number; className?: string; style?: CSSProperties };

/** Filled / brand icons, replicated from the player app (apps/web/src/components/Icon.tsx). */
const CUSTOM: Record<string, (p: CustomProps) => ReactElement> = {
  fire: ({ size, className, style }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={style} aria-hidden>
      <defs>
        <linearGradient id="qw-fire-g" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ea580c" />
          <stop offset="1" stopColor="#fbbf24" />
        </linearGradient>
      </defs>
      <path d="M12 22c4.4 0 7.5-3 7.5-7.2 0-4.6-3.6-7.4-5-11.3-.3-.8-1.3-.9-1.7-.2-1.2 2-1.1 4.1-.2 5.9-1.6-.5-2.8-1.8-3.2-3.3-.2-.7-1.2-.9-1.6-.2C6.3 8.4 4.5 11 4.5 14.8 4.5 19 7.6 22 12 22z" fill="url(#qw-fire-g)" />
      <path d="M12 21c2 0 3.5-1.4 3.5-3.4 0-2.2-1.8-3.4-2.6-5.2-1.6 1.2-4.4 2.9-4.4 5.4 0 1.9 1.5 3.2 3.5 3.2z" fill="#fde68a" />
    </svg>
  ),
  'flag-bd': ({ size, className, style }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={style} aria-hidden>
      <rect x="1.5" y="5" width="21" height="14" rx="2.5" fill="#006a4e" />
      <circle cx="10.5" cy="12" r="4.4" fill="#f42a41" />
    </svg>
  ),
  whatsapp: ({ size, className, style }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={style} aria-hidden>
      <path fill="#25D366" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z" />
      <path fill="#fff" d="M17.3 14.4c-.3-.1-1.7-.8-1.9-.9-.3-.1-.5-.1-.7.1l-.9 1.1c-.2.2-.3.2-.6.1a7.6 7.6 0 0 1-3.8-3.3c-.3-.5.3-.5.8-1.6.1-.2 0-.4 0-.5l-.9-2.1c-.2-.6-.5-.5-.7-.5h-.6a1.1 1.1 0 0 0-.8.4 3.4 3.4 0 0 0-1 2.5 5.9 5.9 0 0 0 1.2 3.1 13.4 13.4 0 0 0 5.2 4.6c1.9.8 2.7.9 3.6.7.6-.1 1.7-.7 2-1.4.2-.7.2-1.3.2-1.4l-.6-.3z" />
    </svg>
  ),
  facebook: ({ size, className, style }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={style} aria-hidden>
      <circle cx="12" cy="12" r="10.5" fill="#1877F2" />
      <path fill="#fff" d="M13.4 22.4v-7.1h2.4l.4-2.8h-2.8v-1.8c0-.8.3-1.4 1.4-1.4h1.5V6.8a19 19 0 0 0-2.2-.1c-2.2 0-3.6 1.3-3.6 3.7v2.1H8.1v2.8h2.4v7.1z" />
    </svg>
  ),
  messenger: ({ size, className, style }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={style} aria-hidden>
      <defs>
        <linearGradient id="qw-msg-g" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#0695FF" />
          <stop offset=".6" stopColor="#A334FA" />
          <stop offset="1" stopColor="#FF6968" />
        </linearGradient>
      </defs>
      <path fill="url(#qw-msg-g)" d="M12 2C6.4 2 2 6.1 2 11.6c0 2.9 1.2 5.4 3.1 7.1v3.3l3-1.7c1.2.3 2.5.5 3.9.5 5.6 0 10-4.1 10-9.6S17.6 2 12 2z" />
      <path fill="#fff" d="M6.4 14.2l2.9-4.7c.5-.7 1.5-.9 2.2-.4l2.3 1.7 3.4-2.6c.4-.3 1 .2.7.6l-2.9 4.7c-.5.7-1.5.9-2.2.4l-2.3-1.7-3.4 2.6c-.4.3-1-.2-.7-.6z" />
    </svg>
  ),
  telegram: ({ size, className, style }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={style} aria-hidden>
      <circle cx="12" cy="12" r="10.5" fill="#29A9EB" />
      <path fill="#fff" d="M5.4 11.7l10.8-4.2c.5-.2 1 .1.8.9l-1.8 8.6c-.1.6-.5.8-1 .5l-2.8-2.1-1.4 1.3c-.2.2-.3.3-.6.3l.2-2.8 5.2-4.7c.2-.2-.1-.3-.3-.1l-6.4 4-2.7-.9c-.6-.2-.6-.6.1-.8z" />
    </svg>
  ),
  youtube: ({ size, className, style }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={style} aria-hidden>
      <rect x="1.5" y="5" width="21" height="14" rx="4" fill="#FF0000" />
      <path fill="#fff" d="M10 8.8v6.4l5.5-3.2z" />
    </svg>
  ),
  website: ({ size, className, style }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={style} aria-hidden>
      <circle cx="12" cy="12" r="10.5" fill="#1d4ed8" />
      <path d="M3 12h18M12 2.5c2.6 2.6 3.8 5.8 3.8 9.5s-1.2 6.9-3.8 9.5M12 2.5C9.4 5.1 8.2 8.3 8.2 12s1.2 6.9 3.8 9.5" fill="none" stroke="#fff" strokeWidth="1.4" />
    </svg>
  ),
};

/** Aliases for keys stored by older content (missions use 'flame'). */
const ALIAS: Record<string, string> = { flame: 'fire', email: 'mail' };

export type IconName = keyof typeof LINE | keyof typeof CUSTOM;

export function hasIcon(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = ALIAS[name] ?? name;
  return n in LINE || n in CUSTOM;
}

/**
 * The only icon component in the admin panel. Line icons inherit `currentColor`; brand icons
 * keep their colours. Unknown keys (e.g. legacy emoji values) render a neutral fallback.
 */
export function Icon({ name, size = 18, label, className, strokeWidth = 2, style }: { name: string; size?: number; label?: string; className?: string; strokeWidth?: number; style?: CSSProperties }) {
  const key = ALIAS[name] ?? name;
  const cls = ['icon', className ?? ''].filter(Boolean).join(' ');
  const custom = CUSTOM[key];
  const C = (LINE as Record<string, LucideIcon>)[key] ?? CircleHelp;
  const svg = custom ? custom({ size, className: cls, style }) : <C size={size} strokeWidth={strokeWidth} className={cls} style={style} aria-hidden />;
  if (!label) return svg;
  return <span role="img" aria-label={label} className="icon-wrap">{svg}</span>;
}

/* ------------------------------ Icon sets ------------------------------- */

/** Category icon keys — must match the player app's registry. */
export const CATEGORY_ICONS: Record<string, string> = {
  'flag-bd': 'Bangladesh flag',
  landmark: 'Landmark',
  building: 'Building',
  graduation: 'Graduation cap',
  banknote: 'Banknote',
  book: 'Book',
  languages: 'Languages',
  calculator: 'Calculator',
  flask: 'Science flask',
  cpu: 'Chip (ICT)',
  globe: 'Globe',
  newspaper: 'Newspaper',
  sports: 'Sports ball',
  brain: 'Brain',
  target: 'Target',
  trophy: 'Trophy',
  star: 'Star',
  bolt: 'Lightning bolt',
  'heart-pulse': 'Heart pulse',
  music: 'Music',
  gamepad: 'Gamepad',
  bulb: 'Light bulb',
  award: 'Award',
  shield: 'Shield',
  crown: 'Crown',
};

export const ACHIEVEMENT_ICONS: Record<string, string> = {
  medal: 'Medal',
  swords: 'Swords',
  'shield-check': 'Shield with check',
  target: 'Target',
  fire: 'Fire',
  gamepad: 'Gamepad',
  trophy: 'Trophy',
  bolt: 'Lightning bolt',
  brain: 'Brain',
  calendar: 'Calendar',
  'heart-pulse': 'Heart pulse',
  award: 'Award',
  star: 'Star',
  crown: 'Crown',
};

export const MISSION_ICONS: Record<string, string> = {
  target: 'Target',
  swords: 'Swords',
  trophy: 'Trophy',
  brain: 'Brain',
  calendar: 'Calendar',
  bolt: 'Lightning bolt',
  crown: 'Crown',
  globe: 'Globe',
  users: 'Players',
  star: 'Star',
  medal: 'Medal',
  flame: 'Flame',
  gift: 'Gift',
};

/** Same slug fallback as the player app, used when a category still stores a legacy emoji. */
const CATEGORY_BY_SLUG: Record<string, string> = {
  bangladesh: 'flag-bd',
  bcs: 'landmark',
  'govt-jobs': 'building',
  diploma: 'graduation',
  bank: 'banknote',
  bangla: 'book',
  english: 'languages',
  math: 'calculator',
  science: 'flask',
  ict: 'cpu',
  international: 'globe',
  'current-affairs': 'newspaper',
  sports: 'sports',
  'general-knowledge': 'brain',
};

export function categoryIcon(c: { icon?: string | null; slug?: string | null } | null | undefined): string {
  if (!c) return 'folder';
  if (c.icon && hasIcon(c.icon)) return c.icon;
  return (c.slug && CATEGORY_BY_SLUG[c.slug]) || 'book';
}

/** Visual radio-group picker for icon keys. Submits the key under `name` with the surrounding form. */
export function IconPicker({ name, options, value, defaultValue, onChange, label, color }: { name: string; options: Record<string, string>; value?: string; defaultValue?: string; onChange?: (key: string) => void; label: string; color?: string | null }) {
  return (
    <fieldset className="icon-picker">
      <legend>{label}</legend>
      <div className="ip-grid">
        {Object.entries(options).map(([k, title]) => (
          <label key={k} className="ip-opt" title={`${title} (${k})`} style={color ? { color } : undefined}>
            <input type="radio" name={name} value={k} required {...(value !== undefined ? { checked: value === k, onChange: () => onChange?.(k) } : { defaultChecked: defaultValue === k, onChange: () => onChange?.(k) })} />
            <Icon name={k} size={22} />
            <span className="sr-only">{title}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
