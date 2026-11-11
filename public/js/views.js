const Views = {};

Views.esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
Views.money = (v, d = 2) => (v ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' $';
Views.pct = (v) => (v >= 0 ? '+' : '') + (v ?? 0).toFixed(2) + ' %';
Views.pctClass = (v) => v >= 0 ? 'pos' : 'neg';
Views.date = (ts) => new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
Views.datetime = (ts) => new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
Views.kindIcon = { crypto: '🪙', stock: '🏢', commodity: '🥇' };
Views.kindLabel = { crypto: 'Cryptomonnaie', stock: 'Action', commodity: 'Matière première' };

Views.assetCell = (a) => `
  <div style="display:flex;align-items:center;gap:10px">
    <div class="asset-icon">${Views.esc(a.symbol).slice(0, 4)}</div>
    <div>
      <div style="font-weight:700">${Views.esc(a.name)}</div>
      <div class="small muted">${Views.esc(a.symbol)} · ${Views.kindIcon[a.kind] || ''} ${Views.kindLabel[a.kind] || a.kind}</div>
    </div>
  </div>`;

/* ================= AUTH ================= */

Views.authShell = (inner) => `
  <div class="auth-wrap">
    <div class="auth-card">
      <div class="auth-logo">
        <img src="/icons/icon-192.png" alt="Buxcoin">
        <h1>Buxcoin</h1>
        <div class="small muted">Simulateur de trading · argent 100% fictif</div>
      </div>
      ${inner}
    </div>
    <div class="small muted" style="max-width:400px;text-align:center">
      Buxcoin est un simulateur pédagogique. Aucun argent bancaire n'est engagé, jamais.
    </div>
  </div>`;

Views.login = () => Views.authShell(`
  <form id="login-form">
    <label for="li-email">Email</label>
    <input id="li-email" type="email" autocomplete="email" required>
    <label for="li-pass">Mot de passe</label>
    <input id="li-pass" type="password" autocomplete="current-password" required>
    <div id="li-error" class="error-box"></div>
    <button class="btn btn-block mt" type="submit">Se connecter</button>
  </form>
  <div class="auth-links">
    <a href="#/forgot">Mot de passe oublié ?</a> · <a href="#/register">Créer un compte</a>
  </div>`);

Views.bindLogin = () => {
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('li-error');
    errBox.classList.remove('show');
    try {
      const data = await API.post('/auth/login', {
        email: document.getElementById('li-email').value.trim(),
        password: document.getElementById('li-pass').value
      });
      API.setToken(data.token);
      App.onAuthed(data.user);
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.add('show');
    }
  });
};

Views.register = () => Views.authShell(`
  <form id="reg-form">
    <label for="rg-user">Nom d'utilisateur</label>
    <input id="rg-user" autocomplete="username" required maxlength="24" placeholder="ex : alex_trader">
    <label for="rg-email">Email</label>
    <input id="rg-email" type="email" autocomplete="email" required>
    <label for="rg-pass">Mot de passe (10 caractères min., lettres + chiffres)</label>
    <input id="rg-pass" type="password" autocomplete="new-password" required minlength="10">
    <div id="rg-error" class="error-box"></div>
    <button class="btn btn-block mt" type="submit">Créer mon compte</button>
  </form>
  <div class="info-box">🎁 Un solde virtuel de départ est crédité automatiquement. Aucune carte bancaire, jamais.</div>
  <div class="auth-links"><a href="#/login">J'ai déjà un compte</a></div>`);

Views.bindRegister = () => {
  document.getElementById('reg-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('rg-error');
    errBox.classList.remove('show');
    try {
      const data = await API.post('/auth/register', {
        username: document.getElementById('rg-user').value.trim(),
        email: document.getElementById('rg-email').value.trim(),
        password: document.getElementById('rg-pass').value
      });
      API.setToken(data.token);
      App.onAuthed(data.user);
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.add('show');
    }
  });
};

Views.forgot = () => Views.authShell(`
  <form id="fg-form">
    <label for="fg-email">Email du compte</label>
    <input id="fg-email" type="email" required>
    <div id="fg-result" class="info-box" style="display:none"></div>
    <div id="fg-error" class="error-box"></div>
    <button class="btn btn-block mt" type="submit">Recevoir un lien de réinitialisation</button>
  </form>
  <div class="auth-links"><a href="#/login">Retour à la connexion</a></div>`);

Views.bindForgot = () => {
  document.getElementById('fg-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('fg-error');
    const resBox = document.getElementById('fg-result');
    errBox.classList.remove('show');
    try {
      const data = await API.post('/auth/forgot-password', { email: document.getElementById('fg-email').value.trim() });
      if (data.reset_token) {
        resBox.innerHTML = `Jeton généré (mode simulateur) :<br><b style="word-break:break-all">${Views.esc(data.reset_token)}</b><br><br><a href="#/reset?token=${encodeURIComponent(data.reset_token)}" style="color:var(--accent)">Continuer → définir un nouveau mot de passe</a>`;
      } else {
        resBox.textContent = data.message;
      }
      resBox.style.display = 'block';
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.add('show');
    }
  });
};

Views.reset = (params) => Views.authShell(`
  <form id="rs-form">
    <label for="rs-token">Jeton de réinitialisation</label>
    <input id="rs-token" value="${Views.esc(params.get('token') || '')}" required>
    <label for="rs-pass">Nouveau mot de passe</label>
    <input id="rs-pass" type="password" required minlength="10">
    <div id="rs-error" class="error-box"></div>
    <button class="btn btn-block mt" type="submit">Définir le nouveau mot de passe</button>
  </form>
  <div class="auth-links"><a href="#/login">Retour à la connexion</a></div>`);

Views.bindReset = () => {
  document.getElementById('rs-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('rs-error');
    errBox.classList.remove('show');
    try {
      await API.post('/auth/reset-password', {
        token: document.getElementById('rs-token').value.trim(),
        password: document.getElementById('rs-pass').value
      });
      App.toast('Mot de passe modifié. Connectez-vous.', 'success');
      location.hash = '#/login';
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.add('show');
    }
  });
};

Views.setupOwner = () => Views.authShell(`
  <form id="so-form">
    <div class="info-box" style="display:block;margin:0 0 6px">
      Écran de configuration sécurisée du <b>propriétaire</b>. Le jeton se trouve dans
      <code>data/OWNER_SETUP_TOKEN.txt</code> sur le serveur (généré au premier démarrage).
    </div>
    <label for="so-token">Jeton de configuration</label>
    <input id="so-token" required>
    <label for="so-email">Email</label>
    <input id="so-email" type="email" required>
    <label for="so-user">Nom d'utilisateur</label>
    <input id="so-user" required maxlength="24">
    <label for="so-pass">Mot de passe (10+ caractères, lettres + chiffres)</label>
    <input id="so-pass" type="password" required minlength="10">
    <div id="so-error" class="error-box"></div>
    <button class="btn btn-block mt" type="submit">Créer le compte propriétaire</button>
  </form>
  <div class="auth-links"><a href="#/login">Retour à la connexion</a></div>`);

Views.bindSetupOwner = () => {
  document.getElementById('so-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('so-error');
    errBox.classList.remove('show');
    try {
      const data = await API.post('/setup/owner', {
        token: document.getElementById('so-token').value.trim(),
        email: document.getElementById('so-email').value.trim(),
        username: document.getElementById('so-user').value.trim(),
        password: document.getElementById('so-pass').value
      });
      API.setToken(data.token);
      App.toast('Propriétaire configuré avec succès 🎉', 'success');
      App.onAuthed(data.user);
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.add('show');
    }
  });
};

/* ================= DASHBOARD ================= */

Views.dashboard = () => `
  <div id="install-slot"></div>
  <div class="page-head">
    <div>
      <h1>Bonjour, ${Views.esc(App.user.username)} 👋</h1>
      <div class="subtitle">Vue générale de votre portefeuille virtuel et des marchés.</div>
    </div>
    ${(App.user.role === 'admin' || App.user.role === 'owner') ? '<button class="btn btn-green" id="dash-topup">＋ Recharger mon solde</button>' : ''}
  </div>
  <div class="grid grid-4" id="dash-stats"></div>
  <div class="grid grid-main mt">
    <div class="card">
      <div class="flex-between">
        <h2 class="mb0">Évolution du portefeuille</h2>
        <span class="badge badge-accent">simulation</span>
      </div>
      <div class="chart-wrap mt"><canvas id="dash-chart" data-h="240"></canvas></div>
    </div>
    <div>
      <div class="card">
        <h2>Marchés en direct</h2>
        <div id="dash-markets"></div>
      </div>
      <div class="card">
        <h2>🤖 Analyse IA du jour</h2>
        <div id="dash-ai" class="small muted">Chargement…</div>
      </div>
    </div>
  </div>`;

Views.bindDashboard = async () => {
  App.renderInstallBanner(document.getElementById('install-slot'));
  const topupBtn = document.getElementById('dash-topup');
  if (topupBtn) topupBtn.addEventListener('click', () => {
    App.modal(`
      <h3>Recharger mon solde</h3>
      <div class="small muted">Argent 100% fictif — crédité immédiatement sur votre compte.</div>
      <label>Montant ($ virtuels)</label>
      <input id="tu-amount" type="number" step="1" min="1" value="1000">
      <div class="modal-actions">
        <button class="btn btn-ghost" id="mm-cancel">Annuler</button>
        <button class="btn btn-green" id="mm-add">Recharger</button>
      </div>`, async () => {
      const amount = parseFloat(document.getElementById('tu-amount').value);
      if (!(amount > 0)) return App.toast('Montant invalide.', 'error');
      try {
        await API.post(`/admin/users/${App.user.id}/money`, { operation: 'add', amount, note: 'recharge personnelle' });
        App.toast(`${Views.money(amount)} ajoutés à votre solde ✅`, 'success');
        App.closeModal();
        App.route();
      } catch (e) { App.handleError(e); }
    });
  });
  try {
    const [pf, assets, overview] = await Promise.all([
      App.cachedOr('dash_pf', () => API.get('/trading/portfolio'), 15000),
      App.cachedOr('dash_assets', () => API.get('/markets/assets'), 15000),
      App.cachedOr('dash_overview', () => API.get('/ai/market-overview'), 60000)
    ]);
    const p = pf.portfolio;
    const perf = p.total - 10000;
    const perfPct = (perf / 10000) * 100;
    document.getElementById('dash-stats').innerHTML = `
      <div class="card"><div class="stat-label">Solde disponible</div><div class="stat-value">${Views.money(p.cash)}</div><div class="stat-sub">argent virtuel</div></div>
      <div class="card"><div class="stat-label">Valeur investie</div><div class="stat-value">${Views.money(p.invested)}</div><div class="stat-sub">${p.positions.length} position(s)</div></div>
      <div class="card"><div class="stat-label">Total du portefeuille</div><div class="stat-value">${Views.money(p.total)}</div><div class="stat-sub">départ : 10 000 $</div></div>
      <div class="card"><div class="stat-label">Performance</div><div class="stat-value ${Views.pctClass(perf)}">${Views.pct(perfPct)}</div><div class="stat-sub ${Views.pctClass(perf)}">${perf >= 0 ? '+' : ''}${Views.money(perf)}</div></div>`;

    const top = assets.assets.slice().sort((a, b) => Math.abs(b.change_percent) - Math.abs(a.change_percent)).slice(0, 6);
    document.getElementById('dash-markets').innerHTML = top.map(a => `
      <div class="clickable" style="display:flex;justify-content:space-between;align-items:center;padding:9px 2px;border-bottom:1px solid var(--border)" data-goto="#/market/${a.symbol}">
        <div><b>${Views.esc(a.symbol)}</b> <span class="small muted">${Views.esc(a.name)}</span></div>
        <div style="text-align:right"><div>${Views.money(a.price, a.price < 10 ? 3 : 2)}</div>
        <div class="small ${Views.pctClass(a.change_percent)}">${Views.pct(a.change_percent)}</div></div>
      </div>`).join('');
    document.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', () => location.hash = el.dataset.goto));

    const sentiment = overview.sentiment;
    const btc = overview.assets.find(a => a.symbol === 'BTC');
    document.getElementById('dash-ai').innerHTML = `
      Sentiment global des marchés : <b class="pos">${sentiment.bullish} haussiers</b> ·
      <b class="neg">${sentiment.bearish} baissiers</b> · <b>${sentiment.neutral} neutres</b><br><br>
      ${btc ? `Bitcoin : tendance <b>${Views.esc(btc.trend)}</b>, risque <b>${Views.esc(btc.risk_level)}</b>, RSI ${btc.rsi ? btc.rsi.toFixed(0) : 'n/d'}.` : ''}
      <div class="mt"><a href="#/assistant" style="color:var(--accent);font-weight:700;text-decoration:none">Ouvrir l'assistant IA →</a></div>`;

    const days = await App.cachedOr('dash_hist', () => API.get('/markets/assets/BTC/history?days=45'), 60000);
    Charts.line(document.getElementById('dash-chart'), days.history.map(h => h.close));

    const loadLive = async () => {
      const [pf2, assets2] = await Promise.all([
        API.get('/trading/portfolio'),
        API.get('/markets/assets')
      ]);
      const p2 = pf2.portfolio;
      const perf2 = p2.total - 10000;
      document.getElementById('dash-stats').innerHTML = `
        <div class="card"><div class="stat-label">Solde disponible</div><div class="stat-value">${Views.money(p2.cash)}</div><div class="stat-sub">argent virtuel</div></div>
        <div class="card"><div class="stat-label">Valeur investie</div><div class="stat-value">${Views.money(p2.invested)}</div><div class="stat-sub">${p2.positions.length} position(s)</div></div>
        <div class="card"><div class="stat-label">Total du portefeuille</div><div class="stat-value">${Views.money(p2.total)}</div><div class="stat-sub">d\u00e9part : 10 000 $</div></div>
        <div class="card"><div class="stat-label">Performance</div><div class="stat-value ${Views.pctClass(perf2)}">${Views.pct((perf2 / 10000) * 100)}</div><div class="stat-sub ${Views.pctClass(perf2)}">${perf2 >= 0 ? '+' : ''}${Views.money(perf2)}</div></div>`;
      const top2 = assets2.assets.slice().sort((a, b) => Math.abs(b.change_percent) - Math.abs(a.change_percent)).slice(0, 6);
      document.getElementById('dash-markets').innerHTML = top2.map(a => `
        <div class="clickable" style="display:flex;justify-content:space-between;align-items:center;padding:9px 2px;border-bottom:1px solid var(--border)" data-goto="#/market/${a.symbol}">
          <div><b>${Views.esc(a.symbol)}</b> <span class="small muted">${Views.esc(a.name)}</span></div>
          <div style="text-align:right"><div>${Views.money(a.price, a.price < 10 ? 3 : 2)}</div>
          <div class="small ${Views.pctClass(a.change_percent)}">${Views.pct(a.change_percent)}</div></div>
        </div>`).join('');
      document.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', () => location.hash = el.dataset.goto));
    };
    App.registerPoller(loadLive, 5000);
  } catch (e) {
    App.handleError(e);
  }
};

/* ================= MARKETS ================= */

Views.markets = () => `
  <div class="page-head">
    <div><h1>Marchés financiers</h1>
    <div class="subtitle">Cours actualisés automatiquement · prix pouvant s'appuyer sur les marchés réels (simulation).</div></div>
  </div>
  <div class="card">
    <div class="chart-toolbar" id="kind-filter">
      <button class="chip active" data-kind="">Tous</button>
      <button class="chip" data-kind="crypto">🪙 Cryptomonnaies</button>
      <button class="chip" data-kind="stock">🏢 Actions</button>
      <button class="chip" data-kind="commodity">🥇 Matières premières</button>
      <input id="market-search" placeholder="Rechercher (Bitcoin, Apple…)" style="flex:1;min-width:160px;max-width:280px">
    </div>
    <div class="market-list mt" id="markets-list"></div>
  </div>`;

Views.bindMarkets = async () => {
  let all = [];
  let filter = '';
  const prev = {};
  const search = document.getElementById('market-search');
  const render = () => {
    const q = (search.value || '').toLowerCase();
    const rows = all.filter(a => (!filter || a.kind === filter) &&
      (a.name.toLowerCase().includes(q) || a.symbol.toLowerCase().includes(q)));
    document.getElementById('markets-list').innerHTML = rows.map(a => {
      const old = prev[a.symbol];
      const flash = old !== undefined && a.price !== old ? (a.price > old ? ' flash-up' : ' flash-down') : '';
      prev[a.symbol] = a.price;
      return `
      <div class="market-row${flash}" data-sym="${a.symbol}">
        <div class="market-ico">${Views.esc(a.symbol).slice(0, 4)}</div>
        <div class="market-info">
          <div class="market-name">${Views.esc(a.name)}${a.watched ? ' <span style="color:var(--accent)">★</span>' : ''}</div>
          <div class="market-sub">${Views.esc(a.symbol)} · ${Views.kindLabel[a.kind] || a.kind}</div>
        </div>
        <div class="market-spark"><canvas class="spark" data-h="34" data-sym="${a.symbol}"></canvas></div>
        <div class="market-price">
          <div class="p">${Views.money(a.price, a.price < 10 ? 3 : 2)}</div>
          <div class="c price-pill ${a.change_percent >= 0 ? 'up' : 'down'}">${Views.pct(a.change_percent)}</div>
        </div>
      </div>`;
    }).join('') || '<div class="empty-state">Aucun actif trouvé.</div>';
    document.querySelectorAll('#markets-list .market-row').forEach(row =>
      row.addEventListener('click', () => location.hash = '#/market/' + row.dataset.sym));
    document.querySelectorAll('#markets-list canvas.spark').forEach(cv => {
      const a = rows.find(x => x.symbol === cv.dataset.sym);
      if (a && a.spark && a.spark.length > 2) {
        Charts.line(cv, a.spark, { color: a.change_percent >= 0 ? '#2ecc71' : '#ff5c5c' });
      }
    });
  };
  document.querySelectorAll('#kind-filter .chip').forEach(chip => chip.addEventListener('click', () => {
    document.querySelectorAll('#kind-filter .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    filter = chip.dataset.kind;
    render();
  }));
  search.addEventListener('input', render);
  const cached = App.cacheGet('markets', 120000);
  if (cached) { all = cached; render(); }
  const load = async () => {
    const data = await API.get('/markets/assets');
    all = data.assets;
    App.cacheSet('markets', all);
    render();
  };
  await load();
  App.registerPoller(load, 5000);
};

/* ================= MARKET DETAIL ================= */

Views.marketDetail = (symbol) => `
  <div id="md-head">Chargement…</div>
  <div class="grid grid-main mt">
    <div>
      <div class="card">
        <div class="chart-toolbar" id="md-intervals">
          <button class="chip" data-iv="5m">5 min</button>
          <button class="chip active" data-iv="1h">1 heure</button>
          <button class="chip" data-iv="1d">1 jour</button>
          <span style="flex:1"></span>
          <button class="chip" id="md-sma-toggle">SMA 20/50</button>
        </div>
        <div class="chart-wrap"><canvas id="md-chart" data-h="300"></canvas></div>
        <div class="chart-hint">Glissez pour naviguer · pincez (ou molette) pour zoomer</div>
        <div class="chart-wrap mt"><canvas id="md-rsi" data-h="90"></canvas></div>
        <div class="chart-wrap mt"><canvas id="md-macd" data-h="90"></canvas></div>
      </div>
      <div class="card">
        <h2>Signaux techniques</h2>
        <div id="md-signals"><div class="spinner"></div></div>
      </div>
    </div>
    <div>
      <div class="card">
        <h2>Passer un ordre <span class="small muted">(fictif)</span></h2>
        <div class="chart-toolbar">
          <button class="chip active" id="side-buy" style="color:var(--green)">Achat</button>
          <button class="chip" id="side-sell" style="color:var(--red)">Vente</button>
        </div>
        <label>Type d'ordre</label>
        <select id="ord-type">
          <option value="market">Market — exécution immédiate</option>
          <option value="limit">Limit — à un prix cible</option>
          <option value="stop_loss">Stop-Loss — vente automatique</option>
        </select>
        <div id="ord-limit-field" style="display:none">
          <label>Prix limite ($)</label><input id="ord-limit" type="number" step="any" min="0">
        </div>
        <div id="ord-stop-field" style="display:none">
          <label>Prix de déclenchement ($)</label><input id="ord-stop" type="number" step="any" min="0">
        </div>
        <label>Quantité</label>
        <input id="ord-qty" type="number" step="any" min="0" placeholder="0.00">
        <div class="small muted mt" id="ord-estimate"></div>
        <div class="field-row mt">
          <button class="btn btn-green" id="ord-submit">Confirmer</button>
          <button class="btn btn-ghost" id="ord-watch">★ Suivre</button>
        </div>
        <div class="small muted mt">Frais de simulation : <span id="ord-fee">0,2</span> % · Argent 100% fictif.</div>
      </div>
      <div class="card">
        <h2>Positions sur cet actif</h2>
        <div id="md-position" class="small muted">Chargement…</div>
      </div>
    </div>
  </div>`;

Views.bindMarketDetail = async (symbol) => {
  let interval = '1h';
  let showSma = true;
  let side = 'buy';
  let asset = null;
  let candles = [];
  let analysis = null;
  let prevPrice = null;
  const group = Charts.createGroup();

  const head = document.getElementById('md-head');
  const loadHead = async () => {
    const data = await API.get('/markets/assets/' + symbol);
    asset = data.asset;
    head.innerHTML = `
      <div class="card">
        <div class="flex-between">
          <div class="asset-head">
            <div class="asset-icon">${Views.esc(asset.symbol).slice(0, 4)}</div>
            <div>
              <h1 style="margin:0">${Views.esc(asset.name)}</h1>
              <div class="small muted">${Views.esc(asset.symbol)} · ${Views.kindLabel[asset.kind] || asset.kind} ${asset.watched ? '· ★ suivi' : ''}</div>
            </div>
          </div>
          <div style="text-align:right">
            <div class="asset-price">${Views.money(asset.price, asset.price < 10 ? 3 : 2)}</div>
            <div class="${Views.pctClass(asset.change_percent)}" style="font-weight:700">${Views.pct(asset.change_percent)} (24h)</div>
          </div>
        </div>
      </div>`;
    const watchBtn = document.getElementById('ord-watch');
    if (watchBtn) watchBtn.textContent = asset.watched ? '★ Suivi ✓' : '★ Suivre';
    const priceEl = head.querySelector('.asset-price');
    if (priceEl && prevPrice !== null && asset.price !== prevPrice) {
      priceEl.classList.add(asset.price > prevPrice ? 'flash-up' : 'flash-down');
    }
    prevPrice = asset.price;
  };

  const loadCandles = async () => {
    const cached = App.cacheGet(`candles_${symbol}_${interval}`, 30000);
    if (cached) { candles = cached; drawCharts(); }
    const data = await API.get(`/markets/assets/${symbol}/candles?interval=${interval}&limit=180`);
    candles = data.candles;
    App.cacheSet(`candles_${symbol}_${interval}`, candles);
    drawCharts();
  };

  const drawCharts = () => {
    Charts.candles(document.getElementById('md-chart'), candles, {
      sma: showSma ? [[20, '#4da3ff'], [50, '#a78bfa']] : null,
      group,
      interval
    });
    if (analysis && analysis.indicators.rsi_series) {
      Charts.panel(document.getElementById('md-rsi'), analysis.indicators.rsi_series.slice(-candles.length), {
        title: 'RSI (14)', color: '#a78bfa', midline: 50, group
      });
    }
    if (analysis && analysis.indicators.macd && analysis.indicators.macd.series) {
      Charts.panel(document.getElementById('md-macd'), analysis.indicators.macd.series.hist.slice(-candles.length), {
        title: 'MACD (12,26,9)', color: '#4da3ff', midline: 0, group
      });
    }
  };

  const loadAnalysis = async () => {
    const data = await App.cachedOr('analysis_' + symbol, () => API.get('/markets/assets/' + symbol + '/analysis'), 30000);
    analysis = data.analysis;
    const toneClass = { bullish: 'var(--green)', bearish: 'var(--red)', neutral: 'var(--muted)' };
    document.getElementById('md-signals').innerHTML = `
      <div class="flex-between" style="margin-bottom:8px">
        <div>Tendance : <b>${Views.esc(analysis.trend)}</b></div>
        <div>Risque : <b>${Views.esc(analysis.risk.level)}</b> (${analysis.risk.score}/100)</div>
      </div>
      ${analysis.signals.map(s => `
        <div class="signal-row">
          <div class="signal-dot" style="background:${toneClass[s.tone]}"></div>
          <div><b>${Views.esc(s.name)} : ${Views.esc(s.value)}</b>
          <div class="small muted">${Views.esc(s.text)}</div></div>
        </div>`).join('')}
      <div class="info-box" style="display:block;margin-top:12px">💡 ${Views.esc(analysis.advice)}</div>`;
    drawCharts();
  };

  const loadPosition = async () => {
    const pf = await API.get('/trading/portfolio');
    const pos = pf.portfolio.positions.find(p => p.symbol === symbol);
    document.getElementById('md-position').innerHTML = pos ? `
      Quantité : <b>${pos.qty}</b> · prix moyen : <b>${Views.money(pos.avg_price)}</b><br>
      Valeur : <b>${Views.money(pos.value)}</b> · P&L : <b class="${Views.pctClass(pos.pnl)}">${(pos.pnl >= 0 ? '+' : '') + Views.money(pos.pnl)} (${Views.pct(pos.pnl_percent)})</b>
    ` : 'Aucune position sur cet actif.';
    document.getElementById('ord-fee').textContent = String(pf.fee_percent).replace('.', ',');
  };

  const updateEstimate = () => {
    const qty = parseFloat(document.getElementById('ord-qty').value) || 0;
    const type = document.getElementById('ord-type').value;
    const price = type === 'limit' ? (parseFloat(document.getElementById('ord-limit').value) || asset.price) :
      type === 'stop_loss' ? (parseFloat(document.getElementById('ord-stop').value) || asset.price) : asset.price;
    const est = qty * price;
    document.getElementById('ord-estimate').textContent = qty > 0 ?
      `Estimation : ${Views.money(est)} (≈ ${Views.money(est * 1.002)} frais inclus)` : '';
  };

  document.getElementById('ord-type').addEventListener('change', (e) => {
    const t = e.target.value;
    document.getElementById('ord-limit-field').style.display = t === 'limit' ? 'block' : 'none';
    document.getElementById('ord-stop-field').style.display = t === 'stop_loss' ? 'block' : 'none';
    if (t === 'stop_loss') {
      side = 'sell';
      document.getElementById('side-buy').classList.remove('active');
      document.getElementById('side-sell').classList.add('active');
    }
    updateEstimate();
  });
  document.getElementById('ord-qty').addEventListener('input', updateEstimate);
  document.getElementById('ord-limit').addEventListener('input', updateEstimate);
  document.getElementById('side-buy').addEventListener('click', () => {
    side = 'buy';
    document.getElementById('side-buy').classList.add('active');
    document.getElementById('side-sell').classList.remove('active');
  });
  document.getElementById('side-sell').addEventListener('click', () => {
    side = 'sell';
    document.getElementById('side-sell').classList.add('active');
    document.getElementById('side-buy').classList.remove('active');
  });
  document.getElementById('ord-submit').addEventListener('click', async () => {
    const type = document.getElementById('ord-type').value;
    const qty = parseFloat(document.getElementById('ord-qty').value);
    if (!(qty > 0)) return App.toast('Quantité invalide.', 'error');
    try {
      const body = { symbol, side, type, qty };
      if (type === 'limit') body.limit_price = parseFloat(document.getElementById('ord-limit').value);
      if (type === 'stop_loss') body.stop_price = parseFloat(document.getElementById('ord-stop').value);
      const r = await API.post('/trading/orders', body);
      App.toast(r.status === 'filled' ?
        `Ordre exécuté à ${Views.money(r.price)} ✅` : 'Ordre en attente : il sera exécuté quand le prix atteindra votre niveau ⏳', 'success');
      document.getElementById('ord-qty').value = '';
      loadPosition(); loadHead();
    } catch (e) { App.handleError(e); }
  });
  document.getElementById('ord-watch').addEventListener('click', async () => {
    try {
      if (asset.watched) { await API.del('/trading/watchlist/' + symbol); asset.watched = false; App.toast('Retiré de la liste de suivi.'); }
      else { await API.post('/trading/watchlist/' + symbol); asset.watched = true; App.toast('Ajouté à la liste de suivi ★', 'success'); }
      loadHead();
    } catch (e) { App.handleError(e); }
  });
  document.getElementById('md-sma-toggle').addEventListener('click', (e) => {
    showSma = !showSma;
    e.target.classList.toggle('active', showSma);
    drawCharts();
  });
  document.querySelectorAll('#md-intervals .chip[data-iv]').forEach(chip => chip.addEventListener('click', () => {
    document.querySelectorAll('#md-intervals .chip[data-iv]').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    interval = chip.dataset.iv;
    loadCandles();
  }));

  const refreshAll = async () => { await Promise.all([loadHead(), loadCandles(), loadPosition()]); };
  await refreshAll();
  loadAnalysis().catch(e => App.handleError(e));
  App.registerPoller(refreshAll, 5000);
};

/* ================= PORTFOLIO ================= */

Views.portfolio = () => `
  <div class="page-head"><div><h1>Portefeuille</h1>
  <div class="subtitle">Vos positions, votre allocation et votre performance — 100% virtuel.</div></div></div>
  <div class="grid grid-3" id="pf-stats"></div>
  <div class="grid grid-main mt">
    <div class="card">
      <h2>Positions ouvertes</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Actif</th><th>Quantité</th><th>PRU</th><th>Cours</th><th>Valeur</th><th>P&L</th></tr></thead>
        <tbody id="pf-positions"></tbody>
      </table></div>
    </div>
    <div class="card">
      <h2>Allocation</h2>
      <div class="chart-wrap"><canvas id="pf-donut" data-h="220"></canvas></div>
      <div id="pf-legend" class="small mt"></div>
    </div>
  </div>
  <div class="card">
    <h2>Statistiques de performance</h2>
    <div id="pf-stats-detail" class="small muted">Chargement…</div>
  </div>`;

Views.bindPortfolio = async () => {
  const load = async () => {
    const [pf, stats] = await Promise.all([API.get('/trading/portfolio'), API.get('/trading/stats')]);
    const p = pf.portfolio;
    const perf = p.total - 10000;
    document.getElementById('pf-stats').innerHTML = `
      <div class="card"><div class="stat-label">Cash disponible</div><div class="stat-value">${Views.money(p.cash)}</div></div>
      <div class="card"><div class="stat-label">Valeur investie</div><div class="stat-value">${Views.money(p.invested)}</div></div>
      <div class="card"><div class="stat-label">P&L latent</div><div class="stat-value ${Views.pctClass(perf)}">${(perf >= 0 ? '+' : '') + Views.money(perf)}</div><div class="stat-sub">${Views.pct((perf / 10000) * 100)} depuis le départ</div></div>`;
    document.getElementById('pf-positions').innerHTML = p.positions.map(pos => `
      <tr class="clickable" data-sym="${pos.symbol}">
        <td><b>${Views.esc(pos.symbol)}</b> <span class="small muted">${Views.esc(pos.name)}</span></td>
        <td>${pos.qty}</td>
        <td>${Views.money(pos.avg_price)}</td>
        <td>${Views.money(pos.price)}</td>
        <td>${Views.money(pos.value)}</td>
        <td class="${Views.pctClass(pos.pnl)}">${(pos.pnl >= 0 ? '+' : '') + Views.money(pos.pnl)}<div class="small">${Views.pct(pos.pnl_percent)}</div></td>
      </tr>`).join('') || '<tr><td colspan="6" class="empty-state">Aucune position. Passez votre premier ordre depuis les Marchés !</td></tr>';
    document.querySelectorAll('#pf-positions tr[data-sym]').forEach(tr =>
      tr.addEventListener('click', () => location.hash = '#/market/' + tr.dataset.sym));
    const items = p.positions.map(pos => ({ label: pos.symbol, value: pos.value }));
    if (p.cash > 0) items.push({ label: 'Cash', value: p.cash });
    Charts.donut(document.getElementById('pf-donut'), items);
    const colors = ['#ff9e1b', '#4da3ff', '#2ecc71', '#ff5c5c', '#a78bfa', '#f472b6', '#34d399', '#fbbf24'];
    document.getElementById('pf-legend').innerHTML = items.map((it, i) =>
      `<span style="margin-right:12px"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${colors[i % colors.length]};margin-right:5px"></span>${Views.esc(it.label)} · ${Views.money(it.value)}</span>`).join('');
    const s = stats.stats;
    document.getElementById('pf-stats-detail').innerHTML = `
      <div class="grid grid-4">
        <div><div class="stat-label">Transactions</div><div class="stat-value" style="font-size:18px">${s.total_trades}</div></div>
        <div><div class="stat-label">Taux de réussite</div><div class="stat-value" style="font-size:18px">${s.win_rate === null ? 'n/d' : s.win_rate.toFixed(0) + ' %'}</div><div class="stat-sub">${s.wins} gagnantes / ${s.losses} perdantes</div></div>
        <div><div class="stat-label">Volume échangé</div><div class="stat-value" style="font-size:18px">${Views.money(s.volume, 0)}</div></div>
        <div><div class="stat-label">Performance globale</div><div class="stat-value ${Views.pctClass(s.performance_percent)}" style="font-size:18px">${Views.pct(s.performance_percent)}</div></div>
      </div>`;
  };
  await load();
  App.registerPoller(load, 8000);
};

/* ================= ORDERS ================= */

Views.orders = () => `
  <div class="page-head"><div><h1>Ordres</h1>
  <div class="subtitle">Ordres en attente (Market, Limit, Stop-Loss) et historique d'exécution.</div></div></div>
  <div class="tabs">
    <button class="tab active" data-tab="open">En attente</button>
    <button class="tab" data-tab="history">Historique</button>
  </div>
  <div id="orders-open" class="card">
    <h2>Ordres en attente</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Actif</th><th>Sens</th><th>Type</th><th>Quantité</th><th>Seuil</th><th></th></tr></thead>
      <tbody id="open-body"></tbody>
    </table></div>
  </div>
  <div id="orders-history" class="card" style="display:none">
    <h2>Historique des ordres</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Actif</th><th>Sens</th><th>Type</th><th>Quantité</th><th>Prix d'exécution</th><th>Statut</th></tr></thead>
      <tbody id="hist-body"></tbody>
    </table></div>
  </div>`;

Views.bindOrders = async () => {
  document.querySelectorAll('.tabs .tab').forEach(tab => tab.addEventListener('click', () => {
    document.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('orders-open').style.display = tab.dataset.tab === 'open' ? 'block' : 'none';
    document.getElementById('orders-history').style.display = tab.dataset.tab === 'history' ? 'block' : 'none';
  }));
  const sideBadge = (s) => s === 'buy' ? '<span class="badge badge-green">Achat</span>' : '<span class="badge badge-red">Vente</span>';
  const typeLabel = { market: 'Market', limit: 'Limit', stop_loss: 'Stop-Loss' };
  const load = async () => {
    const [open, hist] = await Promise.all([API.get('/trading/orders/open'), API.get('/trading/orders/history')]);
    document.getElementById('open-body').innerHTML = open.orders.map(o => `
      <tr>
        <td>${Views.datetime(o.created_at)}</td>
        <td class="clickable" data-sym="${o.symbol}"><b>${Views.esc(o.symbol)}</b></td>
        <td>${sideBadge(o.side)}</td>
        <td>${typeLabel[o.type]}</td>
        <td>${o.qty}</td>
        <td>${o.limit_price ? Views.money(o.limit_price) : o.stop_price ? Views.money(o.stop_price) : '—'}</td>
        <td><button class="btn btn-ghost btn-sm" data-cancel="${o.id}">Annuler</button></td>
      </tr>`).join('') || '<tr><td colspan="7" class="empty-state">Aucun ordre en attente.</td></tr>';
    document.getElementById('hist-body').innerHTML = hist.orders.map(o => `
      <tr>
        <td>${Views.datetime(o.filled_at || o.created_at)}</td>
        <td><b>${Views.esc(o.symbol)}</b></td>
        <td>${sideBadge(o.side)}</td>
        <td>${typeLabel[o.type]}</td>
        <td>${o.qty}</td>
        <td>${o.filled_price ? Views.money(o.filled_price) : '—'}</td>
        <td>${o.status === 'filled' ? '<span class="badge badge-green">Exécuté</span>' : o.status === 'cancelled' ? '<span class="badge badge-neutral">Annulé</span>' : '<span class="badge badge-red">Rejeté</span>'}</td>
      </tr>`).join('') || '<tr><td colspan="7" class="empty-state">Aucun ordre dans l\'historique.</td></tr>';
    document.querySelectorAll('#open-body [data-cancel]').forEach(btn => btn.addEventListener('click', async () => {
      try { await API.del('/trading/orders/' + btn.dataset.cancel); App.toast('Ordre annulé.'); load(); }
      catch (e) { App.handleError(e); }
    }));
    document.querySelectorAll('#open-body [data-sym]').forEach(td =>
      td.addEventListener('click', () => location.hash = '#/market/' + td.dataset.sym));
  };
  await load();
  App.registerPoller(load, 8000);
};

/* ================= HISTORY ================= */

Views.history = () => `
  <div class="page-head"><div><h1>Historique des transactions</h1>
  <div class="subtitle">Tous vos mouvements : trades, bonus, opérations administrateur.</div></div></div>
  <div class="card"><div class="table-wrap"><table>
    <thead><tr><th>Date</th><th>Type</th><th>Détail</th><th>Montant</th><th>Solde après</th></tr></thead>
    <tbody id="tx-body"></tbody>
  </table></div></div>`;

Views.bindHistory = async () => {
  const kindBadge = {
    trade: '<span class="badge badge-blue">Trade</span>',
    bonus: '<span class="badge badge-accent">Bonus</span>',
    admin_credit: '<span class="badge badge-green">Crédit admin</span>',
    admin_debit: '<span class="badge badge-red">Débit admin</span>'
  };
  const load = async () => {
    const data = await API.get('/trading/transactions');
    document.getElementById('tx-body').innerHTML = data.transactions.map(t => `
      <tr>
        <td>${Views.datetime(t.created_at)}</td>
        <td>${kindBadge[t.kind] || Views.esc(t.kind)}</td>
        <td>${Views.esc(t.note || (t.side === 'buy' ? 'Achat ' : 'Vente ') + (t.qty || '') + ' ' + Views.esc(t.symbol || ''))}</td>
        <td class="${t.total < 0 ? 'neg' : 'pos'}" style="font-weight:700">${t.total ? (t.total > 0 ? '+' : '') + Views.money(t.total) : '—'}</td>
        <td>${t.balance_after !== null ? Views.money(t.balance_after) : '—'}</td>
      </tr>`).join('') || '<tr><td colspan="5" class="empty-state">Aucune transaction.</td></tr>';
  };
  await load();
  App.registerPoller(load, 30000);
};

/* ================= WATCHLIST ================= */

Views.watchlist = () => `
  <div class="page-head"><div><h1>Liste de suivi</h1>
  <div class="subtitle">Vos actifs favoris, suivis en direct.</div></div></div>
  <div class="card"><div class="table-wrap"><table>
    <thead><tr><th>Actif</th><th>Prix</th><th>24h</th><th></th></tr></thead>
    <tbody id="wl-body"></tbody>
  </table></div></div>`;

Views.bindWatchlist = async () => {
  const load = async () => {
    const data = await API.get('/trading/watchlist');
    document.getElementById('wl-body').innerHTML = data.assets.map(a => `
      <tr>
        <td class="clickable" data-sym="${a.symbol}">${Views.assetCell(a)}</td>
        <td style="font-weight:700">${Views.money(a.price, a.price < 10 ? 3 : 2)}</td>
        <td class="${Views.pctClass(a.change_percent)}">${Views.pct(a.change_percent)}</td>
        <td><button class="btn btn-ghost btn-sm" data-remove="${a.symbol}">Retirer</button></td>
      </tr>`).join('') || '<tr><td colspan="4" class="empty-state">Liste vide. Ajoutez des actifs avec le bouton ★ Suivre sur une fiche marché.</td></tr>';
    document.querySelectorAll('#wl-body [data-sym]').forEach(td =>
      td.addEventListener('click', () => location.hash = '#/market/' + td.dataset.sym));
    document.querySelectorAll('#wl-body [data-remove]').forEach(btn => btn.addEventListener('click', async () => {
      try { await API.del('/trading/watchlist/' + btn.dataset.remove); load(); }
      catch (e) { App.handleError(e); }
    }));
  };
  await load();
  App.registerPoller(load, 8000);
};

/* ================= ASSISTANT ================= */

Views.assistant = () => `
  <div class="page-head"><div><h1>Assistant IA</h1>
  <div class="subtitle">Analyse technique, tendances, risques et pédagogie — réponses générées localement.</div></div></div>
  <div class="card chat-box">
    <div class="chat-messages" id="chat-messages">
      <div class="chat-msg bot">Bonjour ${Views.esc(App.user.username)} 👋 Je suis l'assistant Buxcoin.
Essayez : « analyse BTC », « mon portefeuille », « qu'est-ce que le stop-loss ? »</div>
    </div>
    <div class="chat-suggest">
      <button class="chip" data-q="analyse BTC">📊 Analyse BTC</button>
      <button class="chip" data-q="analyse NVIDIA">📊 Analyse NVIDIA</button>
      <button class="chip" data-q="mon portefeuille">💼 Mon portefeuille</button>
      <button class="chip" data-q="qu'est-ce que le RSI ?">❓ Le RSI ?</button>
      <button class="chip" data-q="risque">🛡️ Gestion du risque</button>
    </div>
    <div class="chat-input">
      <input id="chat-input" placeholder="Posez votre question…" autocomplete="off">
      <button class="btn" id="chat-send">Envoyer</button>
    </div>
  </div>`;

Views.bindAssistant = () => {
  const box = document.getElementById('chat-messages');
  const input = document.getElementById('chat-input');
  const send = async () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    box.insertAdjacentHTML('beforeend', `<div class="chat-msg user">${Views.esc(text)}</div>`);
    box.scrollTop = box.scrollHeight;
    box.insertAdjacentHTML('beforeend', '<div class="chat-msg bot" id="chat-typing">⏳ Analyse en cours…</div>');
    box.scrollTop = box.scrollHeight;
    try {
      const data = await API.post('/ai/chat', { message: text });
      document.getElementById('chat-typing').remove();
      box.insertAdjacentHTML('beforeend', `<div class="chat-msg bot">${Views.esc(data.reply)}</div>`);
    } catch (e) {
      const t = document.getElementById('chat-typing');
      if (t) t.remove();
      box.insertAdjacentHTML('beforeend', `<div class="chat-msg bot">⚠️ ${Views.esc(e.message)}</div>`);
    }
    box.scrollTop = box.scrollHeight;
  };
  document.getElementById('chat-send').addEventListener('click', send);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  document.querySelectorAll('.chat-suggest .chip').forEach(chip =>
    chip.addEventListener('click', () => { input.value = chip.dataset.q; send(); }));
};

/* ================= CALENDAR ================= */

Views.calendar = () => `
  <div class="page-head"><div><h1>Calendrier des marchés</h1>
  <div class="subtitle">Événements susceptibles d'influencer les cours (simulation pédagogique).</div></div></div>
  <div class="card" id="cal-list"></div>`;

Views.bindCalendar = async () => {
  const catBadge = {
    economie: '<span class="badge badge-blue">Économie</span>',
    resultats: '<span class="badge badge-accent">Résultats</span>',
    crypto: '<span class="badge badge-green">Crypto</span>',
    autre: '<span class="badge badge-neutral">Autre</span>'
  };
  const data = await API.get('/markets/calendar');
  const today = new Date().toISOString().slice(0, 10);
  const events = data.events.slice().sort((a, b) => a.event_date.localeCompare(b.event_date));
  document.getElementById('cal-list').innerHTML = events.length === 0 ?
    '<div class="empty-state">Aucun événement programmé.</div>' :
    events.map(ev => `
      <div class="signal-row" style="${ev.event_date < today ? 'opacity:.45' : ''}">
        <div style="min-width:104px;text-align:center">
          <div style="font-weight:800">${new Date(ev.event_date + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</div>
          <div class="small muted">${new Date(ev.event_date + 'T00:00:00').getFullYear()}</div>
        </div>
        <div>
          <div style="font-weight:700">${Views.esc(ev.title)} ${catBadge[ev.category] || ''}</div>
          <div class="small muted">${Views.esc(ev.description || '')}</div>
        </div>
      </div>`).join('');
};

/* ================= SETTINGS ================= */

Views.settings = () => `
  <div class="page-head"><div><h1>Paramètres</h1>
  <div class="subtitle">Personnalisez l'application et sécurisez votre compte.</div></div></div>
  <div class="grid grid-2">
    <div class="card">
      <h2>Apparence</h2>
      <label>Thème</label>
      <select id="set-theme">
        <option value="dark">Sombre (par défaut)</option>
        <option value="light">Clair</option>
      </select>
      <h2 class="mt">Notifications</h2>
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
        <input type="checkbox" id="set-notif" style="width:auto"> Activer les notifications (ordres exécutés, alertes)
      </label>
      <button class="btn btn-secondary btn-sm mt" id="set-perm-notif">Autoriser les notifications système</button>
    </div>
    <div class="card">
      <h2>Sécurité du compte</h2>
      <label>Mot de passe actuel</label>
      <input type="password" id="pw-current" autocomplete="current-password">
      <label>Nouveau mot de passe (10+ caractères, lettres + chiffres)</label>
      <input type="password" id="pw-next" autocomplete="new-password">
      <button class="btn mt" id="pw-save">Modifier le mot de passe</button>
      <div class="info-box" style="display:block;margin-top:14px">
        🔒 Vos sessions restent actives sur vos autres appareils : reconnectez-vous après un changement de mot de passe.
        Mot de passe oublié ? <a href="#/forgot" style="color:var(--accent)">Réinitialiser</a>.
      </div>
    </div>
  </div>
  <div class="card">
    <h2>Application installable</h2>
    <div id="install-slot-2"></div>
    <div class="small muted">
      iPhone/iPad : bouton Partager → « Sur l'écran d'accueil ». Android : menu → « Installer l'application ».
      Ordinateur : icône d'installation dans la barre d'adresse.
    </div>
  </div>
  <div class="card">
    <h2>À propos</h2>
    <div class="small muted" id="set-about">Chargement…</div>
  </div>`;

Views.bindSettings = async () => {
  document.getElementById('set-theme').value = App.user.theme || 'dark';
  document.getElementById('set-notif').checked = !!App.user.notifications_enabled;
  document.getElementById('set-theme').addEventListener('change', async (e) => {
    const data = await API.patch('/auth/preferences', { theme: e.target.value });
    App.user = data.user;
    App.applyTheme();
  });
  document.getElementById('set-notif').addEventListener('change', async (e) => {
    const data = await API.patch('/auth/preferences', { notifications_enabled: e.target.checked });
    App.user = data.user;
  });
  document.getElementById('set-perm-notif').addEventListener('click', async () => {
    if (!('Notification' in window)) return App.toast('Notifications non supportées sur cet appareil.', 'error');
    const perm = await Notification.requestPermission();
    App.toast(perm === 'granted' ? 'Notifications système activées ✅' : 'Permission refusée.', perm === 'granted' ? 'success' : 'error');
  });
  document.getElementById('pw-save').addEventListener('click', async () => {
    try {
      await API.post('/auth/change-password', {
        current: document.getElementById('pw-current').value,
        next: document.getElementById('pw-next').value
      });
      App.toast('Mot de passe modifié. Reconnectez-vous.', 'success');
      App.logout();
    } catch (e) { App.handleError(e); }
  });
  App.renderInstallBanner(document.getElementById('install-slot-2'));
  const roleLabel = { owner: 'Propriétaire', admin: 'Administrateur', user: 'Utilisateur' };
  document.getElementById('set-about').innerHTML =
    `Buxcoin ${APP_VERSION} · simulateur — argent 100% fictif.<br>` +
    `Connecté : <b>${Views.esc(App.user.username)}</b> · rôle : <b>${roleLabel[App.user.role] || App.user.role}</b>.` +
    (App.user.role === 'user' ? '<br>Pour gérer les utilisateurs (argent, blocage, suppression), connectez-vous avec le compte propriétaire créé lors de la configuration du serveur.' : '');
};
