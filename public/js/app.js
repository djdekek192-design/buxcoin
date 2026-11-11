const App = {
  user: null,
  pollers: [],
  deferredInstall: null,
  lastNotifCheck: 0,

  toast(message, kind = 'info') {
    const box = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + (kind === 'success' ? 'success' : kind === 'error' ? 'error' : '');
    el.textContent = message;
    box.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, 4200);
  },

  handleError(e) {
    if (e.status === 401) {
      App.logout(true);
      return;
    }
    App.toast(e.message || 'Erreur inattendue.', 'error');
  },

  modal(html, onConfirm, onConfirm2) {
    const root = document.getElementById('modal-root');
    root.innerHTML = `<div class="modal-backdrop"><div class="modal">${html}</div></div>`;
    root.querySelector('.modal-backdrop').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop')) App.closeModal();
    });
    const cancel = root.querySelector('#mm-cancel') || root.querySelector('#cf-cancel');
    if (cancel) cancel.addEventListener('click', App.closeModal);
    if (onConfirm) {
      const btn = root.querySelector('#mm-add') || root.querySelector('#cf-ok');
      if (btn) btn.addEventListener('click', onConfirm);
    }
    if (onConfirm2) {
      const btn = root.querySelector('#mm-remove');
      if (btn) btn.addEventListener('click', onConfirm2);
    }
  },

  closeModal() {
    document.getElementById('modal-root').innerHTML = '';
  },

  clearPollers() {
    App.pollers.forEach(clearInterval);
    App.pollers = [];
  },

  registerPoller(fn, ms) {
    App.pollers.push(setInterval(fn, ms));
  },

  applyTheme() {
    document.documentElement.setAttribute('data-theme', App.user && App.user.theme === 'light' ? 'light' : 'dark');
  },

  logout(silent) {
    API.setToken(null);
    App.user = null;
    App.clearPollers();
    if (!silent) App.toast('Vous êtes déconnecté.');
    location.hash = '#/login';
    App.route();
  },

  onAuthed(user) {
    App.user = user;
    App.applyTheme();
    App.startNotifWatcher();
    location.hash = '#/dashboard';
    App.route();
  },

  navItems() {
    const u = App.user;
    const items = [
      { hash: '#/dashboard', label: 'Tableau de bord', icon: '🏠' },
      { hash: '#/markets', label: 'Marchés', icon: '📈' },
      { hash: '#/portfolio', label: 'Portefeuille', icon: '💼' },
      { hash: '#/orders', label: 'Ordres', icon: '🧾' },
      { hash: '#/watchlist', label: 'Suivi', icon: '★' },
      { hash: '#/history', label: 'Historique', icon: '🕘' },
      { hash: '#/assistant', label: 'Assistant IA', icon: '🤖' },
      { hash: '#/calendar', label: 'Calendrier', icon: '📅' },
      { hash: '#/settings', label: 'Paramètres', icon: '⚙️' }
    ];
    if (u && (u.role === 'admin' || u.role === 'owner')) {
      items.push({ hash: '#/admin', label: 'Administration', icon: '🛡️' });
    }
    return items;
  },

  renderNav() {
    const nav = document.getElementById('nav');
    const bottom = document.getElementById('bottombar');
    const items = App.navItems();
    const current = location.hash.split('?')[0] || '#/dashboard';
    nav.innerHTML = items.map(it =>
      `<a href="${it.hash}" class="${current === it.hash ? 'active' : ''}"><span>${it.icon}</span>${Views.esc(it.label)}</a>`).join('');
    const mobileItems = items.filter(i => ['#/dashboard', '#/markets', '#/portfolio', '#/assistant'].includes(i.hash));
    bottom.innerHTML = mobileItems.map(it =>
      `<a href="${it.hash}" class="${current === it.hash ? 'active' : ''}"><span class="ico">${it.icon}</span>${Views.esc(it.label)}</a>`).join('');
  },

  renderInstallBanner(slot) {
    if (!slot) return;
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (standalone) return;
    if (App.deferredInstall) {
      slot.innerHTML = `
        <div class="install-banner">
          <div>📲 <b>Installez Buxcoin</b> sur votre appareil pour une expérience plein écran et les notifications.</div>
          <button class="btn btn-sm" id="install-btn">Installer</button>
        </div>`;
      document.getElementById('install-btn').addEventListener('click', async () => {
        App.deferredInstall.prompt();
        const choice = await App.deferredInstall.userChoice;
        if (choice.outcome === 'accepted') slot.innerHTML = '';
        App.deferredInstall = null;
      });
    } else if (isIOS) {
      slot.innerHTML = `
        <div class="install-banner">
          <div>📲 Sur iPhone : touchez <b>Partager</b> ⬆️ puis <b>« Sur l'écran d'accueil »</b> pour installer Buxcoin.</div>
        </div>`;
    }
  },

  async checkNotifications() {
    if (!App.user || !App.user.notifications_enabled) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const data = await API.get('/trading/notifications');
      if (App.lastNotifCheck && data.unread > 0) {
        const fresh = data.notifications.filter(n => n.created_at > App.lastNotifCheck && !n.read);
        for (const n of fresh.slice(0, 3)) {
          if (document.hidden && navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'SHOW_NOTIFICATION', title: n.title, body: n.body, tag: 'buxcoin-' + n.id });
          } else {
            App.toast(n.title + ' — ' + n.body, n.kind === 'warning' ? 'error' : 'info');
          }
        }
      }
      App.lastNotifCheck = Math.max(Date.now() - 60000, ...(data.notifications.map(n => n.created_at) || [0]));
      const dot = document.getElementById('notif-dot');
      dot.hidden = data.unread === 0;
      dot.textContent = `🔔 ${data.unread} notification(s)`;
    } catch (_) {}
  },

  startNotifWatcher() {
    App.lastNotifCheck = 0;
    App.registerPoller(() => App.checkNotifications(), 20000);
    App.checkNotifications();
  },

  async route() {
    App.clearPollers();
    const hash = location.hash || '#/dashboard';
    const [path, queryStr] = hash.split('?');
    const params = new URLSearchParams(queryStr || '');
    const parts = path.replace('#/', '').split('/');
    const page = parts[0] || 'dashboard';
    const view = document.getElementById('view');
    const authed = !!App.user;

    const publicPages = ['login', 'register', 'forgot', 'reset'];
    const needsOwnerSetup = await App.needsOwnerSetup();

    if (!authed && !publicPages.includes(page)) {
      if (needsOwnerSetup) { location.hash = '#/setup-owner'; return; }
      location.hash = '#/login';
      return;
    }
    if (authed && publicPages.includes(page)) {
      location.hash = '#/dashboard';
      return;
    }

    document.getElementById('sidebar').hidden = !authed;
    document.getElementById('bottombar').hidden = !authed;
    document.getElementById('logout-btn').hidden = !authed;
    App.renderNav();

    const routes = {
      login: [Views.login, Views.bindLogin],
      register: [Views.register, Views.bindRegister],
      forgot: [Views.forgot, Views.bindForgot],
      reset: [Views.reset, Views.bindReset],
      'setup-owner': [Views.setupOwner, Views.bindSetupOwner],
      dashboard: [Views.dashboard, Views.bindDashboard],
      markets: [Views.markets, Views.bindMarkets],
      market: [() => Views.marketDetail(decodeURIComponent(parts[1] || 'BTC')), () => Views.bindMarketDetail(decodeURIComponent(parts[1] || 'BTC'))],
      portfolio: [Views.portfolio, Views.bindPortfolio],
      orders: [Views.orders, Views.bindOrders],
      history: [Views.history, Views.bindHistory],
      watchlist: [Views.watchlist, Views.bindWatchlist],
      assistant: [Views.assistant, Views.bindAssistant],
      calendar: [Views.calendar, Views.bindCalendar],
      settings: [Views.settings, Views.bindSettings],
      admin: [Views.admin, Views.bindAdmin]
    };

    const route = routes[page];
    if (!route) { location.hash = '#/dashboard'; return; }
    document.getElementById('view').scrollTop = 0;
    window.scrollTo(0, 0);
    view.innerHTML = route[0](params);
    try {
      await route[1](params);
    } catch (e) {
      App.handleError(e);
    }
    App.renderNav();
  },

  _ownerSetupCache: { value: null, at: 0 },
  async needsOwnerSetup() {
    const now = Date.now();
    if (App._ownerSetupCache.at && now - App._ownerSetupCache.at < 30000) return App._ownerSetupCache.value;
    try {
      const data = await API.get('/setup/status');
      App._ownerSetupCache = { value: !data.owner_configured, at: now };
      return !data.owner_configured;
    } catch (_) {
      return false;
    }
  },

  async boot() {
    window.addEventListener('hashchange', () => App.route());
    document.getElementById('logout-btn').addEventListener('click', () => App.logout());

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      App.deferredInstall = e;
    });

    if ('serviceWorker' in navigator) {
      try { await navigator.serviceWorker.register('/sw.js'); } catch (_) {}
    }

    if (API.token) {
      try {
        const data = await API.get('/auth/me');
        App.user = data.user;
        App.applyTheme();
        App.startNotifWatcher();
      } catch (e) {
        API.setToken(null);
      }
    }
    App.applyTheme();
    await App.route();
  }
};

document.addEventListener('DOMContentLoaded', () => App.boot());
