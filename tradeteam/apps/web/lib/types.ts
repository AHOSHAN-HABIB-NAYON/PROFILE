import type { MarketDTO, OrderDTO } from '@tradeteam/shared';
export type { MarketDTO, OrderDTO };

export interface Me {
  id: string;
  uid: string;
  email: string;
  emailVerified: boolean;
  name: string;
  avatarUrl: string | null;
  phone: string | null;
  googleLinked: boolean;
  hasPassword: boolean;
  twoFactorEnabled: boolean;
  passkeys: boolean;
  mfaRecent: boolean;
  profile: {
    timezone: string;
    currency: string;
    language: string;
    theme: 'light' | 'dark';
    notificationPrefs: Record<string, Record<string, boolean>>;
    kycStatus: string;
  } | null;
}

export type LoginResult =
  | { status: 'ok'; user: Me }
  | {
      status: 'mfa_required';
      mfaToken: string;
      methods: { totp: boolean; backupCode: boolean; passkey: boolean };
    }
  | { status: 'email_verification_required'; email: string };

export interface PublicConfig {
  installed: boolean;
  version: string;
  settings: Record<string, unknown>;
}

export interface Balance {
  asset: string;
  name: string | null;
  logoUrl: string | null;
  available: string;
  locked: string;
  total: string;
  price: string | null;
  value: string | null;
}

export interface Wallets {
  items: Balance[];
  totalValue: string;
  availableValue: string;
  lockedValue: string;
  currency: string;
}

export interface Notification {
  id: string | null;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}
