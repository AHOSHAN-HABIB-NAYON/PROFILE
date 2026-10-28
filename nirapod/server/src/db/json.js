// mysql2 decodes JSON columns on MySQL 8 and MariaDB, but some setups return raw text.
// Accept both.
export function fromJson(v) {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}
