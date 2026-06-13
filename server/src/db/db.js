// Database adapter: real Postgres when DATABASE_URL is set (Supabase/Railway),
// embedded PGlite otherwise (zero-setup local dev). Both speak the same SQL.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _impl = null;

async function init() {
  if (_impl) return _impl;
  if (config.databaseUrl) {
    const { default: pg } = await import('pg');
    // Keep DATE (oid 1082) as a plain 'YYYY-MM-DD' string instead of a JS Date.
    // pg's default Date parsing causes timezone drift and breaks our string-based
    // date math; this also matches PGlite, so both backends behave identically.
    pg.types.setTypeParser(1082, v => v);
    const ssl = /supabase|amazonaws|railway/.test(config.databaseUrl)
      ? { rejectUnauthorized: false }
      : undefined;
    const pool = new pg.Pool({ connectionString: config.databaseUrl, ssl });
    _impl = {
      kind: 'postgres',
      query: (text, params) => pool.query(text, params),
      exec: text => pool.query(text),
    };
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const fs = await import('node:fs');
    const os = await import('node:os');
    // Keep the embedded DB outside OneDrive-synced folders — sync clients fight
    // with PGlite's file locks. Override with PGLITE_DATA_DIR if needed.
    const dataDir = process.env.PGLITE_DATA_DIR
      || path.join(process.env.LOCALAPPDATA || os.homedir(), 'grocery-os', 'pglite');
    fs.mkdirSync(dataDir, { recursive: true });
    const lite = new PGlite(dataDir);
    _impl = {
      kind: 'pglite',
      query: (text, params) => lite.query(text, params),
      exec: text => lite.exec(text), // PGlite's query() rejects multi-statement SQL
    };
  }
  return _impl;
}

export async function query(text, params = []) {
  const impl = await init();
  return impl.query(text, params);
}

/** Run multi-statement SQL (migrations). */
export async function exec(text) {
  const impl = await init();
  return impl.exec(text);
}

export async function dbKind() {
  return (await init()).kind;
}
