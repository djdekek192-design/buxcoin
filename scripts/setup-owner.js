#!/usr/bin/env node
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const config = require('../server/config');
const { db, ownerExists } = require('../server/db');
const { scryptHash, validEmail, validUsername, strongPassword, sha256, randomToken } = require('../server/util');

function ask(rl, question, hide = false) {
  return new Promise(resolve => {
    if (!hide) rl.question(question, resolve);
    else {
      const stdin = process.stdin;
      const wasRaw = stdin.isRaw;
      if (stdin.isTTY) stdin.setRawMode(true);
      process.stdout.write(question);
      let value = '';
      const onData = (ch) => {
        const c = ch.toString('utf8');
        if (c === '\n' || c === '\r') {
          if (stdin.isTTY) stdin.setRawMode(wasRaw);
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(value);
        } else if (c === '\u0003') {
          process.exit(1);
        } else if (c === '\u007f' || c === '\b') {
          value = value.slice(0, -1);
        } else {
          value += c;
        }
      };
      stdin.on('data', onData);
    }
  });
}

async function main() {
  console.log('=== Buxcoin — Configuration sécurisée du propriétaire ===');
  console.log('Le statut propriétaire est attribué UNIQUEMENT via cette procédure.\n');

  if (ownerExists()) {
    console.log('Un propriétaire existe déjà. Procédure refusée pour des raisons de sécurité.');
    console.log('Pour transférer la propriété, utilisez le panneau d\'administration connecté en tant que propriétaire.');
    process.exit(1);
  }

  let token = null;
  const pending = db.prepare("SELECT token_hash, expires_at FROM setup_tokens WHERE purpose = 'owner_setup' AND used = 0 AND expires_at > ?").get(Date.now());
  if (pending) {
    const file = path.join(config.dataDir, 'OWNER_SETUP_TOKEN.txt');
    if (fs.existsSync(file)) token = fs.readFileSync(file, 'utf8').trim();
    if (!token) {
      console.log('Un jeton existe en base mais le fichier est introuvable. Régénération impossible par sécurité.');
      console.log('Supprimez-le : DELETE FROM setup_tokens; puis relancez.');
      process.exit(1);
    }
    console.log('Jeton de configuration existant trouvé (data/OWNER_SETUP_TOKEN.txt).');
  } else {
    token = randomToken(32);
    db.prepare('INSERT INTO setup_tokens (token_hash, purpose, expires_at) VALUES (?,?,?)')
      .run(sha256(token), 'owner_setup', Date.now() + 24 * 3600000);
    const file = path.join(config.dataDir, 'OWNER_SETUP_TOKEN.txt');
    fs.writeFileSync(file, token + '\n', { mode: 0o600 });
    console.log('Nouveau jeton généré et stocké (haché en base, fichier 0600).');
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const email = (await ask(rl, 'Email du propriétaire : ')).trim();
  const username = (await ask(rl, "Nom d'utilisateur : ")).trim();
  const password = await ask(rl, 'Mot de passe (masqué, 10+ caractères, lettres+chiffres) : ', true);
  const confirm = await ask(rl, 'Confirmer le mot de passe : ', true);
  rl.close();

  if (!validEmail(email)) { console.error('✗ Email invalide.'); process.exit(1); }
  if (!validUsername(username)) { console.error("✗ Nom d'utilisateur invalide."); process.exit(1); }
  if (!strongPassword(password)) { console.error('✗ Mot de passe trop faible.'); process.exit(1); }
  if (password !== confirm) { console.error('✗ Les mots de passe ne correspondent pas.'); process.exit(1); }
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) { console.error('✗ Email déjà utilisé.'); process.exit(1); }
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) { console.error("✗ Nom d'utilisateur déjà pris."); process.exit(1); }

  const row = db.prepare("SELECT * FROM setup_tokens WHERE token_hash = ? AND used = 0").get(sha256(token));
  if (!row || row.expires_at < Date.now()) { console.error('✗ Jeton invalide ou expiré.'); process.exit(1); }

  const now = Date.now();
  const startBalance = parseFloat(db.prepare("SELECT value FROM settings WHERE key = 'start_balance'").get()?.value || '10000');
  const info = db.prepare(`INSERT INTO users (email, username, password_hash, role, balance, created_at, last_login_at)
    VALUES (?,?,?,'owner',?,?,?)`).run(email, username, scryptHash(password), startBalance, now, now);
  db.prepare('UPDATE setup_tokens SET used = 1 WHERE token_hash = ?').run(row.token_hash);
  try { fs.unlinkSync(path.join(config.dataDir, 'OWNER_SETUP_TOKEN.txt')); } catch (_) {}

  console.log(`\n✓ Propriétaire créé : ${username} <${email}> (id ${info.lastInsertRowid})`);
  console.log(`✓ Solde initial : ${startBalance.toFixed(2)} $ virtuels`);
  console.log('Connectez-vous sur le site avec ce compte pour accéder au panneau d\'administration complet.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
