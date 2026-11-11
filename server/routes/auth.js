const express = require('express');
const { db, getSetting, setSetting } = require('../db');
const {
  scryptHash, verifyPassword, issueToken, sha256, randomToken,
  validEmail, validUsername, strongPassword, publicUser,
  getUserByEmail
} = require('../util');
const { requireAuth } = require('../middleware/auth');
const { notify, recordTx } = require('../services/engine');

const router = express.Router();

const recentAttempts = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const arr = (recentAttempts.get(key) || []).filter(t => now - t < windowMs);
  arr.push(now);
  recentAttempts.set(key, arr);
  if (recentAttempts.size > 5000) {
    for (const [k, v] of recentAttempts) if (v.every(t => now - t > windowMs)) recentAttempts.delete(k);
  }
  return arr.length <= max;
}

router.post('/register', (req, res) => {
  if (getSetting('registration_open', '1') !== '1') return res.status(403).json({ error: 'Inscriptions désactivées par l\'administration.' });
  const ip = req.ip || 'unknown';
  if (!rateLimit('reg:' + ip, 5, 3600000)) return res.status(429).json({ error: 'Trop de tentatives. Réessayez plus tard.' });
  const { email, username, password } = req.body || {};
  if (!validEmail(email)) return res.status(400).json({ error: 'Email invalide.' });
  if (!validUsername(username)) return res.status(400).json({ error: "Nom d'utilisateur invalide (3-24 caractères : lettres, chiffres, _ . -)." });
  if (!strongPassword(password)) return res.status(400).json({ error: 'Mot de passe trop faible : 10 caractères minimum, avec lettres et chiffres.' });
  if (getUserByEmail(email)) return res.status(409).json({ error: 'Email déjà utilisé.' });
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) return res.status(409).json({ error: "Nom d'utilisateur déjà pris." });

  const now = Date.now();
  const startBalance = parseFloat(getSetting('start_balance', '10000')) || 10000;
  const info = db.prepare(`INSERT INTO users (email, username, password_hash, role, balance, created_at, last_login_at)
    VALUES (?,?,?,'user',?,?,?)`).run(email, username, scryptHash(password), startBalance, now, now);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  recordTx(user.id, { kind: 'bonus', total: 0, note: `Solde de départ crédité : ${startBalance.toFixed(2)} $ virtuels` });
  notify(user.id, 'Bienvenue sur Buxcoin 🎉', `${startBalance.toFixed(2)} $ virtuels ont été crédités sur votre portefeuille. Bonne simulation !`, 'info');
  res.status(201).json({ token: issueToken(user), user: publicUser(user) });
});

router.post('/login', (req, res) => {
  const ip = req.ip || 'unknown';
  if (!rateLimit('login:' + ip, 10, 300000)) return res.status(429).json({ error: 'Trop de tentatives de connexion. Réessayez dans quelques minutes.' });
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Email et mot de passe requis.' });
  const user = getUserByEmail(email.trim());
  const ok = user && verifyPassword(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
  if (user.is_blocked) return res.status(403).json({ error: 'Ce compte a été bloqué par l\'administration.' });
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(Date.now(), user.id);
  res.json({ token: issueToken(user), user: publicUser(user) });
});

router.post('/logout', requireAuth, (req, res) => {
  res.json({ ok: true, message: 'Déconnexion effectuée côté client (jeton invalidé localement).' });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.post('/forgot-password', (req, res) => {
  const ip = req.ip || 'unknown';
  if (!rateLimit('forgot:' + ip, 5, 3600000)) return res.status(429).json({ error: 'Trop de demandes. Réessayez plus tard.' });
  const { email } = req.body || {};
  const generic = { ok: true, message: 'Si cet email existe, un lien de réinitialisation a été généré.' };
  if (!validEmail(email)) return res.json(generic);
  const user = getUserByEmail(email.trim());
  if (!user) return res.json(generic);
  const token = randomToken(24);
  db.prepare('UPDATE users SET reset_token_hash = ?, reset_token_expires = ? WHERE id = ?')
    .run(sha256(token), Date.now() + 3600000, user.id);
  const delivery = getSetting('reset_token_delivery', 'display');
  if (delivery === 'display') {
    return res.json({ ...generic, reset_token: token, note: 'Mode simulateur : le jeton est affiché ici. En production, configurez un SMTP (RESET_DELIVERY=smtp).' });
  }
  console.log(`[auth] Reset token for ${user.email}: ${token}`);
  return res.json(generic);
});

router.post('/reset-password', (req, res) => {
  const { token, password } = req.body || {};
  if (typeof token !== 'string' || !strongPassword(password)) {
    return res.status(400).json({ error: 'Jeton requis et mot de passe de 10 caractères minimum (lettres + chiffres).' });
  }
  const user = db.prepare('SELECT * FROM users WHERE reset_token_hash = ? AND reset_token_expires > ?').get(sha256(token), Date.now());
  if (!user) return res.status(400).json({ error: 'Jeton invalide ou expiré.' });
  db.prepare('UPDATE users SET password_hash = ?, reset_token_hash = NULL, reset_token_expires = NULL, token_version = token_version + 1 WHERE id = ?')
    .run(scryptHash(password), user.id);
  notify(user.id, 'Mot de passe modifié', 'Votre mot de passe a été réinitialisé. Toutes les sessions ont été déconnectées.', 'security');
  res.json({ ok: true });
});

router.post('/change-password', requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  if (!verifyPassword(String(current || ''), req.user.password_hash)) {
    return res.status(401).json({ error: 'Mot de passe actuel incorrect.' });
  }
  if (!strongPassword(next)) return res.status(400).json({ error: 'Nouveau mot de passe trop faible (10 caractères min., lettres + chiffres).' });
  db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?').run(scryptHash(next), req.user.id);
  res.json({ ok: true, message: 'Mot de passe modifié. Reconnectez-vous sur vos autres appareils.' });
});

router.patch('/preferences', requireAuth, (req, res) => {
  const { theme, notifications_enabled } = req.body || {};
  if (theme === 'dark' || theme === 'light') db.prepare('UPDATE users SET theme = ? WHERE id = ?').run(theme, req.user.id);
  if (typeof notifications_enabled === 'boolean') {
    db.prepare('UPDATE users SET notifications_enabled = ? WHERE id = ?').run(notifications_enabled ? 1 : 0, req.user.id);
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: publicUser(user) });
});

module.exports = router;
