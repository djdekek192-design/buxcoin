const crypto = require('crypto');
const { db } = require('./db');
const config = require('./config');

const JWT_SECRET = config.jwtSecret;
const b64url = (buf) => Buffer.from(buf).toString('base64url');

function scryptHash(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  try {
    const [scheme, saltHex, hashHex] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const hash = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64, { N: 16384, r: 8, p: 1 });
    const expected = Buffer.from(hashHex, 'hex');
    return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
  } catch (_) {
    return false;
  }
}

function signToken(payload) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verifyToken(token) {
  try {
    const parts = String(token).split('.');
    if (parts.length !== 3) return null;
    const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest('base64url');
    const a = Buffer.from(sig), b = Buffer.from(parts[2]);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!payload || typeof payload.uid !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function issueToken(user) {
  return signToken({
    uid: user.id,
    role: user.role,
    tv: user.token_version,
    exp: Math.floor(Date.now() / 1000) + config.tokenTtlSeconds,
    jti: crypto.randomBytes(8).toString('hex')
  });
}

function sha256(v) { return crypto.createHash('sha256').update(String(v)).digest('hex'); }

function randomToken(bytes = 32) { return crypto.randomBytes(bytes).toString('base64url'); }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,24}$/;

function validEmail(v) { return typeof v === 'string' && v.length <= 254 && EMAIL_RE.test(v); }
function validUsername(v) { return typeof v === 'string' && USERNAME_RE.test(v); }
function strongPassword(v) {
  return typeof v === 'string' && v.length >= 10 && v.length <= 200 && /[a-zA-Z]/.test(v) && /[0-9]/.test(v);
}
function finiteNumber(v, min = -Infinity, max = Infinity) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function publicUser(u) {
  return {
    id: u.id, email: u.email, username: u.username, role: u.role,
    balance: u.balance, is_blocked: !!u.is_blocked, theme: u.theme,
    notifications_enabled: !!u.notifications_enabled, created_at: u.created_at,
    last_login_at: u.last_login_at
  };
}

const stmtUserById = db.prepare('SELECT * FROM users WHERE id = ?');
const stmtUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const stmtUserByUsername = db.prepare('SELECT * FROM users WHERE username = ?');
const getUserById = (id) => stmtUserById.get(id);
const getUserByEmail = (email) => stmtUserByEmail.get(email);
const getUserByUsername = (username) => stmtUserByUsername.get(username);

module.exports = {
  scryptHash, verifyPassword, signToken, verifyToken, issueToken,
  sha256, randomToken, validEmail, validUsername, strongPassword, finiteNumber,
  publicUser, getUserById, getUserByEmail, getUserByUsername
};
