const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { getAssetBySymbol, getAssetStmt } = require('../services/prices');
const { executeMarketOrder, processOpenOrders, portfolioFor, feePercent } = require('../services/engine');
const { finiteNumber } = require('../util');

const router = express.Router();

router.get('/portfolio', requireAuth, (req, res) => {
  res.json({ portfolio: portfolioFor(req.user.id), fee_percent: feePercent() });
});

router.post('/orders', requireAuth, (req, res) => {
  const { symbol, side, type, qty, limit_price, stop_price } = req.body || {};
  const asset = getAssetBySymbol.get(String(symbol || ''));
  if (!asset) return res.status(404).json({ error: 'Actif introuvable.' });
  if (!['buy', 'sell'].includes(side)) return res.status(400).json({ error: 'Côté invalide (buy/sell).' });
  if (!['market', 'limit', 'stop_loss'].includes(type)) return res.status(400).json({ error: "Type d'ordre invalide (market, limit, stop_loss)." });
  const quantity = finiteNumber(qty, 1e-9, 1e12);
  if (quantity === null) return res.status(400).json({ error: 'Quantité invalide.' });

  if (type === 'market') {
    const r = executeMarketOrder(req.user, asset, side, quantity);
    if (!r.ok) return res.status(400).json({ error: r.error });
    return res.status(201).json({ ok: true, status: 'filled', price: r.price, total: r.total });
  }

  const limitP = finiteNumber(limit_price, 1e-9, 1e12);
  const stopP = finiteNumber(stop_price, 1e-9, 1e12);
  if (type === 'limit' && limitP === null) return res.status(400).json({ error: 'Prix limite requis pour un ordre Limit.' });
  if (type === 'stop_loss' && stopP === null) return res.status(400).json({ error: 'Prix de déclenchement requis pour un Stop-Loss.' });

  if (side === 'sell') {
    const h = db.prepare('SELECT qty FROM holdings WHERE user_id = ? AND asset_id = ?').get(req.user.id, asset.id);
    if (!h || h.qty < quantity - 1e-9) return res.status(400).json({ error: 'Vous ne détenez pas assez de cet actif pour cet ordre de vente.' });
  }
  if (side === 'buy' && type === 'limit') {
    const need = quantity * limitP * (1 + feePercent() / 100);
    if (req.user.balance < need) return res.status(400).json({ error: `Solde insuffisant : cet ordre peut coûter jusqu'à ${need.toFixed(2)} $ (frais inclus).` });
  }

  const info = db.prepare(`INSERT INTO orders (user_id, asset_id, side, type, qty, limit_price, stop_price, created_at)
    VALUES (?,?,?,?,?,?,?,?)`).run(req.user.id, asset.id, side, type, quantity, limitP, stopP, Date.now());
  processOpenOrders();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ ok: true, order });
});

router.get('/orders/open', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT o.*, a.symbol, a.name FROM orders o JOIN assets a ON a.id = o.asset_id
    WHERE o.user_id = ? AND o.status = 'open' ORDER BY o.created_at DESC`).all(req.user.id);
  res.json({ orders: rows });
});

router.get('/orders/history', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT o.*, a.symbol, a.name FROM orders o JOIN assets a ON a.id = o.asset_id
    WHERE o.user_id = ? AND o.status != 'open' ORDER BY o.created_at DESC LIMIT 200`).all(req.user.id);
  res.json({ orders: rows });
});

router.delete('/orders/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ? AND status = ?').get(id, req.user.id, 'open');
  if (!order) return res.status(404).json({ error: 'Ordre ouvert introuvable.' });
  db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(id);
  res.json({ ok: true });
});

router.get('/transactions', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT t.*, a.symbol FROM transactions t LEFT JOIN assets a ON a.id = t.asset_id
    WHERE t.user_id = ? ORDER BY t.created_at DESC LIMIT 200`).all(req.user.id);
  res.json({ transactions: rows });
});

router.get('/stats', requireAuth, (req, res) => {
  const trades = db.prepare("SELECT side, qty, price, total, created_at FROM transactions WHERE user_id = ? AND kind = 'trade' ORDER BY created_at").all(req.user.id);
  let realized = 0, buys = 0, sells = 0, volume = 0;
  for (const t of trades) {
    volume += Math.abs(t.total);
    if (t.side === 'buy') buys++; else sells++;
  }
  const portfolio = portfolioFor(req.user.id);
  realized = portfolio.total - 10000;
  const winRows = db.prepare(`
    SELECT a.symbol, t.price, t.qty FROM transactions t JOIN assets a ON a.id = t.asset_id
    WHERE t.user_id = ? AND t.kind = 'trade' AND t.side = 'sell' ORDER BY t.created_at`).all(req.user.id);
  let wins = 0, losses = 0;
  const avgPrices = {};
  const buyRows = db.prepare(`
    SELECT a.symbol, t.price, t.qty FROM transactions t JOIN assets a ON a.id = t.asset_id
    WHERE t.user_id = ? AND t.kind = 'trade' AND t.side = 'buy' ORDER BY t.created_at`).all(req.user.id);
  for (const b of buyRows) {
    const cur = avgPrices[b.symbol] || { qty: 0, cost: 0 };
    cur.qty += b.qty; cur.cost += b.qty * b.price;
    avgPrices[b.symbol] = cur;
  }
  for (const s of winRows) {
    const cur = avgPrices[s.symbol];
    if (!cur || cur.qty <= 0) continue;
    const avg = cur.cost / cur.qty;
    const pnl = (s.price - avg) * s.qty;
    if (pnl >= 0) wins++; else losses++;
    cur.qty -= s.qty; cur.cost -= s.qty * avg;
  }
  const totalTrades = wins + losses;
  res.json({
    stats: {
      total_trades: trades.length, buys, sells, volume,
      win_rate: totalTrades > 0 ? (wins / totalTrades) * 100 : null,
      wins, losses,
      total_value: portfolio.total,
      starting_balance: 10000,
      performance_percent: ((portfolio.total - 10000) / 10000) * 100
    }
  });
});

router.get('/watchlist', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT a.* FROM watchlist w JOIN assets a ON a.id = w.asset_id
    WHERE w.user_id = ? ORDER BY a.symbol`).all(req.user.id);
  const { assetOut } = require('./markets');
  res.json({ assets: rows.map(assetOut) });
});

router.post('/watchlist/:symbol', requireAuth, (req, res) => {
  const asset = getAssetBySymbol.get(req.params.symbol);
  if (!asset) return res.status(404).json({ error: 'Actif introuvable.' });
  db.prepare('INSERT OR IGNORE INTO watchlist (user_id, asset_id) VALUES (?,?)').run(req.user.id, asset.id);
  res.status(201).json({ ok: true });
});

router.delete('/watchlist/:symbol', requireAuth, (req, res) => {
  const asset = getAssetBySymbol.get(req.params.symbol);
  if (!asset) return res.status(404).json({ error: 'Actif introuvable.' });
  db.prepare('DELETE FROM watchlist WHERE user_id = ? AND asset_id = ?').run(req.user.id, asset.id);
  res.json({ ok: true });
});

router.get('/notifications', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
  const unread = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0').get(req.user.id).n;
  res.json({ notifications: rows, unread });
});

router.post('/notifications/read', requireAuth, (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
});

module.exports = router;
