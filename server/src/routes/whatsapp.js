import express from 'express';
import { query } from '../db/db.js';
import { config } from '../config.js';
import { triageMessage } from '../services/extraction.js';
import { sendWhatsApp, downloadMedia, transcribeAudio } from '../services/whatsappSend.js';
import { normalizeName, normalizeUnit } from '../services/consolidate.js';

const router = express.Router();

/** Shared pipeline: text -> extraction -> shopping_items -> reply text. */
async function processMessage({ waMessageId = null, fromPhone, fromName, text, mediaType = 'text' }) {
  const extraction = await triageMessage(text, { senderName: fromName || fromPhone });
  const by = fromName || fromPhone;
  let added = 0;
  for (const item of extraction.items) {
    const norm = normalizeName(item.name);
    const unit = normalizeUnit(item.unit);
    const existing = await query(
      `SELECT id, quantity FROM shopping_items WHERE normalized_name = $1 AND status = 'pending' AND (unit IS NOT DISTINCT FROM $2)`,
      [norm, unit]
    );
    if (existing.rows.length) {
      await query('UPDATE shopping_items SET quantity = quantity + $1, urgency = $2, updated_at = now() WHERE id = $3',
        [item.quantity || 1, item.urgency, existing.rows[0].id]);
    } else {
      await query(
        `INSERT INTO shopping_items (name, normalized_name, quantity, unit, category, source, added_by, urgency)
         VALUES ($1,$2,$3,$4,$5,'whatsapp',$6,$7)`,
        [item.name, norm, item.quantity || 1, unit, item.category, by, item.urgency]
      );
    }
    added++;
  }
  // To-do tasks captured from the same message; skip exact duplicates still open.
  let tasksAdded = 0;
  for (const t of extraction.tasks || []) {
    const title = String(t.title || '').trim();
    if (!title) continue;
    const dupe = await query(`SELECT id FROM tasks WHERE done = false AND lower(title) = lower($1)`, [title]);
    if (dupe.rows.length) continue;
    await query(`INSERT INTO tasks (title, source, added_by) VALUES ($1,'whatsapp',$2)`, [title, by]);
    tasksAdded++;
  }
  await query(
    `INSERT INTO whatsapp_messages (wa_message_id, from_phone, from_name, body, media_type, extracted, processed)
     VALUES ($1,$2,$3,$4,$5,$6,true)
     ON CONFLICT (wa_message_id) DO NOTHING`,
    [waMessageId, fromPhone || null, fromName || null, text, mediaType, JSON.stringify(extraction)]
  );
  const pendingCount = (await query(`SELECT COUNT(*)::int AS n FROM shopping_items WHERE status = 'pending'`)).rows[0].n;
  const openTasks = (await query(`SELECT COUNT(*)::int AS n FROM tasks WHERE done = false`)).rows[0].n;
  const notes = [];
  if (added) notes.push(`list: ${pendingCount} items`);
  if (tasksAdded) notes.push(`${openTasks} to-dos`);
  const reply = notes.length ? `${extraction.reply} (${notes.join(', ')})` : extraction.reply;
  return { extraction, added, tasksAdded, reply, pendingCount, openTasks };
}

// Meta webhook verification handshake
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token && token === config.whatsapp.verifyToken) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Meta webhook receiver (text + voice notes)
router.post('/webhook', async (req, res) => {
  res.sendStatus(200); // ack fast; Meta retries on non-200
  try {
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    const messages = value?.messages || [];
    const contacts = value?.contacts || [];
    for (const msg of messages) {
      const fromPhone = msg.from;
      const fromName = contacts.find(c => c.wa_id === fromPhone)?.profile?.name || fromPhone;
      let text = null, mediaType = 'text';
      if (msg.type === 'text') {
        text = msg.text.body;
      } else if (msg.type === 'audio') {
        mediaType = 'audio';
        const buffer = await downloadMedia(msg.audio.id);
        text = await transcribeAudio(buffer, msg.audio.mime_type);
        if (!text) {
          await sendWhatsApp(fromPhone, 'Voice notes are not enabled yet — please type the items for now 🙏');
          continue;
        }
      } else {
        continue; // ignore images/stickers/etc for now
      }
      const result = await processMessage({ waMessageId: msg.id, fromPhone, fromName, text, mediaType });
      await sendWhatsApp(fromPhone, result.reply);
    }
  } catch (err) {
    console.error('whatsapp webhook error:', err);
  }
});

// Simulator — same pipeline, no Meta account needed. Used by the web UI.
router.post('/simulate', async (req, res, next) => {
  try {
    const { from = 'simulator', name = 'Simulator', text } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });
    const result = await processMessage({ fromPhone: from, fromName: name, text });
    res.json(result);
  } catch (e) { next(e); }
});

// POST /api/whatsapp/profile-photo  { image_url, about?, description? }
// Sets the WhatsApp business profile picture (and optionally the about/description
// text) via Meta's resumable upload. NOTE: on the free test number Meta may
// reject profile changes — works once on a real business number.
const GRAPH = 'https://graph.facebook.com/v21.0';
router.post('/profile-photo', async (req, res, next) => {
  try {
    const { token, phoneNumberId, appId } = config.whatsapp;
    if (!token || !phoneNumberId) return res.status(400).json({ error: 'WhatsApp not configured (token/phone id missing)' });
    const { image_url, about, description } = req.body;
    if (!image_url) return res.status(400).json({ error: 'image_url is required' });

    // 1. Fetch the image bytes.
    const imgRes = await fetch(image_url);
    if (!imgRes.ok) return res.status(400).json({ error: `could not fetch image_url (${imgRes.status})` });
    const fileType = imgRes.headers.get('content-type') || 'image/png';
    const buf = Buffer.from(await imgRes.arrayBuffer());

    // 2. Open a resumable upload session against the app.
    const sessRes = await fetch(
      `${GRAPH}/${appId}/uploads?file_name=bot-photo&file_length=${buf.length}&file_type=${encodeURIComponent(fileType)}&access_token=${token}`,
      { method: 'POST' });
    const sess = await sessRes.json();
    if (!sess.id) return res.status(502).json({ step: 'create_session', error: sess });

    // 3. Upload the bytes; Meta returns a file handle.
    const upRes = await fetch(`${GRAPH}/${sess.id}`, {
      method: 'POST',
      headers: { Authorization: `OAuth ${token}`, file_offset: '0' },
      body: buf,
    });
    const up = await upRes.json();
    if (!up.h) return res.status(502).json({ step: 'upload', error: up });

    // 4. Apply the handle (and any text) to the business profile.
    const body = { messaging_product: 'whatsapp', profile_picture_handle: up.h };
    if (about) body.about = about;
    if (description) body.description = description;
    const profRes = await fetch(`${GRAPH}/${phoneNumberId}/whatsapp_business_profile`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const prof = await profRes.json();
    res.status(profRes.ok ? 200 : 502).json({ ok: profRes.ok, handle: up.h, result: prof });
  } catch (e) { next(e); }
});

// Recent message log
router.get('/messages', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM whatsapp_messages ORDER BY created_at DESC LIMIT 50');
    res.json(rows);
  } catch (e) { next(e); }
});

export default router;
