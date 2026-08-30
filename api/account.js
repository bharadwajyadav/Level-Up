const { assertConfig, db, input, userCode, passwordHash, passwordMatches, createSession, currentUser, clearSession } = require('./_tracker_auth');

module.exports = async (req, res) => {
  if (!assertConfig(res)) return;
  try {
    const action = req.method === 'GET' ? String(req.query.action || 'me') : String(input(req).action || '');
    if (action === 'me') return res.status(200).json({ user: await currentUser(req, res) });
    if (action === 'logout') { clearSession(res); return res.status(200).json({ ok: true }); }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const body = input(req), code = userCode(body.userCode), password = String(body.password || '');
    if (code.length < 3 || password.length < 8) return res.status(400).json({ error: 'Use a 3+ character user code and an 8+ character password.' });
    if (action === 'register') {
      const name = String(body.displayName || '').trim().slice(0, 32);
      if (!name) return res.status(400).json({ error: 'Enter your display name.' });
      const exists = await db(`tracker_users?user_code=eq.${encodeURIComponent(code)}&select=id`);
      if (exists.length) return res.status(409).json({ error: 'That user code is already taken.' });
      const created = await db('tracker_users', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ user_code: code, display_name: name, password_hash: passwordHash(password) }) });
      await createSession(res, created[0].id);
      return res.status(201).json({ user: { id: created[0].id, userCode: code, displayName: name } });
    }
    if (action === 'login') {
      const users = await db(`tracker_users?user_code=eq.${encodeURIComponent(code)}&select=id,user_code,display_name,password_hash`);
      const user = users[0];
      if (!user || !passwordMatches(password, user.password_hash)) return res.status(401).json({ error: 'Incorrect user code or password.' });
      await createSession(res, user.id);
      return res.status(200).json({ user: { id: user.id, userCode: user.user_code, displayName: user.display_name } });
    }
    return res.status(400).json({ error: 'Unknown account action.' });
  } catch (error) { return res.status(500).json({ error: error.message || 'Account request failed.' }); }
};
