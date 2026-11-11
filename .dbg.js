const fs = require('fs');
const { JSDOM } = require('jsdom');
const read = f => fs.readFileSync('public/' + f, 'utf8');
const html = read('index.html').replace(/<script src="\/js\/[a-z]+\.js"><\/script>/g, '');
(async () => {
  const dom = new JSDOM(html, { url: 'http://localhost:3000/', runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  const mkCandles = n => Array.from({ length: n }, (_, i) => ({ ts: 1700000000000 + i * 3600000, open: 1 + i, high: 2 + i, low: 0.5 + i, close: 1.5 + i, volume: 100 + i }));
  const api = [
    ['/assets/BTC?', () => ({ asset: { symbol: 'BTC', name: 'Bitcoin', kind: 'crypto', price: 67500, change_percent: 1.2, watched: false } })],
    ['/candles', () => ({ candles: mkCandles(120) })],
    ['/analysis', () => ({ analysis: { trend: 't', risk: { score: 1, level: 'l' }, advice: 'a', signals: [], indicators: { rsi_series: [1,2], macd: { series: { hist: [1,2] } } } } })],
    ['/trading/portfolio', () => ({ portfolio: { cash: 1, invested: 1, total: 2, positions: [] }, fee_percent: 0.2 })],
    ['/trading/notifications', () => ({ unread: 0, notifications: [] })],
    ['/setup/status', () => ({ owner_configured: true })],
    ['/auth/me', () => ({ user: { id: 1, username: 'chef', email: 'd@d.io', role: 'owner', theme: 'dark', notifications_enabled: true } })]
  ];
  window.fetch = async (url) => {
    const u = String(url);
    const hit = api.find(([k]) => u.includes(k));
    if (hit) return { ok: true, status: 200, json: async () => hit[1](), headers: { get: () => 'application/json' } };
    console.log('FETCH 404:', u);
    return { ok: false, status: 404, json: async () => ({ error: 'nf ' + u }), headers: { get: () => 'application/json' } };
  };
  window.localStorage.setItem('bux_token', 'tok');
  window.console.error = (...a) => console.log('PAGE-ERR:', a.join(' '));
  const out = window.document.createElement('div');
  out.id = 'probe-out';
  window.document.body.appendChild(out);
  const inject = code => { const s = window.document.createElement('script'); s.textContent = code; window.document.body.appendChild(s); };
  for (const f of ['js/api.js', 'js/charts.js', 'js/views.js', 'js/admin.js', 'js/app.js']) inject(read(f));
  await new Promise(r => setTimeout(r, 700));
  inject(`location.hash = '#/market/BTC'`);
  await new Promise(r => setTimeout(r, 900));
  inject(`document.getElementById('probe-out').textContent = JSON.stringify({
    toasts: Array.from(document.querySelectorAll('.toast')).map(t => t.textContent),
    mdHead: document.getElementById('md-head').textContent.slice(0, 80),
    candlesLen: (typeof candles !== 'undefined') ? 'n/a' : 'n/a'
  })`);
  console.log(window.document.getElementById('probe-out').textContent);
})().catch(e => { console.error('DBG FAIL', e); process.exit(1); });
