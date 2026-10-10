import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Award,
  BadgeCheck,
  Ban,
  Banknote,
  Bell,
  BellOff,
  BellRing,
  BookOpen,
  BookOpenCheck,
  Bot,
  Brain,
  Building2,
  Calculator,
  Calendar,
  Camera,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  CircleUser,
  CircleX,
  ClipboardList,
  Clock,
  Coins,
  Copy,
  Cpu,
  Divide,
  Crosshair,
  Crown,
  DoorOpen,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  FingerprintPattern,
  Flag,
  FlaskConical,
  Gamepad2,
  Gauge,
  Gift,
  Globe,
  GraduationCap,
  Handshake,
  Headset,
  Heart,
  HeartPulse,
  History,
  Hourglass,
  House,
  Image,
  Info,
  KeyRound,
  Landmark,
  Languages,
  LayoutGrid,
  Lightbulb,
  Link,
  ListChecks,
  Lock,
  LogIn,
  LogOut,
  Mail,
  Medal,
  MessageCircle,
  Mic,
  Monitor,
  Moon,
  Music,
  Newspaper,
  PartyPopper,
  Pencil,
  Phone,
  Plus,
  QrCode,
  RefreshCw,
  Rocket,
  RotateCcw,
  ScanLine,
  Search,
  Settings,
  Share2,
  Shield,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Smile,
  Sparkles,
  Star,
  Sun,
  Sword,
  Swords,
  Target,
  ThumbsUp,
  Timer,
  Trash2,
  TriangleAlert,
  Trophy,
  User,
  UserPlus,
  UserRoundCheck,
  UserRoundPlus,
  UserRoundX,
  Users,
  UsersRound,
  Vibrate,
  Volleyball,
  Volume2,
  VolumeX,
  WandSparkles,
  SendHorizontal,
  Video,
  CheckCheck,
  EllipsisVertical,
  Wifi,
  WifiOff,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { CSSProperties, ReactElement } from 'react';

/** Line icons (lucide, MIT/ISC) — tree-shaken, ~300 bytes each. */
const LINE = {
  home: House,
  swords: Swords,
  sword: Sword,
  users: Users,
  'users-round': UsersRound,
  trophy: Trophy,
  user: User,
  'user-circle': CircleUser,
  'user-plus': UserPlus,
  'user-add': UserRoundPlus,
  'user-check': UserRoundCheck,
  'user-x': UserRoundX,
  bell: Bell,
  'bell-ring': BellRing,
  'bell-off': BellOff,
  settings: Settings,
  back: ChevronLeft,
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,
  chevron: ChevronRight,
  'chevron-down': ChevronDown,
  close: X,
  qr: QrCode,
  scan: ScanLine,
  plus: Plus,
  share: Share2,
  copy: Copy,
  search: Search,
  bot: Bot,
  shield: Shield,
  'shield-check': ShieldCheck,
  shop: ShoppingBag,
  flag: Flag,
  logout: LogOut,
  login: LogIn,
  check: Check,
  'check-circle': CircleCheck,
  'x-circle': CircleX,
  key: KeyRound,
  fingerprint: FingerprintPattern,
  mail: Mail,
  edit: Pencil,
  camera: Camera,
  bolt: Zap,
  calendar: Calendar,
  trash: Trash2,
  wifi: Wifi,
  'wifi-off': WifiOff,
  coins: Coins,
  star: Star,
  crown: Crown,
  medal: Medal,
  award: Award,
  target: Target,
  brain: Brain,
  globe: Globe,
  landmark: Landmark,
  building: Building2,
  graduation: GraduationCap,
  banknote: Banknote,
  book: BookOpen,
  'book-check': BookOpenCheck,
  languages: Languages,
  calculator: Calculator,
  flask: FlaskConical,
  cpu: Cpu,
  newspaper: Newspaper,
  sports: Volleyball,
  heart: Heart,
  'heart-pulse': HeartPulse,
  timer: Timer,
  gauge: Gauge,
  sparkles: Sparkles,
  wand: WandSparkles,
  gift: Gift,
  lock: Lock,
  eye: Eye,
  'eye-off': EyeOff,
  phone: Phone,
  smartphone: Smartphone,
  moon: Moon,
  sun: Sun,
  monitor: Monitor,
  volume: Volume2,
  mute: VolumeX,
  music: Music,
  vibrate: Vibrate,
  info: Info,
  file: FileText,
  headset: Headset,
  message: MessageCircle,
  help: CircleHelp,
  refresh: RefreshCw,
  rotate: RotateCcw,
  download: Download,
  image: Image,
  crosshair: Crosshair,
  hourglass: Hourglass,
  bulb: Lightbulb,
  alert: TriangleAlert,
  'alert-circle': CircleAlert,
  verified: BadgeCheck,
  history: History,
  list: ClipboardList,
  tasks: ListChecks,
  rocket: Rocket,
  party: PartyPopper,
  handshake: Handshake,
  ban: Ban,
  door: DoorOpen,
  mic: Mic,
  link: Link,
  external: ExternalLink,
  at: AtSign,
  clock: Clock,
  smile: Smile,
  send: SendHorizontal,
  video: Video,
  'check-check': CheckCheck,
  more: EllipsisVertical,
  like: ThumbsUp,
  chart: ChartColumn,
  grid: LayoutGrid,
  gamepad: Gamepad2,
  divide: Divide,
} satisfies Record<string, LucideIcon>;

type CustomProps = { size: number; className?: string; style?: CSSProperties };

/** Brand + game icons drawn by hand (filled, multi-colour). */
const CUSTOM: Record<string, (p: CustomProps) => ReactElement> = {
  coin: ({ size, className, style }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={style} aria-hidden>
      <defs>
        <linearGradient id="qw-coin-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe08a" />
          <stop offset=".55" stopColor="#f5b70a" />
          <stop offset="1" stopColor="#c98200" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10.5" fill="url(#qw-coin-g)" stroke="#b07200" strokeWidth="1" />
      <circle cx="12" cy="12" r="7.6" fill="none" stroke="#fff3c4" strokeOpacity=".75" strokeWidth="1.2" />
      <path d="M12 7.3l1.38 2.8 3.09.45-2.24 2.18.53 3.08L12 14.36l-2.76 1.45.53-3.08-2.24-2.18 3.09-.45z" fill="#fff6d6" stroke="#9a6200" strokeWidth=".9" strokeLinejoin="round" />
    </svg>
  ),
  xp: ({ size, className, style }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={style} aria-hidden>
      <defs>
        <linearGradient id="qw-xp-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c4b5fd" />
          <stop offset="1" stopColor="#6d28d9" />
        </linearGradient>
      </defs>
      <path d="M12 1.8l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 16.6l-5.8 3.1 1.1-6.5L2.6 8.6l6.5-.9z" fill="url(#qw-xp-g)" stroke="#5b21b6" strokeWidth=".8" strokeLinejoin="round" />
      <path d="M12 5.6l1.6 3.3 3.6.5" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  ),
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
  google: ({ size, className, style }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={style} aria-hidden>
      <path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2-1.9 3.2-4.7 3.2-8z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
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

export type IconName = keyof typeof LINE | keyof typeof CUSTOM;
export type IconAnim = 'bounce' | 'spin' | 'pulse' | 'wiggle' | 'pop' | 'float' | 'ring' | 'beat';

export function hasIcon(name: string | null | undefined): name is IconName {
  return !!name && (name in LINE || name in CUSTOM);
}

/**
 * The only icon component in the app. Line icons inherit `currentColor`; custom ones carry
 * their brand colours. `anim` adds a CSS animation (respects reduced-motion).
 */
export function Icon({
  name,
  size = 22,
  label,
  className,
  anim,
  strokeWidth = 2,
  style,
}: {
  name: IconName | string;
  size?: number;
  label?: string;
  className?: string;
  anim?: IconAnim;
  strokeWidth?: number;
  style?: CSSProperties;
}) {
  const cls = ['qw-icon', anim ? `ic-${anim}` : '', className ?? ''].filter(Boolean).join(' ');
  const custom = CUSTOM[name];
  const svg = custom
    ? custom({ size, className: cls, style })
    : (() => {
        const C = (LINE as Record<string, LucideIcon>)[name] ?? CircleHelp;
        return <C size={size} strokeWidth={strokeWidth} className={cls} style={style} aria-hidden />;
      })();
  if (!label) return svg;
  return (
    <span role="img" aria-label={label} className="ic-wrap">
      {svg}
    </span>
  );
}

/** Rounded tinted tile with an icon — used for menu rows, modes, missions, categories. */
export function IconTile({
  name,
  tone = 'primary',
  size = 44,
  anim,
  color,
}: {
  name: IconName | string;
  tone?: 'primary' | 'accent' | 'success' | 'danger' | 'warning' | 'cyan' | 'coin' | 'neutral';
  size?: number;
  anim?: IconAnim;
  color?: string | null;
}) {
  const style: CSSProperties = color ? ({ '--tile': color } as CSSProperties) : {};
  return (
    <span className={`icon-tile tone-${color ? 'custom' : tone}`} style={{ width: size, height: size, ...style }} aria-hidden>
      <Icon name={name} size={Math.round(size * 0.5)} anim={anim} />
    </span>
  );
}

/* ------------------------------- Mappings -------------------------------- */

/** Category slug / stored icon key → icon. Legacy emoji values fall back by slug. */
const CATEGORY_BY_SLUG: Record<string, IconName> = {
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

export function categoryIcon(c: { icon?: string | null; slug?: string | null } | null | undefined): IconName {
  if (!c) return 'grid';
  if (hasIcon(c.icon)) return c.icon;
  return (c.slug && CATEGORY_BY_SLUG[c.slug]) || 'book';
}

/** Achievement key / stored icon → icon. */
const ACHIEVEMENT_BY_KEY: Record<string, IconName> = {
  first_victory: 'medal',
  wins_10: 'swords',
  wins_100: 'shield-check',
  correct_1000: 'target',
  win_streak_10: 'fire',
  matches_100: 'gamepad',
  champion_league: 'trophy',
  speed_demon: 'bolt',
  quiz_master: 'brain',
  daily_warrior: 'calendar',
  streak_7: 'calendar',
  streak_30: 'heart-pulse',
};

export function achievementIcon(a: { key?: string; icon?: string | null }): IconName {
  if (hasIcon(a.icon)) return a.icon;
  return (a.key && ACHIEVEMENT_BY_KEY[a.key]) || 'award';
}

/** Notification type → icon + tone. */
export const NOTIFICATION_ICON: Record<string, { icon: IconName; tone: 'primary' | 'accent' | 'success' | 'danger' | 'warning' | 'cyan' | 'coin' }> = {
  battle_request: { icon: 'swords', tone: 'danger' },
  friend_request: { icon: 'user-add', tone: 'primary' },
  friend_accepted: { icon: 'user-check', tone: 'success' },
  achievement: { icon: 'award', tone: 'accent' },
  rank: { icon: 'trophy', tone: 'warning' },
  streak: { icon: 'fire', tone: 'warning' },
  reward: { icon: 'gift', tone: 'coin' },
  mission: { icon: 'target', tone: 'success' },
  penalty: { icon: 'alert', tone: 'danger' },
  squad: { icon: 'shield', tone: 'cyan' },
  squad_invite: { icon: 'shield', tone: 'cyan' },
  announcement: { icon: 'bell-ring', tone: 'primary' },
  moderation: { icon: 'shield-check', tone: 'danger' },
  daily: { icon: 'calendar', tone: 'accent' },
  security: { icon: 'lock', tone: 'danger' },
};

export function notificationIcon(type: string) {
  return NOTIFICATION_ICON[type] ?? { icon: 'bell' as IconName, tone: 'primary' as const };
}
