#!/usr/bin/env node
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'smoke-data');

function cleanup() {
  fs.rmSync(DATA, { recursive: true, force: true });
}

async function main() {
  cleanup();
  process.env.BUX_DATA_DIR = DATA;
  process.env.PORT = '3777';
  process.env.PRICE_TICK_MS = '500';
  const server = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], {
    env: process.env, stdio: ['ignore', 'pipe', 'pipe']
  });
  let out = '';
  server.stdout.on('data', d => { out += d; process.stdout.write('[srv] ' + d); });
  server.stderr.on('data', d => { process.stdout.write('[srv-err] ' + d); });

  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  let ready = false;
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch('http://127.0.0.1:3777/api/setup/status');
      if (r.ok) { ready = true; break; }
    } catch (_) {}
    await wait(500);
  }
  if (!ready) { console.error('Serveur jamais prêt'); server.kill('SIGTERM'); process.exit(1); }

  const B = 'http://localhost:3777/api';
  let failures = 0;
  const check = (name, cond, extra = '') => {
    if (cond) console.log('  ✓', name);
    else { console.log('  ✗ FAIL:', name, extra); failures++; }
  };

  const jreq = async (method, p, body, token) => {
    const res = await fetch(B + p, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    let data = {};
    try { data = await res.json(); } catch (_) {}
    return { status: res.status, data };
  };

  console.log('\n== Setup owner ==');
  const status = await jreq('GET', '/setup/status');
  check('owner non configuré', status.data.owner_configured === false);
  const tokenFile = path.join(DATA, 'OWNER_SETUP_TOKEN.txt');
  check('jeton de setup généré', fs.existsSync(tokenFile));
  const setupToken = fs.readFileSync(tokenFile, 'utf8').trim();
  const owner = await jreq('POST', '/setup/owner', {
    token: setupToken, email: 'owner@buxcoin.local', username: 'owner1', password: 'SuperSecret123'
  });
  check('propriétaire créé', owner.status === 200 && owner.data.user.role === 'owner', JSON.stringify(owner.data));
  const ownerTok = owner.data.token;

  const badSetup = await jreq('POST', '/setup/owner', {
    token: setupToken, email: 'x@y.local', username: 'hacker', password: 'Password123'
  });
  check('jeton consumé (réutilisation refusée)', badSetup.status === 403 || badSetup.status === 409);

  console.log('\n== Inscription / premier compte != owner ==');
  const reg = await jreq('POST', '/auth/register', { email: 'alice@test.fr', username: 'alice', password: 'Password123' });
  check('inscription OK', reg.status === 201, JSON.stringify(reg.data));
  check('premier compte = user (pas owner)', reg.data.user.role === 'user');
  check('solde de départ crédité', reg.data.user.balance > 0);
  let aliceTok = reg.data.token;

  const dup = await jreq('POST', '/auth/register', { email: 'alice@test.fr', username: 'alice2', password: 'Password123' });
  check('email dupliqué refusé', dup.status === 409);
  const weak = await jreq('POST', '/auth/register', { email: 'bob@test.fr', username: 'bob', password: 'abc' });
  check('mot de passe faible refusé', weak.status === 400);

  console.log('\n== Connexion / session ==');
  const badLogin = await jreq('POST', '/auth/login', { email: 'alice@test.fr', password: 'Wrong1234' });
  check('mauvais mot de passe refusé', badLogin.status === 401);
  const login = await jreq('POST', '/auth/login', { email: 'alice@test.fr', password: 'Password123' });
  check('connexion OK', login.status === 200);
  const me = await jreq('GET', '/auth/me', null, aliceTok);
  check('/auth/me OK', me.status === 200 && me.data.user.username === 'alice');

  console.log('\n== Reset password ==');
  const forgot = await jreq('POST', '/auth/forgot-password', { email: 'alice@test.fr' });
  check('forgot OK avec jeton affiché (mode simulateur)', forgot.data.reset_token !== undefined);
  const reset = await jreq('POST', '/auth/reset-password', { token: forgot.data.reset_token, password: 'NewPassword123' });
  check('reset OK', reset.status === 200);
  const oldSess = await jreq('GET', '/auth/me', null, aliceTok);
  check('sessions révoquées après reset', oldSess.status === 401);
  const relogin = await jreq('POST', '/auth/login', { email: 'alice@test.fr', password: 'NewPassword123' });
  check('reconnexion avec nouveau mot de passe', relogin.status === 200);
  aliceTok = relogin.data.token;

  console.log('\n== Marchés ==');
  const assets = await jreq('GET', '/markets/assets', null, aliceTok);
  check('10 actifs seedés', assets.data.assets.length === 10, 'got ' + (assets.data.assets || []).length);
  const btc = assets.data.assets.find(a => a.symbol === 'BTC');
  check('BTC présent', !!btc);
  const candles = await jreq('GET', '/markets/assets/BTC/candles?interval=1h', null, aliceTok);
  check('historique bougies présent', candles.data.candles.length >= 100, 'got ' + candles.data.candles.length);
  const analysis = await jreq('GET', '/markets/assets/BTC/analysis', null, aliceTok);
  check('analyse IA (RSI/MACD/tendance/risque)', analysis.status === 200 && analysis.data.analysis.signals.length > 0);
  const cal = await jreq('GET', '/markets/calendar', null, aliceTok);
  check('calendrier seedé', cal.data.events.length >= 5);
  const noAuthAssets = await jreq('GET', '/markets/assets');
  check('marchés protégés sans jeton', noAuthAssets.status === 401);

  console.log('\n== Trading ==');
  await wait(1200);
  const buy = await jreq('POST', '/trading/orders', { symbol: 'BTC', side: 'buy', type: 'market', qty: 0.1 }, aliceTok);
  check('ordre market buy exécuté', buy.status === 201 && buy.data.status === 'filled', JSON.stringify(buy.data));
  const pf1 = await jreq('GET', '/trading/portfolio', null, aliceTok);
  check('position BTC créée', pf1.data.portfolio.positions.some(p => p.symbol === 'BTC'));
  const tooMuch = await jreq('POST', '/trading/orders', { symbol: 'BTC', side: 'buy', type: 'market', qty: 1e9 }, aliceTok);
  check('achat sans solde refusé', tooMuch.status === 400);
  const sellTooMuch = await jreq('POST', '/trading/orders', { symbol: 'BTC', side: 'sell', type: 'market', qty: 999 }, aliceTok);
  check('vente sans quantité refusée', sellTooMuch.status === 400);

  const priceNow = (await jreq('GET', '/markets/assets/BTC', null, aliceTok)).data.asset.price;
  const limit = await jreq('POST', '/trading/orders', { symbol: 'BTC', side: 'buy', type: 'limit', qty: 0.01, limit_price: priceNow * 1.5 }, aliceTok);
  check('ordre limit créé', limit.status === 201, JSON.stringify(limit.data));
  await wait(2500);
  const openAfter = await jreq('GET', '/trading/orders/open', null, aliceTok);
  check('ordre limit exécuté par le moteur au tick', openAfter.data.orders.length === 0, JSON.stringify(openAfter.data.orders));

  const stop = await jreq('POST', '/trading/orders', { symbol: 'BTC', side: 'sell', type: 'stop_loss', qty: 0.01, stop_price: priceNow * 2 }, aliceTok);
  check('stop-loss créé', stop.status === 201);
  await wait(2500);
  const openAfter2 = await jreq('GET', '/trading/orders/open', null, aliceTok);
  check('stop-loss déclenché par le moteur', openAfter2.data.orders.length === 0);

  const tx = await jreq('GET', '/trading/transactions', null, aliceTok);
  check('historique transactions', tx.data.transactions.length >= 2);
  const stats = await jreq('GET', '/trading/stats', null, aliceTok);
  check('statistiques performance', stats.status === 200 && typeof stats.data.stats.total_trades === 'number');

  await jreq('POST', '/trading/watchlist/ETH', null, aliceTok).catch(() => {});
  const wl = await jreq('POST', '/trading/watchlist/ETH', aliceTok ? undefined : undefined, aliceTok);
  const wlGet = await jreq('GET', '/trading/watchlist', null, aliceTok);
  check('watchlist fonctionne', wlGet.status === 200 && wlGet.data.assets.some(a => a.symbol === 'ETH'));

  console.log('\n== IA ==');
  const chat = await jreq('POST', '/ai/chat', { message: 'analyse BTC' }, aliceTok);
  check('assistant répond avec analyse', chat.status === 200 && /Analyse Bitcoin/.test(chat.data.reply));
  const chat2 = await jreq('POST', '/ai/chat', { message: 'qu\'est-ce que le RSI ?' }, aliceTok);
  check('assistant pédagogique', /Relative Strength Index/.test(chat2.data.reply));
  const overview = await jreq('GET', '/ai/market-overview', null, aliceTok);
  check('vue IA des marchés', overview.status === 200 && overview.data.assets.length === 10);

  console.log('\n== Administration ==');
  const forbidden = await jreq('GET', '/admin/users', null, aliceTok);
  check('utilisateur simple bloqué sur /admin', forbidden.status === 403);
  const users = await jreq('GET', '/admin/users', null, ownerTok);
  check('propriétaire consulte les utilisateurs', users.status === 200 && users.data.users.length >= 2);
  const aliceId = users.data.users.find(u => u.username === 'alice').id;

  const balanceBefore = (await jreq('GET', '/trading/portfolio', null, aliceTok)).data.portfolio.cash;
  const credit = await jreq('POST', `/admin/users/${aliceId}/money`, { operation: 'add', amount: 500, note: 'test' }, ownerTok);
  check('ajout argent fictif', credit.status === 200 && Math.abs(credit.data.user.balance - (balanceBefore + 500)) < 0.01, JSON.stringify({ before: balanceBefore, after: credit.data.user && credit.data.user.balance }));
  const debit = await jreq('POST', `/admin/users/${aliceId}/money`, { operation: 'remove', amount: 200 }, ownerTok);
  check('retrait argent fictif', debit.status === 200 && Math.abs(debit.data.user.balance - (balanceBefore + 300)) < 0.01);

  const admin2 = await jreq('POST', '/admin/admins', { email: 'admin2@test.fr', username: 'admin2', password: 'Password123' }, ownerTok);
  check('création administrateur par le propriétaire', admin2.status === 201 && admin2.data.user.role === 'admin');
  const admin2Tok = (await jreq('POST', '/auth/login', { email: 'admin2@test.fr', password: 'Password123' })).data.token;
  const adminCanCredit = await jreq('POST', `/admin/users/${aliceId}/money`, { operation: 'add', amount: 1 }, admin2Tok);
  check('admin peut créditer', adminCanCredit.status === 200);
  const adminNoRole = await jreq('POST', `/admin/users/${aliceId}/role`, { role: 'admin' }, admin2Tok);
  check('admin ne peut pas gérer les rôles', adminNoRole.status === 403);
  const adminNoDelete = await jreq('DELETE', `/admin/users/${aliceId}`, null, admin2Tok);
  check('admin ne peut pas supprimer un compte', adminNoDelete.status === 403);

  const revoke = await jreq('POST', `/admin/users/${admin2.data.user.id}/role`, { role: 'user' }, ownerTok);
  check('révocation des permissions par le propriétaire', revoke.status === 200 && revoke.data.user.role === 'user');
  const revokedSess = await jreq('GET', '/admin/users', null, admin2Tok);
  check('session admin révoquée invalide', revokedSess.status === 401 || revokedSess.status === 403);

  const block = await jreq('POST', `/admin/users/${aliceId}/block`, { block: true }, ownerTok);
  check('blocage utilisateur', block.status === 200 && block.data.user.is_blocked === true);
  const blockedLogin = await jreq('POST', '/auth/login', { email: 'alice@test.fr', password: 'NewPassword123' });
  check('utilisateur bloqué ne peut plus se connecter', blockedLogin.status === 403);
  await jreq('POST', `/admin/users/${aliceId}/block`, { block: false }, ownerTok);

  const settings = await jreq('PATCH', '/admin/settings', { fee_percent: '0.5' }, ownerTok);
  check('paramètres globaux modifiés', settings.status === 200);
  const fee = await jreq('GET', '/trading/portfolio', null, ownerTok);
  check('frais appliqués (0,5 %)', fee.data.fee_percent === 0.5);

  const delUser = await jreq('DELETE', `/admin/users/${aliceId}`, null, ownerTok);
  check('suppression de compte par le propriétaire', delUser.status === 200);
  const ownerSelfDel = await jreq('DELETE', `/admin/users/${owner.data.user.id}`, null, ownerTok);
  check('propriétaire non supprimable', ownerSelfDel.status === 403);

  console.log('\n== Déconnexion / sécurité ==');
  const lo = await jreq('POST', '/auth/logout', null, ownerTok);
  check('déconnexion OK', lo.status === 200);
  const front = await fetch('http://localhost:3777/');
  const html = await front.text();
  check('page d\'accueil servie', html.includes('Buxcoin') && html.includes('manifest'));
  const manifest = await fetch('http://localhost:3777/manifest.webmanifest');
  check('manifest PWA servi', manifest.status === 200);
  const sw = await fetch('http://localhost:3777/sw.js');
  check('service worker servi', sw.status === 200);
  const csp = front.headers.get('content-security-policy');
  check('CSP stricte', !!csp && csp.includes("default-src 'self'"));

  server.kill('SIGTERM');
  await wait(500);
  cleanup();
  console.log(failures === 0 ? '\n✅ TOUS LES TESTS PASSENT' : `\n❌ ${failures} test(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
