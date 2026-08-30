const { assertConfig, db, input, requireUser } = require('./_tracker_auth');

// Private tracker data: never exposed through the room-board endpoints.
module.exports = async (req, res) => {
  if (!assertConfig(res)) return;
  try {
    const user = await requireUser(req, res); if (!user) return;
    if (req.method === 'GET') {
      const rows = await db(`tracker_personal_state?user_id=eq.${encodeURIComponent(user.id)}&select=state,updated_at`);
      return res.status(200).json({ state: rows[0]?.state || null, updatedAt: rows[0]?.updated_at || null });
    }
    if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });
    const state = input(req).state;
    if (!state || typeof state !== 'object' || Array.isArray(state)) return res.status(400).json({ error: 'Tracker data is invalid.' });
    if (Buffer.byteLength(JSON.stringify(state), 'utf8') > 1500000) return res.status(413).json({ error: 'Tracker data is too large to sync.' });
    await db('tracker_personal_state?on_conflict=user_id', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ user_id: user.id, state, updated_at: new Date().toISOString() })
    });
    return res.status(200).json({ ok: true });
  } catch (error) { return res.status(500).json({ error: error.message || 'Could not sync private tracker data.' }); }
};
