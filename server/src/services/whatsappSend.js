// Outbound WhatsApp via Meta Cloud API. No-ops gracefully until credentials exist.
import { config } from '../config.js';

const GRAPH = 'https://graph.facebook.com/v21.0';

export async function sendWhatsApp(toPhone, text) {
  const { token, phoneNumberId } = config.whatsapp;
  if (!token || !phoneNumberId) {
    console.log(`[whatsapp:dry-run] -> ${toPhone}: ${text}`);
    return { dryRun: true };
  }
  const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toPhone,
      type: 'text',
      text: { body: text },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WhatsApp send failed (${res.status}): ${body}`);
  }
  return res.json();
}

/** Download a media file (voice note) by media id. Returns a Buffer. */
export async function downloadMedia(mediaId) {
  const { token } = config.whatsapp;
  if (!token) throw new Error('WHATSAPP_TOKEN not configured');
  const meta = await (await fetch(`${GRAPH}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })).json();
  const file = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
  return Buffer.from(await file.arrayBuffer());
}

/** Transcribe a voice note with Whisper, if OPENAI_API_KEY is configured. */
export async function transcribeAudio(buffer, mimeType = 'audio/ogg') {
  if (!config.openaiApiKey) {
    return null; // caller should tell the sender voice notes aren't enabled yet
  }
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), 'note.ogg');
  form.append('model', 'whisper-1');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.openaiApiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Whisper failed (${res.status}): ${await res.text()}`);
  const json = await res.json();
  return json.text;
}
