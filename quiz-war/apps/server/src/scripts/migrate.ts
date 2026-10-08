import { loadEnv } from '../config/env';
import { closePool, createPool } from '../db/pool';
import { migrate } from '../db/migrate';

const env = loadEnv();
const pool = createPool(env.DATABASE_URL, 2);
migrate(pool)
  .then(() => console.log('migrations up to date'))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
