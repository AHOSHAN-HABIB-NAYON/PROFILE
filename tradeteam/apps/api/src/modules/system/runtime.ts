import type { Gateway } from '../../websocket/gateway';
import type { MatchingEngine } from '../trading/engine';
import type { MarketDataHub } from '../market-data/hub';

/** References to long-lived components of this process (for health reporting and shutdown). */
export const runtime: {
  gateway: Gateway | null;
  engine: MatchingEngine | null;
  hub: MarketDataHub | null;
  startedAt: number;
  mode: 'installer' | 'app';
} = { gateway: null, engine: null, hub: null, startedAt: Date.now(), mode: 'installer' };
