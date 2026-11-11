#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const OWNER = 'djdekek192-design';
const REPO = 'buxcoin';
const ROOT = path.join(__dirname, '..');

function sh(cmd) {
  return JSON.parse(execSync(cmd, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
}

function walk(dir, base = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'data', 'smoke-data'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = base ? base + '/' + entry.name : entry.name;
    if (entry.isDirectory()) out.push(...walk(full, rel));
    else out.push({ path: rel, full });
  }
  return out;
}

async function ghApi(endpoint, body, method) {
  const args = ['api', endpoint];
  if (method) args.push('-X', method);
  if (body) args.push('--input', '-');
  const res = execSync('gh ' + args.join(' ') + (body ? ' 2>&1' : ' 2>&1'), {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    input: body ? JSON.stringify(body) : undefined
  });
  return res.trim() ? JSON.parse(res) : {};
}

async function main() {
  const files = walk(ROOT);
  console.log(`${files.length} fichiers à pousser`);
  const tree = files.map(f => ({
    path: f.path,
    mode: '100644',
    type: 'blob',
    content: fs.readFileSync(f.full, 'utf8')
  }));
  const treeRes = await ghApi(`/repos/${OWNER}/${REPO}/git/trees`, { tree });
  console.log('tree créé:', treeRes.sha.slice(0, 10));

  const commitRes = await ghApi(`/repos/${OWNER}/${REPO}/git/commits`, {
    message: 'Buxcoin — plateforme de simulation de trading (argent 100% fictif)\n\n- Site web professionnel + PWA installable (iPhone, Android, ordinateur)\n- Comptes : inscription, connexion, déconnexion, récupération de mot de passe\n- Sécurité : scrypt, sessions HMAC signées, rôles contrôlés côté serveur, CSP, rate-limit\n- Propriétaire attribué de manière sécurisée (jeton serveur + CLI), jamais au premier compte\n- Marchés temps réel : BTC, ETH, SOL, BNB, AAPL, MSFT, NVDA, TSLA, AMZN, Or\n- Trading : ordres Market/Limit/Stop-Loss simulés, portefeuille, historique, watchlist\n- Analyse technique : chandeliers japonais, RSI, MACD, moyennes mobiles, signaux\n- IA : analyse de graphiques, tendances, risques, assistant conversationnel\n- Administration privée : argent fictif, rôles, blocage, suppression, paramètres globaux',
    tree: treeRes.sha,
    parents: []
  });
  console.log('commit créé:', commitRes.sha.slice(0, 10));

  await ghApi(`/repos/${OWNER}/${REPO}/git/refs`, { ref: 'refs/heads/main', sha: commitRes.sha });
  console.log('branche main créée');
  console.log('OK → https://github.com/' + OWNER + '/' + REPO);
}

main().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });
