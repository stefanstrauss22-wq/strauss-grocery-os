// One-time interactive login to checkers.co.za. Opens your installed Edge/Chrome,
// you log in (incl. OTP) and set your delivery address, then press Enter here.
// The session is saved to server/data/sixty60-state.json for the cart worker.
import path from 'node:path';
import fs from 'node:fs';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const STATE_PATH = path.resolve(__dirname, '../../data/sixty60-state.json');

async function launchBrowser({ headless }) {
  // Prefer Chrome (the family's everyday browser), fall back to Edge.
  // Override with BROWSER_CHANNEL=msedge if needed.
  const preferred = process.env.BROWSER_CHANNEL;
  const channels = preferred ? [preferred] : ['chrome', 'msedge'];
  for (const channel of channels) {
    try {
      return await chromium.launch({ channel, headless });
    } catch { /* try next channel */ }
  }
  throw new Error('Could not launch Chrome or Edge. Install one, or run: npx playwright install chromium');
}

async function main() {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  const browser = await launchBrowser({ headless: false });
  const context = await browser.newContext(
    fs.existsSync(STATE_PATH) ? { storageState: STATE_PATH } : {}
  );
  const page = await context.newPage();
  await page.goto('https://www.checkers.co.za/');
  console.log('\nA browser window is open.');
  console.log('1. Log in to your Checkers account (OTP etc.)');
  console.log('2. Make sure your Sixty60 delivery address is selected');
  console.log('3. Come back here and press Enter to save the session\n');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise(resolve => rl.question('Press Enter when logged in... ', resolve));
  rl.close();
  await context.storageState({ path: STATE_PATH });
  console.log(`Session saved to ${STATE_PATH}`);
  await browser.close();
}

if (process.argv[1] && process.argv[1].endsWith('sixty60Login.js')) {
  main().catch(err => { console.error(err); process.exit(1); });
}

export { launchBrowser };
