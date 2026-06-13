import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { dbKind, query } from './db/db.js';
import { aiEnabled } from './services/claude.js';
import itemsRouter from './routes/items.js';
import staplesRouter from './routes/staples.js';
import tasksRouter from './routes/tasks.js';
import planRouter from './routes/plan.js';
import catalogRouter from './routes/catalog.js';
import whatsappRouter from './routes/whatsapp.js';
import cartRouter from './routes/cart.js';
import ordersRouter from './routes/orders.js';
import householdRouter from './routes/household.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', async (req, res) => {
  res.json({
    ok: true,
    db: await dbKind(),
    ai: aiEnabled(),
    whatsapp: Boolean(config.whatsapp.token),
  });
});

// Dashboard summary
app.get('/api/dashboard', async (req, res, next) => {
  try {
    const pending = (await query(`SELECT COUNT(*)::int AS n FROM shopping_items WHERE status = 'pending'`)).rows[0].n;
    const catalog = (await query(`SELECT COUNT(*)::int AS n FROM product_catalog`)).rows[0].n;
    const confirmed = (await query(`SELECT COUNT(*)::int AS n FROM product_catalog WHERE confidence = 'confirmed'`)).rows[0].n;
    const lastRun = (await query(`SELECT * FROM cart_runs ORDER BY started_at DESC LIMIT 1`)).rows;
    const plan = (await query(`SELECT week_start, status FROM meal_plans ORDER BY week_start DESC LIMIT 1`)).rows;
    res.json({
      pending_items: pending,
      catalog_size: catalog,
      catalog_confirmed: confirmed,
      last_cart_run: lastRun[0] || null,
      latest_plan: plan[0] || null,
    });
  } catch (e) { next(e); }
});

app.use('/api/items', itemsRouter);
app.use('/api/staples', staplesRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/plan', planRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/whatsapp', whatsappRouter);
app.use('/api/cart', cartRouter);
app.use('/api/orders', ordersRouter);
app.use('/api', householdRouter);

// error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'internal error' });
});

migrate()
  .then(() => {
    app.listen(config.port, () => {
      console.log(`Grocery OS API on http://localhost:${config.port} (db: ${config.databaseUrl ? 'postgres' : 'pglite'}, ai: ${aiEnabled() ? 'on' : 'OFF — set ANTHROPIC_API_KEY'})`);
    });
  })
  .catch(err => { console.error('migration failed:', err); process.exit(1); });
