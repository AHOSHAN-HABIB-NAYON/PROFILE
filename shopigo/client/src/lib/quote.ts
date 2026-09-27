import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from './api';
import { cartPayload, useCart } from './cart';
import type { Quote } from './types';

/** Server-priced cart (prices, stock, coupon, delivery) — the browser never computes totals. */
export function useQuote(district?: string | null) {
  const items = useCart((s) => s.items);
  const coupon = useCart((s) => s.coupon);
  const payload = cartPayload(items);
  return useQuery({
    queryKey: ['quote', payload, coupon, district ?? null],
    queryFn: () => api.post<Quote>('/api/public/cart/quote', { items: payload, couponCode: coupon, district: district ?? null }),
    enabled: items.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}
