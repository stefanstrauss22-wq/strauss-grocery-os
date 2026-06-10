import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, exec } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../../supabase/migrations');

export async function migrate() {
  await query(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now()
  )`);
  const applied = new Set(
    (await query('SELECT name FROM _migrations')).rows.map(r => r.name)
  );
  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await exec(sql);
    await query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
    console.log(`applied migration: ${file}`);
  }
}

// Allow running directly: npm run migrate
if (process.argv[1] && process.argv[1].endsWith('migrate.js')) {
  migrate().then(() => { console.log('migrations complete'); process.exit(0); })
    .catch(err => { console.error(err); process.exit(1); });
}
