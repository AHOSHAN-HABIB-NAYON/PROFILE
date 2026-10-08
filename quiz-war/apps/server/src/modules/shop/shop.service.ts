import { exec, parseJson, query, queryOne, tx } from '../../db/pool';
import { AppError, badRequest, notFound } from '../../lib/errors';
import type { ProgressionService } from '../progression/progression.service';

/** Cosmetic shop + power-up packs. Competitive results never depend on purchases. */
export class ShopService {
  constructor(private readonly progression: ProgressionService) {}

  async list(userId: number) {
    const items = await query<any>('SELECT item_key, type, name, description, price, data FROM shop_items WHERE is_active = 1 ORDER BY sort_order, id');
    const inv = await query<{ item_key: string; quantity: number }>('SELECT item_key, quantity FROM user_inventory WHERE user_id = ?', [userId]);
    const owned = new Map(inv.map((i) => [i.item_key, Number(i.quantity)]));
    return items.map((i) => ({
      key: i.item_key,
      type: i.type,
      name: i.name,
      description: i.description,
      price: i.price,
      data: parseJson(i.data),
      owned: owned.get(i.item_key) ?? 0,
    }));
  }

  async purchase(userId: number, itemKey: string, quantity = 1) {
    const item = await queryOne<{ item_key: string; type: string; price: number; name: string }>('SELECT item_key, type, price, name FROM shop_items WHERE item_key = ? AND is_active = 1', [itemKey]);
    if (!item) throw notFound('Item not found');
    const qty = item.type === 'power_up' ? Math.min(10, Math.max(1, quantity)) : 1;
    await tx(async (conn) => {
      if (item.type !== 'power_up') {
        const has = await queryOne('SELECT 1 x FROM user_inventory WHERE user_id = ? AND item_key = ? FOR UPDATE', [userId, itemKey], conn);
        if (has) throw new AppError(409, 'already_owned', 'You already own this item');
      }
      await this.progression.spendCoins(conn, userId, item.price * qty, 'shop', itemKey);
      await this.progression.addItem(conn, userId, itemKey, qty);
    });
    await this.progression.pushAccount(userId);
    return { ok: true, quantity: qty };
  }

  /** Equip a frame / title / theme the player owns (or reset with null). */
  async equip(userId: number, slot: 'frame' | 'title' | 'theme_cosmetic', itemKey: string | null) {
    let value: string | null = null;
    if (itemKey) {
      const row = await queryOne<{ type: string; data: unknown }>(
        `SELECT s.type, s.data FROM user_inventory i JOIN shop_items s ON s.item_key = i.item_key WHERE i.user_id = ? AND i.item_key = ? AND i.quantity > 0`,
        [userId, itemKey],
      );
      if (!row) throw badRequest('You do not own this item');
      const data = parseJson<any>(row.data) ?? {};
      if (slot === 'frame' && row.type === 'frame') value = data.css ?? itemKey;
      else if (slot === 'title' && row.type === 'title') value = data.text ?? itemKey;
      else if (slot === 'theme_cosmetic' && row.type === 'theme') value = itemKey;
      else throw badRequest('This item cannot be equipped here');
    }
    const column = slot === 'frame' ? 'frame' : slot === 'title' ? 'title' : 'badge';
    await exec(`UPDATE user_profiles SET ${column} = ? WHERE user_id = ?`, [value, userId]);
  }
}
