const express = require('express');
const { db, getSetting, setSetting, ownerExists } = require('../db');
const { requireMinRole } = require('../middleware/auth');
const { finiteNumber, publicUser, scryptHash, validEmail, validUsername, strongPassword } = require('../util');
const { recordTx, notify } = require('../services/engine');

const router = express.Router();
const requireAdmin = requireMinRole(2);
const requireOwner = requireMinRole(3);

router.get('/users', requireAdmin, (req, res) => {
  const q = String(req.query.q || '').trim();
  let rows = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
  if (q) rows = rows.filter(u => u.email.toLowerCase().includes(q.toLowerCase()) || u.username.toLowerCase().includes(q.toLowerCase()));
  const counts = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const blocked = db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_blocked = 1').get().n;
  res.json({
    users: rows.map(publicUser),
    summary: { total: counts, blocked, admins: rows.filter(u => u.role !== 'user').length }
  });
});

router.get('/users/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  const portfolio = require('../services/engine').portfolioFor(id);
  const txs = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(id);
  res.json({ user: publicUser(user), portfolio, transactions: txs });
});

router.post('/users/:id/money', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { operation, amount, note } = req.body || {};
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  if (!['add', 'remove'].includes(operation)) return res.status(400).json({ error: "Opération invalide ('add' ou 'remove')." });
  const amt = finiteNumber(amount, 0.01, 1e9);
  if (amt === null) return res.status(400).json({ error: 'Montant invalide.' });
  if (operation === 'remove' && target.balance < amt) {
    return res.status(400).json({ error: `Solde insuffisant (${target.balance.toFixed(2)} $) pour retirer ${amt.toFixed(2)} $.` });
  }
  const delta = operation === 'add' ? amt : -amt;
  db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(delta, id);
  recordTx(id, {
    kind: operation === 'add' ? 'admin_credit' : 'admin_debit',
    total: 0,
    note: `${operation === 'add' ? 'Crédit' : 'Débit'} administrateur : ${operation === 'add' ? '+' : '-'}${amt.toFixed(2)} $${note ? ' — ' + String(note).slice(0, 140) : ''}`
  });
  notify(id, 'Mouvement administrateur', `${operation === 'add' ? '+' : '-'}${amt.toFixed(2)} $ virtuels ${operation === 'add' ? 'crédités' : 'débités'} sur votre compte par l'administration.`, 'admin');
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  res.json({ ok: true, user: publicUser(updated) });
});

router.post('/users/:id/block', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  if (target.role === 'owner') return res.status(403).json({ error: 'Impossible de bloquer le propriétaire.' });
  if (req.user.role === 'admin' && target.role === 'admin') return res.status(403).json({ error: 'Un administrateur ne peut pas bloquer un autre administrateur.' });
  const block = req.body && typeof req.body.block === 'boolean' ? req.body.block : true;
  db.prepare('UPDATE users SET is_blocked = ?, token_version = token_version + 1 WHERE id = ?').run(block ? 1 : 0, id);
  res.json({ ok: true, user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) });
});

router.post('/users/:id/role', requireOwner, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { role } = req.body || {};
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: "Rôle invalide ('user' ou 'admin'). Le propriétaire est unique et défini lors de la configuration du serveur." });
  if (target.role === 'owner') return res.status(403).json({ error: 'Le statut de propriétaire ne peut pas être modifié ici.' });
  db.prepare('UPDATE users SET role = ?, token_version = token_version + 1 WHERE id = ?').run(role, id);
  notify(id, 'Permissions modifiées', role === 'admin'
    ? 'Vous avez été promu administrateur par le propriétaire.'
    : 'Vos permissions d\'administration ont été révoquées.', 'security');
  res.json({ ok: true, user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) });
});

router.delete('/users/:id', requireOwner, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  if (target.role === 'owner') return res.status(403).json({ error: 'Le propriétaire ne peut pas être supprimé.' });
  if (req.user.id === id) return res.status(403).json({ error: 'Utilisez la suppression de compte depuis vos paramètres personnels.' });
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true, deleted: target.email });
});

router.post('/admins', requireOwner, (req, res) => {
  const { email, username, password } = req.body || {};
  if (!validEmail(email)) return res.status(400).json({ error: 'Email invalide.' });
  if (!validUsername(username)) return res.status(400).json({ error: "Nom d'utilisateur invalide." });
  if (!strongPassword(password)) return res.status(400).json({ error: 'Mot de passe trop faible (10 caractères min., lettres + chiffres).' });
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'Email déjà utilisé.' });
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) return res.status(409).json({ error: "Nom d'utilisateur déjà pris." });
  const now = Date.now();
  const startBalance = parseFloat(getSetting('start_balance', '10000')) || 10000;
  const info = db.prepare(`INSERT INTO users (email, username, password_hash, role, balance, created_at)
    VALUES (?,?,?,'admin',?,?)`).run(email, username, scryptHash(password), startBalance, now);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ ok: true, user: publicUser(user) });
});

router.get('/settings', requireAdmin, (req, res) => {
  const keys = ['site_name', 'fee_percent', 'start_balance', 'market_simulation', 'registration_open', 'reset_token_delivery', 'maintenance_message'];
  const settings = {};
  for (const k of keys) settings[k] = getSetting(k, '');
  res.json({ settings, owner_configured: ownerExists() });
});

router.patch('/settings', requireOwner, (req, res) => {
  const allowed = ['site_name', 'fee_percent', 'start_balance', 'market_simulation', 'registration_open', 'reset_token_delivery', 'maintenance_message'];
  const changed = {};
  for (const k of allowed) {
    if (req.body && req.body[k] !== undefined) {
      let v = String(req.body[k]);
      if (k === 'fee_percent') {
        const n = parseFloat(v);
        if (!Number.isFinite(n) || n < 0 || n > 10) return res.status(400).json({ error: 'Frais invalides (0 à 10 %).' });
      }
      if (k === 'start_balance') {
        const n = parseFloat(v);
        if (!Number.isFinite(n) || n < 0 || n > 1e9) return res.status(400).json({ error: 'Solde de départ invalide.' });
      }
      if (k === 'reset_token_delivery' && !['display', 'smtp'].includes(v)) return res.status(400).json({ error: 'Mode de livraison invalide.' });
      if (v.length > 500) return res.status(400).json({ error: 'Valeur trop longue.' });
      setSetting(k, v);
      changed[k] = v;
    }
  }
  res.json({ ok: true, changed });
});

router.post('/events', requireAdmin, (req, res) => {
  const { title, category, event_date, description } = req.body || {};
  if (typeof title !== 'string' || !title.trim() || title.length > 140) return res.status(400).json({ error: 'Titre invalide.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(event_date || ''))) return res.status(400).json({ error: 'Date invalide (AAAA-MM-JJ).' });
  const cat = ['economie', 'resultats', 'crypto', 'autre'].includes(category) ? category : 'autre';
  const info = db.prepare('INSERT INTO market_events (title, category, event_date, description, created_by) VALUES (?,?,?,?,?)')
    .run(title.trim(), cat, event_date, String(description || '').slice(0, 500), req.user.id);
  res.status(201).json({ ok: true, event: db.prepare('SELECT * FROM market_events WHERE id = ?').get(info.lastInsertRowid) });
});

router.delete('/events/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const r = db.prepare('DELETE FROM market_events WHERE id = ?').run(id);
  if (r.changes === 0) return res.status(404).json({ error: 'Événement introuvable.' });
  res.json({ ok: true });
});

router.get('/overview', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const orders = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE created_at > ?").get(Date.now() - 86400000).n;
  const openOrders = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'open'").get().n;
  const tx24 = db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE created_at > ? AND kind = 'trade'").get(Date.now() - 86400000).n;
  const money = db.prepare('SELECT SUM(balance) AS s FROM users').get().s || 0;
  const holdingsValue = db.prepare(`
    SELECT SUM(h.qty * a.price) AS v FROM holdings h JOIN assets a ON a.id = h.asset_id`).get().v || 0;
  res.json({
    overview: {
      users, trades_24h: tx24, orders_24h: orders, open_orders: openOrders,
      total_virtual_cash: money, total_virtual_invested: holdingsValue,
      total_virtual_wealth: money + holdingsValue
    }
  });
});

module.exports = router;
