// Home-PC cart watcher. Leave this running (a Desktop/Startup icon does it for
// you) and the family can trigger a cart build from the app on any phone.
// It polls the shared database for a 'requested' run, fills the Checkers
// trolley locally (it has the browser + saved login), then asks the cloud to
// WhatsApp a "cart ready" summary. The cart lives on your Checkers account, so
// you review & pay in the Sixty60 phone app — no need to touch the PC.
import { query } from '../db/db.js';
import { buildCart } from './cartBuilder.js';

const CLOUD = process.env.CLOUD_API || 'https://grocery-os-api.onrender.com';
const POLL_MS = Number(process.env.WATCH_POLL_MS || 15000);

// Atomically grab the oldest waiting request (marks it 'running').
async function claim() {
  const { rows } = await query(`
    UPDATE cart_runs SET status = 'running'
    WHERE id = (SELECT id FROM cart_runs WHERE status = 'requested' ORDER BY started_at ASC LIMIT 1)
    RETURNING id`);
  return rows[0]?.id || null;
}

async function notify(runId) {
  try {
    await fetch(`${CLOUD}/api/cart/runs/${runId}/notify`, { method: 'POST' });
  } catch (e) { console.warn('notify failed:', e.message); }
}

console.log('🛒 Cart watcher running. Trigger a build from the app on any phone.');
console.log(`   (polling every ${POLL_MS / 1000}s — leave this window open; minimise it)`);

let stop = false;
process.on('SIGINT', () => { stop = true; });

while (!stop) {
  let runId = null;
  try { runId = await claim(); } catch (e) { console.error('claim error:', e.message); }
  if (runId) {
    const t = new Date().toLocaleTimeString('en-ZA');
    console.log(`\n[${t}] Build requested → run #${runId}. Filling the trolley…`);
    try {
      await buildCart(runId, { keepOpen: false });
      console.log(`[${t}] Run #${runId} done.`);
    } catch (e) {
      console.error(`[${t}] Run #${runId} failed:`, e.message);
    }
    await notify(runId);
    console.log('Watching for the next request…');
  }
  await new Promise(r => setTimeout(r, POLL_MS));
}
process.exit(0);
