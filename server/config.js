const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.BUX_DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

function loadSecret(name, fallbackLength = 64) {
  const file = path.join(DATA_DIR, name + '.key');
  if (process.env['BUX_' + name.toUpperCase()]) return process.env['BUX_' + name.toUpperCase()];
  try {
    const v = fs.readFileSync(file, 'utf8').trim();
    if (v) return v;
  } catch (_) {}
  const v = require('crypto').randomBytes(fallbackLength).toString('hex');
  fs.writeFileSync(file, v, { mode: 0o600 });
  return v;
}

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  dataDir: DATA_DIR,
  dbFile: path.join(DATA_DIR, 'buxcoin.db'),
  jwtSecret: loadSecret('jwt_secret'),
  tokenTtlSeconds: parseInt(process.env.TOKEN_TTL || String(60 * 60 * 24 * 14), 10),
  startBalance: parseFloat(process.env.START_BALANCE || '10000'),
  priceTickMs: parseInt(process.env.PRICE_TICK_MS || '15000', 10),
  realPricesEnabled: process.env.REAL_PRICES !== '0',
  cryptoApiBase: process.env.CRYPTO_API_BASE || 'https://api.coingecko.com/api/v3',
  stockApiBase: process.env.STOCK_API_BASE || 'https://stooq.com',
  corsOrigin: process.env.CORS_ORIGIN || '',
  // Livraison du jeton de réinitialisation quand aucun SMTP n'est configuré :
  // "display" (adapté à un simulateur) ou "smtp" (production).
  resetDelivery: process.env.RESET_DELIVERY || 'display',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'Buxcoin <no-reply@buxcoin.local>'
  }
};

module.exports = config;
