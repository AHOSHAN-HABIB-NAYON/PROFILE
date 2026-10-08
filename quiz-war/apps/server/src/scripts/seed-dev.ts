/**
 * DEVELOPMENT/TEST seed only: loads sample questions from database/seed/questions.dev.json.
 * Refuses to run in production. Production questions are created/imported via the Admin Panel.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { questionInputSchema } from '@quizwar/shared';
import { loadEnv } from '../config/env';
import { closePool, createPool, query } from '../db/pool';
import { QuestionAdminService } from '../modules/questions/question.admin.service';

export async function seedDevQuestions() {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../database/seed/questions.dev.json');
  const data = JSON.parse(await readFile(file, 'utf8')) as { questions: any[] };
  const cats = await query<{ id: number; slug: string }>('SELECT id, slug FROM categories');
  const svc = new QuestionAdminService();
  let created = 0;
  for (const q of data.questions) {
    const categoryId = cats.find((c) => c.slug === q.category)?.id;
    const input = questionInputSchema.parse({ ...q, categoryId });
    const dup = await query('SELECT id FROM questions WHERE text = ? LIMIT 1', [input.text]);
    if (dup.length) continue;
    await svc.create(input, null);
    created++;
  }
  return created;
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const env = loadEnv();
  if (env.NODE_ENV === 'production') {
    console.error('Refusing to seed development data in production.');
    process.exit(1);
  }
  createPool(env.DATABASE_URL, 2);
  seedDevQuestions()
    .then((n) => console.log(`seeded ${n} development questions`))
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
