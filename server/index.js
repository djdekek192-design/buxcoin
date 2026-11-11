const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { db, backup } = require('./db');
const { attachUser } = require('./middleware/auth');
const { router: setupRouter, ensureOwnerSetupToken } = require('./routes/setup');
const authRoutes = require('./routes/auth');
const marketsRoutes = require('./routes/markets');
const tradingRoutes = require('./routes/trading');
const aiRoutes = require('./routes/ai');
const adminRoutes = require('./routes/admin');
const { startPriceEngine } = require('./services/prices');
const { processOpenOrders } = require('./services/engine');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

app.use(express.json({ limit: '64kb' }));

const rateBuckets = new Map();
function rateLimitApi(req, res, next) {
  const key = req.ip || 'unknown';
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.start > 60000) {
    bucket = { start: now, count: 0 };
    rateBuckets.set(key, bucket);
    if (rateBuckets.size > 10000) rateBuckets.clear();
  }
  bucket.count++;
  if (bucket.count > 240) return res.status(429).json({ error: 'Trop de requêtes, ralentissez.' });
  next();
}
app.use('/api', rateLimitApi);
app.use('/api', attachUser);

app.use('/api/setup', setupRouter);
app.use('/api/auth', authRoutes);
app.use('/api/markets', marketsRoutes.router);
app.use('/api/trading', tradingRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/admin', adminRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'Route introuvable.' }));

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON invalide.' });
  console.error('[server]', err && err.message);
  res.status(500).json({ error: 'Erreur interne du serveur.' });
});

app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h', setHeaders: (res, p) => {
  if (p.endsWith('sw.js') || p.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
} }));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Route introuvable.' });
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

let tickTimer = null;
let backupTimer = null;

function start() {
  const hasOwner = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'owner'").get().n > 0;
  if (!hasOwner) {
    const { ensureOwnerSetupToken } = require('./routes/setup');
    const created = ensureOwnerSetupToken();
    if (created) {
      console.log('============================================================');
      console.log('  AUCUN PROPRIÉTAIRE CONFIGURÉ');
      console.log(`  Jeton de configuration écrit dans : ${created.file}`);
      console.log('  Ouvrez le site et suivez l\'écran « Configuration du propriétaire »');
      console.log('  ou exécutez : npm run setup-owner');
      console.log('  Le premier compte créé normalement NE devient PAS propriétaire.');
      console.log('============================================================');
    }
  }

  tickTimer = startPriceEngine(() => {
    try { processOpenOrders(); } catch (e) { console.error('[engine]', e.message); }
  });

  backupTimer = setInterval(() => {
    try { backup(); } catch (e) { console.error('[backup]', e.message); }
  }, 6 * 3600000);

  const server = app.listen(config.port, () => {
    console.log(`Buxcoin (simulateur — argent 100% fictif) démarré sur http://localhost:${config.port}`);
  });
  server.on('error', (e) => {
    console.error('Impossible de démarrer le serveur :', e.message);
    process.exit(1);
  });
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    if (tickTimer) clearInterval(tickTimer);
    if (backupTimer) clearInterval(backupTimer);
    try { db.close(); } catch (_) {}
    process.exit(0);
  });
}

if (require.main === module) start();
module.exports = { app, start };
