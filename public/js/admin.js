Views.admin = () => `
  <div class="page-head"><div><h1>Administration privée</h1>
  <div class="subtitle">Réservée au propriétaire et aux administrateurs. Toutes les actions sont journalisées.</div></div></div>
  <div class="tabs" id="admin-tabs">
    <button class="tab active" data-tab="overview">Vue d'ensemble</button>
    <button class="tab" data-tab="users">Utilisateurs</button>
    ${App.user.role === 'owner' ? '<button class="tab" data-tab="settings">Paramètres globaux</button>' : ''}
    ${App.user.role === 'owner' ? '<button class="tab" data-tab="admins">Administrateurs</button>' : ''}
    <button class="tab" data-tab="events">Calendrier</button>
  </div>
  <div id="admin-overview"></div>
  <div id="admin-users" style="display:none"></div>
  <div id="admin-settings" style="display:none"></div>
  <div id="admin-admins" style="display:none"></div>
  <div id="admin-events" style="display:none"></div>`;

Views.bindAdmin = () => {
  const show = (name) => {
    for (const section of ['overview', 'users', 'settings', 'admins', 'events']) {
      const el = document.getElementById('admin-' + section);
      if (el) el.style.display = section === name ? 'block' : 'none';
    }
  };
  document.querySelectorAll('#admin-tabs .tab').forEach(tab => tab.addEventListener('click', () => {
    document.querySelectorAll('#admin-tabs .tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    show(tab.dataset.tab);
  }));

  /* ---- overview ---- */
  const loadOverview = async () => {
    const data = await API.get('/admin/overview');
    const o = data.overview;
    document.getElementById('admin-overview').innerHTML = `
      <div class="grid grid-4">
        <div class="card"><div class="stat-label">Comptes</div><div class="stat-value">${o.users}</div></div>
        <div class="card"><div class="stat-label">Trades (24h)</div><div class="stat-value">${o.trades_24h}</div></div>
        <div class="card"><div class="stat-label">Ordres ouverts</div><div class="stat-value">${o.open_orders}</div></div>
        <div class="card"><div class="stat-label">Encours virtuel total</div><div class="stat-value" style="font-size:18px">${Views.money(o.total_virtual_wealth, 0)}</div><div class="stat-sub">${Views.money(o.total_virtual_cash, 0)} cash + ${Views.money(o.total_virtual_invested, 0)} investi</div></div>
      </div>`;
  };
  loadOverview();

  /* ---- users ---- */
  const usersEl = document.getElementById('admin-users');
  usersEl.innerHTML = `
    <div class="card">
      <div class="flex-between">
        <h2 class="mb0">Utilisateurs</h2>
        <input id="adm-search" placeholder="Rechercher email / pseudo" style="max-width:240px">
      </div>
      <div class="table-wrap mt"><table>
        <thead><tr><th>Compte</th><th>Rôle</th><th>Solde</th><th>Statut</th><th>Inscrit le</th><th>Actions</th></tr></thead>
        <tbody id="adm-users-body"></tbody>
      </table></div>
    </div>`;

  const roleBadge = (r) => r === 'owner' ? '<span class="badge badge-accent">👑 Propriétaire</span>' :
    r === 'admin' ? '<span class="badge badge-blue">Administrateur</span>' : '<span class="badge badge-neutral">Utilisateur</span>';

  const moneyModal = (u) => App.modal(`
    <h3>Argent virtuel — ${Views.esc(u.username)}</h3>
    <div class="small muted">Solde actuel : <b>${Views.money(u.balance)}</b></div>
    <label>Montant ($ virtuels)</label>
    <input id="mm-amount" type="number" step="0.01" min="0.01">
    <label>Note (optionnelle)</label>
    <input id="mm-note" maxlength="140" placeholder="ex : correction, bonus event…">
    <div class="modal-actions">
      <button class="btn btn-ghost" id="mm-cancel">Annuler</button>
      <button class="btn btn-danger" id="mm-remove">Retirer</button>
      <button class="btn btn-green" id="mm-add">Ajouter</button>
    </div>`, async () => {
    const amount = parseFloat(document.getElementById('mm-amount').value);
    if (!(amount > 0)) return App.toast('Montant invalide.', 'error');
    const note = document.getElementById('mm-note').value;
    try {
      await API.post(`/admin/users/${u.id}/money`, { operation: 'add', amount, note });
      App.toast(`${Views.money(amount)} ajoutés à ${u.username} ✅`, 'success');
      App.closeModal(); loadUsers();
    } catch (e) { App.handleError(e); }
  }, async () => {
    const amount = parseFloat(document.getElementById('mm-amount').value);
    if (!(amount > 0)) return App.toast('Montant invalide.', 'error');
    const note = document.getElementById('mm-note').value;
    try {
      await API.post(`/admin/users/${u.id}/money`, { operation: 'remove', amount, note });
      App.toast(`${Views.money(amount)} retirés à ${u.username} ✅`, 'success');
      App.closeModal(); loadUsers();
    } catch (e) { App.handleError(e); }
  });

  const confirmModal = (title, text, danger, action) => App.modal(`
    <h3>${Views.esc(title)}</h3>
    <div style="font-size:14px;line-height:1.5">${text}</div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cf-cancel">Annuler</button>
      <button class="btn ${danger ? 'btn-danger' : ''}" id="cf-ok">Confirmer</button>
    </div>`, async () => {
    try { await action(); App.closeModal(); loadUsers(); }
    catch (e) { App.handleError(e); }
  });

  const loadUsers = async () => {
    const q = document.getElementById('adm-search').value || '';
    const data = await API.get('/admin/users' + (q ? '?q=' + encodeURIComponent(q) : ''));
    const isOwner = App.user.role === 'owner';
    document.getElementById('adm-users-body').innerHTML = data.users.map(u => `
      <tr>
        <td><b>${Views.esc(u.username)}</b><div class="small muted">${Views.esc(u.email)}</div></td>
        <td>${roleBadge(u.role)}</td>
        <td style="font-weight:700">${Views.money(u.balance)}</td>
        <td>${u.is_blocked ? '<span class="badge badge-red">Bloqué</span>' : '<span class="badge badge-green">Actif</span>'}</td>
        <td class="small muted">${Views.date(u.created_at)}</td>
        <td><div class="actions-cell">
          ${u.role !== 'owner' ? `<button class="btn btn-secondary btn-sm" data-money="${u.id}">💰 Argent</button>` : ''}
          ${u.role !== 'owner' ? `<button class="btn btn-secondary btn-sm" data-block="${u.id}" data-to="${u.is_blocked ? '0' : '1'}">${u.is_blocked ? 'Débloquer' : 'Bloquer'}</button>` : ''}
          ${isOwner && u.role !== 'owner' ? `<button class="btn btn-secondary btn-sm" data-role="${u.id}" data-to="${u.role === 'admin' ? 'user' : 'admin'}">${u.role === 'admin' ? 'Révoquer admin' : 'Promouvoir admin'}</button>` : ''}
          ${isOwner && u.role !== 'owner' ? `<button class="btn btn-danger btn-sm" data-delete="${u.id}">Supprimer</button>` : ''}
        </div></td>
      </tr>`).join('');

    const find = (id) => data.users.find(x => x.id === parseInt(id, 10));
    document.querySelectorAll('[data-money]').forEach(b => b.addEventListener('click', () => moneyModal(find(b.dataset.money))));
    document.querySelectorAll('[data-block]').forEach(b => b.addEventListener('click', () => {
      const u = find(b.dataset.block);
      const to = b.dataset.to === '1';
      confirmModal(to ? 'Bloquer ce compte ?' : 'Débloquer ce compte ?',
        `${Views.esc(u.username)} (${Views.esc(u.email)}) ${to ? 'ne pourra plus se connecter et toutes ses sessions seront révoquées.' : 'pourra à nouveau se connecter.'}`,
        to, async () => {
          await API.post(`/admin/users/${u.id}/block`, { block: to });
          App.toast(to ? 'Compte bloqué.' : 'Compte débloqué.', 'success');
        });
    }));
    document.querySelectorAll('[data-role]').forEach(b => b.addEventListener('click', () => {
      const u = find(b.dataset.role);
      const to = b.dataset.to;
      confirmModal(to === 'admin' ? 'Promouvoir administrateur ?' : 'Révoquer les permissions ?',
        `${Views.esc(u.username)} deviendra <b>${to === 'admin' ? 'administrateur' : 'utilisateur simple'}</b>. Ses sessions actives seront révoquées.`,
        to !== 'admin', async () => {
          await API.post(`/admin/users/${u.id}/role`, { role: to });
          App.toast('Permissions mises à jour ✅', 'success');
        });
    }));
    document.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', () => {
      const u = find(b.dataset.delete);
      confirmModal('Supprimer définitivement ce compte ?',
        `Le compte <b>${Views.esc(u.username)}</b> (${Views.esc(u.email)}) ainsi que son portefeuille et son historique seront <b>définitivement supprimés</b>. Action irréversible.`,
        true, async () => {
          await API.del('/admin/users/' + u.id);
          App.toast('Compte supprimé.', 'success');
        });
    }));
  };
  document.getElementById('adm-search').addEventListener('input', loadUsers);
  loadUsers();

  /* ---- settings (owner) ---- */
  if (App.user.role === 'owner') {
    const setEl = document.getElementById('admin-settings');
    setEl.innerHTML = '<div class="card"><h2>Paramètres globaux</h2><div id="adm-settings-form" class="small muted">Chargement…</div></div>';
    const loadSettings = async () => {
      const data = await API.get('/admin/settings');
      const s = data.settings;
      document.getElementById('adm-settings-form').innerHTML = `
        <label>Nom du site</label><input id="gs-site_name" value="${Views.esc(s.site_name)}">
        <label>Frais de simulation (%)</label><input id="gs-fee_percent" type="number" step="0.1" min="0" max="10" value="${Views.esc(s.fee_percent)}">
        <label>Solde de départ des nouveaux comptes ($ virtuels)</label><input id="gs-start_balance" type="number" step="1" min="0" value="${Views.esc(s.start_balance)}">
        <label>Simulation des marchés</label>
        <select id="gs-market_simulation">
          <option value="1" ${s.market_simulation === '1' ? 'selected' : ''}>Activée (cours animés en continu)</option>
          <option value="0" ${s.market_simulation === '0' ? 'selected' : ''}>Désactivée</option>
        </select>
        <label>Inscriptions</label>
        <select id="gs-registration_open">
          <option value="1" ${s.registration_open === '1' ? 'selected' : ''}>Ouvertes</option>
          <option value="0" ${s.registration_open === '0' ? 'selected' : ''}>Fermées</option>
        </select>
        <label>Livraison des jetons de réinitialisation</label>
        <select id="gs-reset_token_delivery">
          <option value="display" ${s.reset_token_delivery === 'display' ? 'selected' : ''}>Affichés à l'écran (simulateur)</option>
          <option value="smtp" ${s.reset_token_delivery === 'smtp' ? 'selected' : ''}>SMTP / logs serveur (production)</option>
        </select>
        <label>Message d'information global (optionnel)</label>
        <input id="gs-maintenance_message" maxlength="500" value="${Views.esc(s.maintenance_message)}">
        <button class="btn mt" id="gs-save">Enregistrer</button>`;
      document.getElementById('gs-save').addEventListener('click', async () => {
        try {
          await API.patch('/admin/settings', {
            site_name: document.getElementById('gs-site_name').value,
            fee_percent: document.getElementById('gs-fee_percent').value,
            start_balance: document.getElementById('gs-start_balance').value,
            market_simulation: document.getElementById('gs-market_simulation').value,
            registration_open: document.getElementById('gs-registration_open').value,
            reset_token_delivery: document.getElementById('gs-reset_token_delivery').value,
            maintenance_message: document.getElementById('gs-maintenance_message').value
          });
          App.toast('Paramètres globaux enregistrés ✅', 'success');
        } catch (e) { App.handleError(e); }
      });
    };
    loadSettings();

    const admEl = document.getElementById('admin-admins');
    admEl.innerHTML = `
      <div class="card">
        <h2>Créer un administrateur</h2>
        <div class="small muted">L'administrateur peut gérer l'argent virtuel, consulter et bloquer les utilisateurs. Seul le propriétaire peut créer/révoquer des administrateurs.</div>
        <label>Email</label><input id="na-email" type="email">
        <label>Nom d'utilisateur</label><input id="na-username" maxlength="24">
        <label>Mot de passe temporaire (10+ caractères, lettres + chiffres)</label><input id="na-password" type="password" autocomplete="new-password">
        <button class="btn mt" id="na-create">Créer l'administrateur</button>
      </div>`;
    document.getElementById('na-create').addEventListener('click', async () => {
      try {
        await API.post('/admin/admins', {
          email: document.getElementById('na-email').value.trim(),
          username: document.getElementById('na-username').value.trim(),
          password: document.getElementById('na-password').value
        });
        App.toast('Administrateur créé ✅', 'success');
        document.getElementById('na-email').value = '';
        document.getElementById('na-username').value = '';
        document.getElementById('na-password').value = '';
        loadUsers();
      } catch (e) { App.handleError(e); }
    });
  }

  /* ---- events ---- */
  const evEl = document.getElementById('admin-events');
  evEl.innerHTML = `
    <div class="card">
      <h2>Ajouter un événement au calendrier</h2>
      <div class="field-row">
        <div><label>Titre</label><input id="ev-title" maxlength="140"></div>
        <div><label>Date</label><input id="ev-date" type="date"></div>
        <div><label>Catégorie</label>
          <select id="ev-cat">
            <option value="economie">Économie</option>
            <option value="resultats">Résultats</option>
            <option value="crypto">Crypto</option>
            <option value="autre">Autre</option>
          </select></div>
      </div>
      <label>Description</label><input id="ev-desc" maxlength="500">
      <button class="btn mt" id="ev-add">Ajouter</button>
    </div>
    <div class="card">
      <h2>Événements existants</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Titre</th><th>Catégorie</th><th></th></tr></thead>
        <tbody id="ev-body"></tbody>
      </table></div>
    </div>`;
  const loadEvents = async () => {
    const data = await API.get('/markets/calendar');
    document.getElementById('ev-body').innerHTML = data.events.map(ev => `
      <tr>
        <td>${Views.date(ev.event_date + 'T00:00:00')}</td>
        <td>${Views.esc(ev.title)}</td>
        <td><span class="badge badge-neutral">${Views.esc(ev.category)}</span></td>
        <td><button class="btn btn-danger btn-sm" data-ev="${ev.id}">Supprimer</button></td>
      </tr>`).join('') || '<tr><td colspan="4" class="empty-state">Aucun événement.</td></tr>';
    document.querySelectorAll('[data-ev]').forEach(b => b.addEventListener('click', async () => {
      try { await API.del('/admin/events/' + b.dataset.ev); App.toast('Événement supprimé.'); loadEvents(); }
      catch (e) { App.handleError(e); }
    }));
  };
  document.getElementById('ev-add').addEventListener('click', async () => {
    try {
      await API.post('/admin/events', {
        title: document.getElementById('ev-title').value,
        category: document.getElementById('ev-cat').value,
        event_date: document.getElementById('ev-date').value,
        description: document.getElementById('ev-desc').value
      });
      App.toast('Événement ajouté ✅', 'success');
      document.getElementById('ev-title').value = '';
      document.getElementById('ev-desc').value = '';
      loadEvents();
    } catch (e) { App.handleError(e); }
  });
  loadEvents().catch(e => App.handleError(e));
};
