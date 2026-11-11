const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { db, getSetting, ownerExists } = require('../db');
const config = require('../config');
const { scryptHash, sha256, randomToken, validEmail, validUsername, strongPassword, issueToken, publicUser } = require('../util');

const router = express.Router();

function createOwnerSetupToken(ttlHours = 24) {
  const token = randomToken(32);
  db.prepare('INSERT INTO setup_tokens (token_hash, purpose, expires_at) VALUES (?,?,?)')
    .run(sha256(token), 'owner_setup', Date.now() + ttlHours * 3600000);
  const file = path.join(config.dataDir, 'OWNER_SETUP_TOKEN.txt');
  fs.writeFileSync(file, token + '\n', { mode: 0o600 });
  return { token, file };
}

function ensureOwnerSetupToken() {
  db.prepare("DELETE FROM setup_tokens WHERE purpose = 'owner_setup' AND used = 0").run();
  try { fs.unlinkSync(path.join(config.dataDir, 'OWNER_SETUP_TOKEN.txt')); } catch (_) {}
  return createOwnerSetupToken();
}

router.get('/status', (req, res) => {
  res.json({ owner_configured: ownerExists() });
});

router.post('/owner', (req, res) => {
  if (ownerExists()) return res.status(409).json({ error: 'Le propriétaire est déjà configuré. Utilisez plutôt la connexion.' });
  const { token, email, username, password } = req.body || {};
  if (!token || typeof token !== 'string') return res.status(400).json({ error: 'Jeton de configuration requis.' });
  if (!validEmail(email)) return res.status(400).json({ error: 'Email invalide.' });
  if (!validUsername(username)) return res.status(400).json({ error: "Nom d'utilisateur invalide (3-24 caractères alphanumériques)." });
  if (!strongPassword(password)) return res.status(400).json({ error: 'Mot de passe trop faible : 10 caractères minimum, lettres et chiffres.' });

  const row = db.prepare("SELECT * FROM setup_tokens WHERE token_hash = ? AND purpose = 'owner_setup' AND used = 0").get(sha256(token));
  if (!row) return res.status(403).json({ error: 'Jeton invalide.' });
  if (row.expires_at < Date.now()) return res.status(403).json({ error: 'Jeton expiré. Régénérez-le via scripts/setup-owner.js.' });

  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'Email déjà utilisé.' });
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) return res.status(409).json({ error: "Nom d'utilisateur déjà pris." });

  const now = Date.now();
  const startBalance = parseFloat(getSetting('start_balance', '10000')) || 10000;
  const info = db.prepare(`INSERT INTO users (email, username, password_hash, role, balance, created_at, last_login_at)
    VALUES (?,?,?,'owner',?,?,?)`).run(email, username, scryptHash(password), startBalance, now, now);
  db.prepare('UPDATE setup_tokens SET used = 1 WHERE token_hash = ?').run(row.token_hash);
  try { fs.unlinkSync(path.join(config.dataDir, 'OWNER_SETUP_TOKEN.txt')); } catch (_) {}

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.json({ token: issueToken(user), user: publicUser(user) });
});

module.exports = { router, ensureOwnerSetupToken };
