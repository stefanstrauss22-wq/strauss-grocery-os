# Strauss Grocery OS

A family grocery operating system: AI weekly meal planning, a unified shopping list fed by
WhatsApp, a self-learning Checkers Sixty60 product catalog, and a tiered cart-building worker.

## Architecture

```
grocery-os/
├── server/          Node + Express API, Claude AI services, WhatsApp webhook, cart worker
│   ├── src/
│   │   ├── index.js           Express app + route registration
│   │   ├── config.js          Env config (models, tokens, ports)
│   │   ├── db/
│   │   │   ├── db.js          Adapter: Postgres (DATABASE_URL) or embedded PGlite (dev)
│   │   │   └── migrate.js     Runs ../supabase/migrations/*.sql
│   │   ├── routes/            items, plan, catalog, whatsapp, cart, members, settings
│   │   ├── services/
│   │   │   ├── claude.js      Anthropic client wrapper
│   │   │   ├── extraction.js  WhatsApp/free-text → structured grocery items (EN + AF)
│   │   │   ├── planner.js     Weekly meal plan generation (structured output, streaming)
│   │   │   ├── consolidate.js Ingredient consolidation across recipes
│   │   │   ├── catalogMatch.js Ingredient → Sixty60 product matching (the data moat)
│   │   │   └── whatsappSend.js Meta Cloud API replies
│   │   └── worker/
│   │       ├── sixty60Login.js  One-time headed login, saves session state
│   │       ├── cartBuilder.js   Tiered cart build (known SKU → search+AI → flag)
│   │       └── selectors.js     Site selectors in one tunable place
│   └── package.json
├── supabase/migrations/       Plain-SQL schema (works on Supabase, Railway PG, PGlite)
├── web/                       Vite + React PWA (dashboard, wizard, list, cart review)
└── SETUP.md                   Step-by-step: Supabase, Railway, Meta WhatsApp, Sixty60 login
```

## Quick start (local, zero accounts needed)

```bash
# API  (embedded PGlite database, port 4000)
cd server && npm install && npm run dev

# Web  (port 5173, proxies /api to 4000)
cd web && npm install && npm run dev
```

Set `ANTHROPIC_API_KEY` in `server/.env` to enable AI planning + extraction.
Everything else (lists, catalog, simulator UI) works without it.

## The core idea

Every confirmed match between an ingredient ("melk") and a Sixty60 product
("Clover Full Cream Milk 2L", product URL, price) is saved to `product_catalog`.
Week 1 the AI does the heavy lifting; by week 8 ~90% of the cart is a deterministic
replay of confirmed products and AI only handles the novel remainder.

Checkout is **always human**: the worker fills the cart, posts a summary, and stops.

## Key commands

| Command | Where | What |
|---|---|---|
| `npm run dev` | server | API with auto-reload (PGlite if no DATABASE_URL) |
| `npm run migrate` | server | Apply SQL migrations manually |
| `npm run sixty60:login` | server | Headed browser → log into checkers.co.za once, session saved |
| `npm run cart:build` | server | Run the tiered cart builder against pending items |
| `npm run dev` / `npm run build` | web | PWA dev server / production build |

See [SETUP.md](SETUP.md) for cloud deployment and WhatsApp onboarding.
