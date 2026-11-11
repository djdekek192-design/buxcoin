const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

const db = new DatabaseSync(config.dbFile);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin','owner')),
  balance REAL NOT NULL DEFAULT 0,
  is_blocked INTEGER NOT NULL DEFAULT 0,
  token_version INTEGER NOT NULL DEFAULT 0,
  theme TEXT NOT NULL DEFAULT 'dark',
  notifications_enabled INTEGER NOT NULL DEFAULT 1,
  reset_token_hash TEXT,
  reset_token_expires INTEGER,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);
CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('crypto','stock','commodity')),
  base_price REAL NOT NULL,
  price REAL NOT NULL,
  prev_close REAL NOT NULL,
  volatility REAL NOT NULL DEFAULT 0.02,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS candles (
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  interval TEXT NOT NULL,
  ts INTEGER NOT NULL,
  open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL, close REAL NOT NULL,
  volume REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (asset_id, interval, ts)
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('buy','sell')),
  type TEXT NOT NULL CHECK (type IN ('market','limit','stop_loss')),
  qty REAL NOT NULL,
  limit_price REAL,
  stop_price REAL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','filled','cancelled','rejected')),
  filled_price REAL,
  created_at INTEGER NOT NULL,
  filled_at INTEGER
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_id INTEGER,
  kind TEXT NOT NULL,
  side TEXT,
  qty REAL,
  price REAL,
  total REAL NOT NULL,
  balance_after REAL,
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS holdings (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  qty REAL NOT NULL DEFAULT 0,
  avg_price REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, asset_id)
);
CREATE TABLE IF NOT EXISTS watchlist (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, asset_id)
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'info',
  read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS market_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'economie',
  event_date TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_by INTEGER
);
CREATE TABLE IF NOT EXISTS setup_tokens (
  token_hash TEXT PRIMARY KEY,
  purpose TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_candles_asset ON candles(asset_id, interval, ts);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read);
`);

const DEFAULT_SETTINGS = {
  fee_percent: '0.2',
  start_balance: String(config.startBalance),
  market_simulation: '1',
  reset_token_delivery: config.resetDelivery,
  registration_open: '1',
  site_name: 'Buxcoin',
  maintenance_message: ''
};

const stmtGetSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
const stmtSetSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');

function getSetting(key, fallback = null) {
  const row = stmtGetSetting.get(key);
  return row ? row.value : fallback;
}
function setSetting(key, value) { stmtSetSetting.run(key, String(value)); }

for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
  if (getSetting(k) === null) setSetting(k, v);
}

const SEED_ASSETS = [
  { symbol: 'BTC',  name: 'Bitcoin',   kind: 'crypto',    base: 67500, vol: 0.035, coingecko: 'bitcoin' },
  { symbol: 'ETH',  name: 'Ethereum',  kind: 'crypto',    base: 3500,  vol: 0.042, coingecko: 'ethereum' },
  { symbol: 'SOL',  name: 'Solana',    kind: 'crypto',    base: 165,   vol: 0.055, coingecko: 'solana' },
  { symbol: 'BNB',  name: 'BNB',       kind: 'crypto',    base: 590,   vol: 0.040, coingecko: 'binancecoin' },
  { symbol: 'AAPL', name: 'Apple',     kind: 'stock',     base: 225,   vol: 0.015 },
  { symbol: 'MSFT', name: 'Microsoft', kind: 'stock',     base: 420,   vol: 0.015 },
  { symbol: 'NVDA', name: 'NVIDIA',    kind: 'stock',     base: 125,   vol: 0.028 },
  { symbol: 'TSLA', name: 'Tesla',     kind: 'stock',     base: 245,   vol: 0.032 },
  { symbol: 'AMZN', name: 'Amazon',    kind: 'stock',     base: 185,   vol: 0.018 },
  { symbol: 'XAU',  name: 'Or (once)', kind: 'commodity', base: 2350,  vol: 0.008 }
];

const seedAssets = db.prepare('SELECT COUNT(*) AS n FROM assets');
if (seedAssets.get().n === 0) {
  const ins = db.prepare('INSERT INTO assets (symbol, name, kind, base_price, price, prev_close, volatility, updated_at) VALUES (?,?,?,?,?,?,?,?)');
  const now = Date.now();
  for (const a of SEED_ASSETS) {
    ins.run(a.symbol, a.name, a.kind, a.base, a.base, a.base, a.vol, now);
  }
}

const seedEvents = db.prepare('SELECT COUNT(*) AS n FROM market_events');
if (seedEvents.get().n === 0) {
  const ins = db.prepare('INSERT INTO market_events (title, category, event_date, description) VALUES (?,?,?,?)');
  const year = new Date().getUTCFullYear();
  const events = [
    ['Décision de taux — Fed (FOMC)', 'economie', `${year}-03-19`, 'La Réserve fédérale annonce sa décision sur les taux directeurs. Fort impact sur les marchés.'],
    ['Décision de taux — BCE', 'economie', `${year}-04-17`, 'La Banque centrale européenne annonce sa politique monétaire.'],
    ['Résultats trimestriels — Apple', 'resultats', `${year}-02-01`, 'Publication des résultats trimestriels d\'Apple (AAPL).'],
    ['Résultats trimestriels — Microsoft', 'resultats', `${year}-01-30`, 'Publication des résultats trimestriels de Microsoft (MSFT).'],
    ['Résultats trimestriels — NVIDIA', 'resultats', `${year}-02-21`, 'Publication des résultats trimestriels de NVIDIA (NVDA).'],
    ['Résultats trimestriels — Tesla', 'resultats', `${year}-01-24`, 'Publication des résultats trimestriels de Tesla (TSLA).'],
    ['Résultats trimestriels — Amazon', 'resultats', `${year}-02-01`, 'Publication des résultats trimestriels d\'Amazon (AMZN).'],
    ['Halving Bitcoin (période estimée)', 'crypto', `${year + 1}-04-20`, 'Réduction de moitié de la récompense de bloc Bitcoin, événement historiquement suivi de forte volatilité.'],
    ['Publication de l\'inflation US (CPI)', 'economie', `${year}-06-12`, 'Indice des prix à la consommation aux États-Unis.'],
    ['Rapport de l\'emploi US (NFP)', 'economie', `${year}-07-05`, 'Premier vendredi du mois : création d\'emplois aux États-Unis.']
  ];
  for (const e of events) ins.run(...e);
}

function ownerExists() {
  return db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'owner'").get().n > 0;
}

function backup() {
  const dir = path.join(config.dataDir, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(dir, `buxcoin-${stamp}.db`);
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.db')).sort();
    while (files.length > 14) { fs.unlinkSync(path.join(dir, files.shift())); }
  } catch (_) {}
  return target;
}

module.exports = { db, getSetting, setSetting, ownerExists, backup };
