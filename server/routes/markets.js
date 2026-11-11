const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { getAllAssets, getAssetBySymbol } = require('../services/prices');
const { analyzeCandles } = require('../services/analysis');

const router = express.Router();

function assetOut(a) {
  const change = a.prev_close > 0 ? ((a.price - a.prev_close) / a.prev_close) * 100 : 0;
  return {
    id: a.id, symbol: a.symbol, name: a.name, kind: a.kind,
    price: a.price, prev_close: a.prev_close, change_percent: change,
    volatility: a.volatility, updated_at: a.updated_at
  };
}

router.get('/assets', requireAuth, (req, res) => {
  const kind = req.query.kind;
  let assets = getAllAssets.all();
  if (kind && ['crypto', 'stock', 'commodity'].includes(kind)) assets = assets.filter(a => a.kind === kind);
  const watch = new Set(db.prepare('SELECT asset_id FROM watchlist WHERE user_id = ?').all(req.user.id).map(r => r.asset_id));
  const spark = db.prepare("SELECT close FROM candles WHERE asset_id = ? AND interval = '1h' ORDER BY ts DESC LIMIT 24");
  res.json({ assets: assets.map(a => ({
    ...assetOut(a),
    watched: watch.has(a.id),
    spark: spark.all(a.id).map(r => r.close).reverse()
  })) });
});

router.get('/assets/:symbol', requireAuth, (req, res) => {
  const asset = getAssetBySymbol.get(req.params.symbol);
  if (!asset) return res.status(404).json({ error: 'Actif introuvable.' });
  const watched = !!db.prepare('SELECT 1 FROM watchlist WHERE user_id = ? AND asset_id = ?').get(req.user.id, asset.id);
  res.json({ asset: { ...assetOut(asset), watched } });
});

router.get('/assets/:symbol/candles', requireAuth, (req, res) => {
  const asset = getAssetBySymbol.get(req.params.symbol);
  if (!asset) return res.status(404).json({ error: 'Actif introuvable.' });
  const interval = ['5m', '1h', '1d'].includes(req.query.interval) ? req.query.interval : '1h';
  const limit = Math.min(parseInt(req.query.limit || '200', 10) || 200, 500);
  const rows = db.prepare('SELECT ts, open, high, low, close, volume FROM candles WHERE asset_id = ? AND interval = ? ORDER BY ts DESC LIMIT ?')
    .all(asset.id, interval, limit).reverse();
  res.json({ symbol: asset.symbol, interval, candles: rows });
});

router.get('/assets/:symbol/history', requireAuth, (req, res) => {
  const asset = getAssetBySymbol.get(req.params.symbol);
  if (!asset) return res.status(404).json({ error: 'Actif introuvable.' });
  const rows = db.prepare("SELECT ts, close FROM candles WHERE asset_id = ? AND interval = '1d' ORDER BY ts DESC LIMIT ?")
    .all(asset.id, Math.min(parseInt(req.query.days || '90', 10) || 90, 500)).reverse();
  res.json({ symbol: asset.symbol, history: rows });
});

router.get('/assets/:symbol/analysis', requireAuth, (req, res) => {
  const asset = getAssetBySymbol.get(req.params.symbol);
  if (!asset) return res.status(404).json({ error: 'Actif introuvable.' });
  let candles = db.prepare("SELECT ts, open, high, low, close FROM candles WHERE asset_id = ? AND interval = '1h' ORDER BY ts DESC LIMIT 300").all(asset.id).reverse();
  if (candles.length < 30) candles = db.prepare("SELECT ts, open, high, low, close FROM candles WHERE asset_id = ? AND interval = '1d' ORDER BY ts DESC LIMIT 300").all(asset.id).reverse();
  res.json({ symbol: asset.symbol, name: asset.name, analysis: analyzeCandles(candles) });
});

router.get('/calendar', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM market_events ORDER BY event_date ASC').all();
  res.json({ events: rows });
});

module.exports = { router, assetOut };
