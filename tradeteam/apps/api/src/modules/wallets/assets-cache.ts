import { query } from '../../infrastructure/db';

/** Small cache of asset id <-> symbol used on hot paths (settlement, balance events). */
let byId = new Map<number, { id: number; symbol: string; precision: number }>();
let bySym = new Map<string, { id: number; symbol: string; precision: number }>();

export async function loadAssets() {
  const rows = await query<{ id: number; symbol: string; precision: number }>(
    'SELECT id, symbol, `precision` FROM assets',
  );
  byId = new Map(
    rows.map((r) => [Number(r.id), { id: Number(r.id), symbol: r.symbol, precision: Number(r.precision) }]),
  );
  bySym = new Map([...byId.values()].map((r) => [r.symbol, r]));
}

export function assetSymbol(id: number): string {
  return byId.get(id)?.symbol ?? String(id);
}

export async function assetBySymbol(symbol: string) {
  let a = bySym.get(symbol.toUpperCase());
  if (!a) {
    await loadAssets();
    a = bySym.get(symbol.toUpperCase());
  }
  return a ?? null;
}
