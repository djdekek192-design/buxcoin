const API = {
  token: localStorage.getItem('bux_token') || null,

  async request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (API.token) headers['Authorization'] = 'Bearer ' + API.token;
    let res;
    try {
      res = await fetch('/api' + path, {
        method, headers,
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
    } catch (e) {
      throw new Error('Connexion au serveur impossible.');
    }
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) {
      const err = new Error(data.error || 'Erreur ' + res.status);
      err.status = res.status;
      throw err;
    }
    return data;
  },

  get(path) { return API.request('GET', path); },
  post(path, body) { return API.request('POST', path, body); },
  patch(path, body) { return API.request('PATCH', path, body); },
  del(path) { return API.request('DELETE', path); },

  setToken(t) {
    API.token = t;
    if (t) localStorage.setItem('bux_token', t);
    else localStorage.removeItem('bux_token');
  }
};
