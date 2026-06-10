# Grocery OS — Setup Guide

## 0. Run it locally first (no accounts needed)

```bash
cd grocery-os/server
npm install
copy .env.example .env        # add ANTHROPIC_API_KEY for AI features
npm run dev                   # API on :4000, embedded PGlite DB in server/data/

cd ../web
npm install
npm run dev                   # UI on http://localhost:5173
```

Without `ANTHROPIC_API_KEY`: lists, catalog, manual cart mode all work; plan generation
and WhatsApp extraction return a clear "AI disabled" error until the key is added.

---

## 1. Supabase (production database)

1. Create a free project at https://supabase.com
2. SQL Editor → paste & run `supabase/migrations/001_initial.sql`
   (or set `DATABASE_URL` and run `npm run migrate`)
3. Project Settings → Database → copy the **connection string (URI)** —
   use the *session pooler* variant for long-lived servers.
4. Put it in `server/.env` as `DATABASE_URL=...`

Local PGlite data does not migrate automatically — start clean in the cloud,
or re-add catalog mappings via the Catalog tab (there are few in week 1 anyway).

## 2. Railway (always-on API + worker)

1. https://railway.app → New Project → Deploy from local directory or GitHub
2. Root directory: `grocery-os/server`; start command: `npm start`
3. Variables: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `WHATSAPP_*` (below)
4. Networking → Generate Domain → note `https://xxxx.up.railway.app`

The web app can stay on Netlify: `cd web && npm run build`, deploy `web/dist`,
and set a Netlify redirect from `/api/*` to your Railway domain
(`web/dist/_redirects`: `/api/* https://xxxx.up.railway.app/api/:splat 200`).

> The Playwright cart worker needs a browser. On Railway use the
> `mcr.microsoft.com/playwright` base image, or — simpler and recommended at first —
> **run cart builds from your home PC** (`npm run cart:build`): your home IP looks
> like a normal shopper, and the cart build is a weekly 2-minute job.

## 3. WhatsApp (Meta Cloud API)

You do **not** need a spare SIM.

1. https://developers.facebook.com → Create App → type *Business* → add product **WhatsApp**
2. You get a **free test number** that can message up to 5 verified recipients —
   add the family's phone numbers as recipients. (Production later: register a
   landline via voice-call verification, or buy a Twilio number.)
3. API Setup page → copy the **temporary access token** and **Phone number ID**
   into `server/.env` (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`).
   For permanence, create a System User token in Business Settings.
4. Configuration → Webhook:
   - Callback URL: `https://YOUR-RAILWAY-DOMAIN/api/whatsapp/webhook`
   - Verify token: whatever you set as `WHATSAPP_VERIFY_TOKEN` in `.env`
   - Subscribe to the **messages** field.
5. Family members send "hi" to the bot number once — from then on,
   "add milk", "melk en brood asb", voice notes (with `OPENAI_API_KEY` set) all work.

Because the family always messages first, replies fall inside Meta's free
24-hour service window — running cost is ~R0.

## 4. Sixty60 cart worker

```bash
cd grocery-os/server
npm run sixty60:login    # opens Edge/Chrome → log in + pick delivery address → press Enter
npm run cart:build       # builds the cart from all pending list items
```

Or click **Build cart now** in the web app's Cart tab (spawns the same worker).

### Tuning the cart worker

checkers.co.za is a moving target. All selectors live in
`server/src/worker/selectors.js`. If a run flags everything as `needs_review`:

1. `npx playwright codegen https://www.checkers.co.za/search?q=milk` (uses playwright-core's bundled codegen via `npx playwright`)
   — or just open DevTools on a search page
2. Find the real product-tile / add-button selectors
3. Update `selectors.js` — one file, no other changes

Every failure is soft: flagged items get a search link in the run review,
and Manual mode always works.

## 5. Suggested weekly rhythm

| When | What | Who |
|---|---|---|
| All week | "need toothpaste" → WhatsApp bot | everyone |
| Sat/Sun | Weekly wizard → generate plan → send ingredients to list | a parent (2 min) |
| Sun | Build cart → review flags → check out in Sixty60 app | a parent (5 min) |
| After checkout | "I checked out" button → history + catalog learn | same click |
