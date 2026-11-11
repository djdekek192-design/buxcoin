const config = require('../config');
const { db } = require('../db');

const COINGECKO_IDS = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'binancecoin' };
const STOOQ_SYMBOLS = { AAPL: 'aapl.us', MSFT: 'msft.us', NVDA: 'nvda.us', TSLA: 'tsla.us', AMZN: 'amzn.us', XAU: 'xauusd' };

let lastRealFetch = 0;
let lastRealPrices = {};

async function fetchJson(url, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'BuxcoinSimulator/1.0' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'BuxcoinSimulator/1.0' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRealPrices() {
  const prices = {};
  const cryptoSymbols = Object.keys(COINGECKO_IDS);
  try {
    const ids = cryptoSymbols.map(s => COINGECKO_IDS[s]).join(',');
    const data = await fetchJson(`${config.cryptoApiBase}/simple/price?ids=${ids}&vs_currencies=usd`);
    for (const s of cryptoSymbols) {
      const p = data[COINGECKO_IDS[s]] && data[COINGECKO_IDS[s]].usd;
      if (typeof p === 'number' && p > 0) prices[s] = p;
    }
  } catch (_) {}
  for (const [sym, stooq] of Object.entries(STOOQ_SYMBOLS)) {
    try {
      const csv = await fetchText(`${config.stockApiBase}/q/l/?s=${stooq}&f=sd2t2ohlcv&h&e=csv`);
      const lines = csv.trim().split('\n');
      if (lines.length >= 2) {
        const close = parseFloat(lines[1].split(',')[6]);
        if (Number.isFinite(close) && close > 0) prices[sym] = close;
      }
    } catch (_) {}
  }
  return prices;
}

function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function seedHistory(asset) {
  const now = Date.now();
  const dayMs = 86400000, hourMs = 3600000;
  const insert = db.prepare('INSERT OR REPLACE INTO candles (asset_id, interval, ts, open, high, low, close, volume) VALUES (?,?,?,?,?,?,?,?)');
  const genWalk = (startPrice, steps, stepVol, stepMs, endTs) => {
    const out = [];
    let price = startPrice * (0.75 + Math.random() * 0.1);
    let ts = endTs - steps * stepMs;
    for (let i = 0; i < steps; i++) {
      const drift = (startPrice - price) / startPrice * 0.004;
      const open = price;
      const change = price * (gauss() * stepVol + drift);
      const close = Math.max(open * 0.5, open + change);
      const high = Math.max(open, close) * (1 + Math.abs(gauss()) * stepVol * 0.5);
      const low = Math.min(open, close) * (1 - Math.abs(gauss()) * stepVol * 0.5);
      const volume = (0.5 + Math.random()) * (asset.kind === 'crypto' ? 1000 : 5e6) * (asset.kind === 'commodity' ? 0.001 : 1);
      out.push({ ts: ts + i * stepMs, open, high, low, close, volume });
      price = close;
    }
    return out;
  };
  const daily = genWalk(asset.base_price, 500, asset.volatility, dayMs, now);
  const hourly = genWalk(daily[daily.length - 1].close, 240, asset.volatility / 3, hourMs, now);
  for (const c of daily) insert.run(asset.id, '1d', c.ts, c.open, c.high, c.low, c.close, c.volume);
  for (const c of hourly) insert.run(asset.id, '1h', c.ts, c.open, c.high, c.low, c.close, c.volume);
  const lastDaily = daily[daily.length - 1];
  db.prepare('UPDATE assets SET price = ?, prev_close = ?, updated_at = ? WHERE id = ?')
    .run(lastDaily.close, daily[daily.length - 2].close, now, asset.id);
  return lastDaily.close;
}

const getAllAssets = db.prepare('SELECT * FROM assets WHERE active = 1 ORDER BY kind, symbol');
const getAssetStmt = db.prepare('SELECT * FROM assets WHERE id = ?');
const getAssetBySymbol = db.prepare('SELECT * FROM assets WHERE symbol = ? COLLATE NOCASE');

function tickSimulation() {
  const assets = getAllAssets.all();
  const now = Date.now();
  const update = db.prepare('UPDATE assets SET price = ?, updated_at = ? WHERE id = ?');
  const upsertCandle = db.prepare(`INSERT INTO candles (asset_id, interval, ts, open, high, low, close, volume)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(asset_id, interval, ts) DO UPDATE SET
      high = MAX(high, excluded.high), low = MIN(low, excluded.low), close = excluded.close, volume = volume + excluded.volume`);
  for (const a of assets) {
    const old = a.price;
    const real = lastRealPrices[a.symbol];
    let next;
    if (real !== undefined) {
      next = old + (real - old) * 0.25 + old * gauss() * a.volatility * 0.15;
    } else {
      next = old * (1 + gauss() * a.volatility * 0.18);
    }
    next = Math.max(next, a.base_price * 0.05);
    update.run(next, now, a.id);
    const boundaries = [['5m', 300000], ['1h', 3600000], ['1d', 86400000]];
    for (const [iv, ms] of boundaries) {
      const ts = Math.floor(now / ms) * ms;
      upsertCandle.run(a.id, iv, ts, old, Math.max(old, next), Math.min(old, next), next, Math.random() * 10);
    }
  }
}

async function refreshRealPrices() {
  if (!config.realPricesEnabled) return;
  const now = Date.now();
  if (now - lastRealFetch < 55000) return;
  lastRealFetch = now;
  try {
    lastRealPrices = await fetchRealPrices();
  } catch (_) {}
}

function startPriceEngine(onTick) {
  const assets = getAllAssets.all();
  for (const a of assets) seedHistory(a);
  const loop = async () => {
    try {
      await refreshRealPrices();
      tickSimulation();
      if (onTick) onTick();
    } catch (e) {
      console.error('[prices] tick error:', e.message);
    }
  };
  loop();
  return setInterval(loop, config.priceTickMs);
}

module.exports = {
  startPriceEngine, getAllAssets, getAssetStmt, getAssetBySymbol,
  tickSimulation, seedHistory, fetchRealPrices
};
