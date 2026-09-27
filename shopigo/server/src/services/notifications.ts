import { EventEmitter } from 'node:events';
import { db, json } from '../db/index.js';
import { logger } from '../core/logger.js';
import { settings } from './settings.js';

export type NotificationType = 'new_order' | 'low_stock' | 'fraud' | 'courier_failure' | 'system' | 'update' | 'backup';

const SETTING_FOR: Record<NotificationType, string> = {
  new_order: 'notify_new_order',
  low_stock: 'notify_low_stock',
  fraud: 'notify_fraud',
  courier_failure: 'notify_courier_failure',
  system: 'notify_system',
  update: 'notify_system',
  backup: 'notify_system',
};

/** In-process bus feeding the admin SSE stream. */
export const notificationBus = new EventEmitter();
notificationBus.setMaxListeners(200);

export async function notify(type: NotificationType, title: string, message?: string, link?: string, data?: unknown): Promise<void> {
  try {
    if (!(await settings.bool(SETTING_FOR[type]))) return;
    const res = await db()
      .insertInto('notifications')
      .values({ type, title, message: message ?? null, link: link ?? null, data: json.stringify(data), is_read: 0 })
      .executeTakeFirst();
    notificationBus.emit('notification', { id: Number(res.insertId), type, title, message, link, created_at: new Date().toISOString() });
  } catch (err) {
    logger.error({ err }, 'notification failed');
  }
}
