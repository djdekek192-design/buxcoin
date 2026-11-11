const { db, getSetting } = require('../db');

function feePercent() {
  const v = parseFloat(getSetting('fee_percent', '0.2'));
  return Number.isFinite(v) && v >= 0 && v <= 10 ? v : 0.2;
}

function notify(userId, title, body, kind = 'info') {
  db.prepare('INSERT INTO notifications (user_id, title, body, kind, created_at) VALUES (?,?,?,?,?)')
    .run(userId, title, body, kind, Date.now());
}

function recordTx(userId, { assetId = null, kind, side = null, qty = null, price = null, total, note = null }) {
  const balance = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId).balance;
  db.prepare(`INSERT INTO transactions (user_id, asset_id, kind, side, qty, price, total, balance_after, note, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(userId, assetId, kind, side, qty, price, total, balance, note, Date.now());
}

function getHolding(userId, assetId) {
  return db.prepare('SELECT * FROM holdings WHERE user_id = ? AND asset_id = ?').get(userId, assetId);
}

function applyBuy(userId, asset, qty, price) {
  const cost = qty * price;
  const fee = cost * feePercent() / 100;
  const total = cost + fee;
  const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId);
  if (!user || user.balance < total) return { ok: false, error: 'Solde virtuel insuffisant.' };
  db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(total, userId);
  const h = getHolding(userId, asset.id);
  if (h) {
    const newQty = h.qty + qty;
    const newAvg = (h.qty * h.avg_price + cost) / newQty;
    db.prepare('UPDATE holdings SET qty = ?, avg_price = ? WHERE user_id = ? AND asset_id = ?').run(newQty, newAvg, userId, asset.id);
  } else {
    db.prepare('INSERT INTO holdings (user_id, asset_id, qty, avg_price) VALUES (?,?,?,?)').run(userId, asset.id, qty, price);
  }
  recordTx(userId, { assetId: asset.id, kind: 'trade', side: 'buy', qty, price, total, note: `Achat ${qty} ${asset.symbol} @ ${price.toFixed(2)}$ (frais ${fee.toFixed(2)}$)` });
  notify(userId, 'Ordre exécuté', `Achat de ${qty} ${asset.symbol} exécuté à ${price.toFixed(2)} $ (virtuel).`, 'trade');
  return { ok: true, price, total };
}

function applySell(userId, asset, qty, price) {
  const h = getHolding(userId, asset.id);
  if (!h || h.qty < qty - 1e-9) return { ok: false, error: 'Quantité détenue insuffisante.' };
  qty = Math.min(qty, h.qty);
  const gross = qty * price;
  const fee = gross * feePercent() / 100;
  const net = gross - fee;
  const pnl = (price - h.avg_price) * qty;
  db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(net, userId);
  const remaining = h.qty - qty;
  if (remaining <= 1e-9) {
    db.prepare('DELETE FROM holdings WHERE user_id = ? AND asset_id = ?').run(userId, asset.id);
  } else {
    db.prepare('UPDATE holdings SET qty = ? WHERE user_id = ? AND asset_id = ?').run(remaining, userId, asset.id);
  }
  recordTx(userId, { assetId: asset.id, kind: 'trade', side: 'sell', qty, price, total: net, note: `Vente ${qty} ${asset.symbol} @ ${price.toFixed(2)}$ — P&L ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}$` });
  notify(userId, 'Ordre exécuté', `Vente de ${qty} ${asset.symbol} exécutée à ${price.toFixed(2)} $ (virtuel). P&L: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} $.`, 'trade');
  return { ok: true, price, total: net, pnl };
}

function executeMarketOrder(user, asset, side, qty) {
  if (!(qty > 0)) return { ok: false, error: 'Quantité invalide.' };
  const price = db.prepare('SELECT price FROM assets WHERE id = ?').get(asset.id).price;
  if (side === 'buy') {
    const r = applyBuy(user.id, asset, qty, price);
    if (r.ok) {
      db.prepare(`INSERT INTO orders (user_id, asset_id, side, type, qty, status, filled_price, created_at, filled_at)
        VALUES (?,?,?,?,?,'filled',?,?,?)`).run(user.id, asset.id, side, 'market', qty, price, Date.now(), Date.now());
    }
    return r;
  }
  const r = applySell(user.id, asset, qty, price);
  if (r.ok) {
    db.prepare(`INSERT INTO orders (user_id, asset_id, side, type, qty, status, filled_price, created_at, filled_at)
      VALUES (?,?,?,?,?,'filled',?,?,?)`).run(user.id, asset.id, side, 'stop_loss' === 'x' ? 'market' : 'market', qty, price, Date.now(), Date.now());
  }
  return r;
}

function processOpenOrders() {
  const open = db.prepare(`
    SELECT o.*, u.id AS uid, a.price AS market_price, a.symbol
    FROM orders o JOIN users u ON u.id = o.user_id JOIN assets a ON a.id = o.asset_id
    WHERE o.status = 'open' AND u.is_blocked = 0`).all();
  let filled = 0;
  for (const o of open) {
    const p = o.market_price;
    let trigger = false;
    if (o.type === 'limit') {
      trigger = o.side === 'buy' ? p <= o.limit_price : p >= o.limit_price;
    } else if (o.type === 'stop_loss') {
      trigger = o.side === 'sell' && p <= o.stop_price;
      if (o.side === 'buy') trigger = p >= o.stop_price;
    }
    if (!trigger) continue;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(o.user_id);
    const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(o.asset_id);
    const r = o.side === 'buy' ? applyBuy(user.id, asset, o.qty, p) : applySell(user.id, asset, o.qty, p);
    if (r.ok) {
      db.prepare("UPDATE orders SET status = 'filled', filled_price = ?, filled_at = ? WHERE id = ?").run(p, Date.now(), o.id);
      filled++;
    } else {
      db.prepare("UPDATE orders SET status = 'rejected' WHERE id = ?").run(o.id);
      notify(o.user_id, 'Ordre rejeté', `Ordre ${o.type} sur ${o.symbol} rejeté : ${r.error}`, 'warning');
    }
  }
  return filled;
}

function portfolioFor(userId) {
  const rows = db.prepare(`
    SELECT h.qty, h.avg_price, a.id AS asset_id, a.symbol, a.name, a.kind, a.price
    FROM holdings h JOIN assets a ON a.id = h.asset_id WHERE h.user_id = ? AND h.qty > 1e-9`).all(userId);
  let invested = 0, cost = 0;
  const positions = rows.map(r => {
    const value = r.qty * r.price;
    invested += value;
    cost += r.qty * r.avg_price;
    return {
      asset_id: r.asset_id, symbol: r.symbol, name: r.name, kind: r.kind,
      qty: r.qty, avg_price: r.avg_price, price: r.price,
      value, pnl: value - r.qty * r.avg_price,
      pnl_percent: r.avg_price > 0 ? ((r.price - r.avg_price) / r.avg_price) * 100 : 0
    };
  });
  const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId);
  return { positions, invested, cost, cash: user ? user.balance : 0, total: invested + (user ? user.balance : 0) };
}

module.exports = { feePercent, notify, recordTx, applyBuy, applySell, executeMarketOrder, processOpenOrders, portfolioFor };
