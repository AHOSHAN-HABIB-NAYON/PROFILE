import { formatContent } from '../../../core/content.js';
export default { perm: 'posts', async get(c) { return c.reply.type('text/html; charset=utf-8').send(formatContent(String(c.fields.content || ''))); } };
