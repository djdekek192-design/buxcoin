const { db } = require('../db');
const { verifyToken } = require('../util');

function getUserFromRequest(req) {
  const header = req.headers['authorization'] || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return null;
  const payload = verifyToken(match[1]);
  if (!payload) return null;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.uid);
  if (!user) return null;
  if (user.token_version !== payload.tv) return null;
  if (user.is_blocked) return null;
  return user;
}

function attachUser(req, _res, next) {
  req.user = getUserFromRequest(req);
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentification requise.' });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentification requise.' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Permission refusée.' });
    next();
  };
}

const ROLE_RANK = { user: 1, admin: 2, owner: 3 };
function requireMinRole(rank) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentification requise.' });
    if ((ROLE_RANK[req.user.role] || 0) < rank) return res.status(403).json({ error: 'Permission refusée.' });
    next();
  };
}

module.exports = { attachUser, requireAuth, requireRole, requireMinRole, ROLE_RANK };
