const crypto = require('crypto');
const { assertConfig, db, input, code } = require('./_supabase');

const COOKIE = 'tracker_session';
const SESSION_SECONDS = 60 * 60 * 24 * 30;

function userCode(value) { return String(value || '').toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 24); }
function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(String(password), salt, 64).toString('hex')}`;
}
function passwordMatches(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const actual = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return actual.length === hash.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(hash));
}
function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').filter(Boolean).map(x => {
    const i = x.indexOf('='); return [x.slice(0, i).trim(), decodeURIComponent(x.slice(i + 1))];
  }));
}
function setSession(res, token) {
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}`);
}
function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}
function tokenHash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
async function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  await db('tracker_sessions', { method: 'POST', body: JSON.stringify({ token_hash: tokenHash(token), user_id: userId, expires_at: expiresAt }) });
  setSession(res, token);
}
async function currentUser(req, res) {
  if (!assertConfig(res)) return null;
  const token = cookies(req)[COOKIE];
  if (!token) return null;
  const sessions = await db(`tracker_sessions?token_hash=eq.${encodeURIComponent(tokenHash(token))}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
  if (!sessions.length) return null;
  const users = await db(`tracker_users?id=eq.${encodeURIComponent(sessions[0].user_id)}&select=id,user_code,display_name`);
  return users[0] || null;
}
function requireUser(req, res) {
  return currentUser(req, res).then(user => {
    if (user) return user;
    res.status(401).json({ error: 'Sign in with your user code and password first.' });
    return null;
  });
}

module.exports = { assertConfig, db, input, code, userCode, passwordHash, passwordMatches, createSession, currentUser, requireUser, clearSession };
