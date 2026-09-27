import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
  key: string;
  productId?: number;
  variantId?: number | null;
  comboId?: number;
  qty: number;
  // display snapshot — prices are always re-quoted by the server
  name: string;
  image: string | null;
  slug: string | null;
  variantLabel?: string | null;
  price: number;
}

interface CartState {
  items: CartItem[];
  coupon: string | null;
  district: string | null;
  add: (item: Omit<CartItem, 'key' | 'qty'> & { qty?: number }) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  setCoupon: (code: string | null) => void;
  setDistrict: (d: string | null) => void;
  count: () => number;
}

export const itemKey = (i: { productId?: number; variantId?: number | null; comboId?: number }) => (i.comboId ? `c${i.comboId}` : `p${i.productId}-${i.variantId ?? 0}`);

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      coupon: null,
      district: null,
      add: (item) => set((s) => {
        const key = itemKey(item);
        const existing = s.items.find((i) => i.key === key);
        if (existing) return { items: s.items.map((i) => (i.key === key ? { ...i, qty: Math.min(99, i.qty + (item.qty ?? 1)) } : i)) };
        return { items: [...s.items, { ...item, key, qty: item.qty ?? 1 }] };
      }),
      setQty: (key, qty) => set((s) => ({ items: s.items.map((i) => (i.key === key ? { ...i, qty: Math.max(1, Math.min(99, qty)) } : i)) })),
      remove: (key) => set((s) => ({ items: s.items.filter((i) => i.key !== key) })),
      clear: () => set({ items: [], coupon: null }),
      setCoupon: (coupon) => set({ coupon }),
      setDistrict: (district) => set({ district }),
      count: () => get().items.reduce((n, i) => n + i.qty, 0),
    }),
    { name: 'sg_cart', version: 1 },
  ),
);

interface WishState { ids: number[]; toggle: (id: number) => void; has: (id: number) => boolean }
export const useWishlist = create<WishState>()(
  persist(
    (set, get) => ({
      ids: [],
      toggle: (id) => set((s) => ({ ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [id, ...s.ids].slice(0, 200) })),
      has: (id) => get().ids.includes(id),
    }),
    { name: 'sg_wishlist' },
  ),
);

export function cartPayload(items: CartItem[]) {
  return items.map((i) => (i.comboId ? { comboId: i.comboId, qty: i.qty } : { productId: i.productId!, variantId: i.variantId ?? null, qty: i.qty }));
}
