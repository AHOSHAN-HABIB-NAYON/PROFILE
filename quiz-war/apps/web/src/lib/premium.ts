import type { AppSettings, MeUser } from '@quizwar/shared';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { create } from 'zustand';
import { api } from './api';
import { useAuth } from './auth';

export type PremiumFeature = 'calls' | 'voiceMessages' | 'photos' | 'liveMic';
const SETTING: Record<PremiumFeature, keyof AppSettings> = { calls: 'premiumCalls', voiceMessages: 'premiumVoiceMessages', photos: 'premiumPhotos', liveMic: 'premiumLiveMic' };

interface Purchase { token: string; products: string[]; purchased: boolean; acknowledged: boolean }
interface BillingPlugin {
  details(o: { productId: string }): Promise<{ productId: string; title?: string; price?: string; period?: string; introPrice?: string; introPeriod?: string }>;
  buy(o: { productId: string; accountId?: string }): Promise<{ purchases: Purchase[] }>;
  owned(): Promise<{ purchases: Purchase[] }>;
}
/** Google Play Billing (Android app only). */
export const billing = Capacitor.isNativePlatform() ? registerPlugin<BillingPlugin>('QwBilling') : null;

/** The app's settings (from /config), kept here so plain functions can check the locks. */
let cfg: Partial<AppSettings> | null = null;
export const setPremiumConfig = (c: Partial<AppSettings> | null | undefined) => (cfg = c ?? null);

/** Does this feature need premium that I don't have? */
export function premiumLocked(feature: PremiumFeature) {
  if (!cfg?.premiumEnabled || cfg[SETTING[feature]] === false) return false;
  return !useAuth.getState().user?.premium;
}

/** "Premium needed" sheet (one for the whole app). */
export const usePaywall = create<{ feature: PremiumFeature | null; open: (f: PremiumFeature) => void; close: () => void }>((set) => ({
  feature: null,
  open: (feature) => set({ feature }),
  close: () => set({ feature: null }),
}));

/** If the feature is locked, show the premium sheet and return true (the caller stops). */
export function needPremium(feature: PremiumFeature) {
  if (!premiumLocked(feature)) return false;
  usePaywall.getState().open(feature);
  return true;
}

/** Server said premium_required: show the sheet. Returns true when that was the error. */
export function handlePremiumError(e: unknown, fallback: PremiumFeature = 'calls') {
  const err = e as { code?: string; details?: { feature?: PremiumFeature } } | null;
  if (err?.code !== 'premium_required') return false;
  usePaywall.getState().open(err.details?.feature ?? fallback);
  return true;
}

const accountId = (uid: string) => uid.replace(/[^A-Za-z0-9]/g, '').slice(0, 64);

async function verify(token: string) {
  const r = await api<{ valid: boolean; expiresAt: string | null; user: MeUser | null }>('/premium/play/verify', { body: { purchaseToken: token } });
  if (r.user) useAuth.getState().setUser(r.user);
  return r;
}

/** Buy the monthly subscription in Google Play, then let the server check it. */
export async function buyPremium(productId: string) {
  if (!billing) throw Object.assign(new Error('Buy Premium in the QUIZ WAR Android app'), { code: 'not_android' });
  const me = useAuth.getState().user;
  const r = await billing.buy({ productId, ...(me ? { accountId: accountId(me.uid) } : {}) });
  let ok = false;
  for (const p of r.purchases) {
    if (!p.purchased) continue;
    const v = await verify(p.token);
    ok = ok || v.valid;
  }
  return { ok, pending: r.purchases.some((p) => !p.purchased) };
}

/** Restore: send this Google account's subscriptions to the server (new phone, reinstall, renewals). */
let restoredFor = '';
export async function restorePremium(force = false) {
  const me = useAuth.getState().user;
  if (!billing || !me || (!force && restoredFor === me.uid)) return false;
  restoredFor = me.uid;
  try {
    const r = await billing.owned();
    let ok = false;
    for (const p of r.purchases) {
      if (!p.purchased) continue;
      ok = (await verify(p.token).catch(() => null))?.valid || ok;
    }
    return ok;
  } catch {
    return false;
  }
}

/** Opens Google Play's subscription page (cancel / change payment). */
export function manageUrl(productId: string) {
  return `https://play.google.com/store/account/subscriptions?sku=${encodeURIComponent(productId)}&package=app.quizwar.bd`;
}
