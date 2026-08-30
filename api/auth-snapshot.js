const { assertConfig, db, input, code, requireUser } = require('./_tracker_auth');

module.exports = async (req, res) => {
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });
  if (!assertConfig(res)) return;
  try {
    const user = await requireUser(req, res); if (!user) return;
    const { roomCode, consistency = {} } = input(req); const room = code(roomCode);
    const membership = await db(`tracker_members?room_code=eq.${encodeURIComponent(room)}&user_id=eq.${encodeURIComponent(user.id)}&select=user_id`);
    if (!membership.length) return res.status(403).json({ error: 'You are not a member of this room.' });
    const rows = Object.entries(consistency).slice(-365).map(([day_key, raw]) => ({ room_code: room, user_id: user.id, day_key, done: raw.done || [], pending: raw.pending || [], intensity: Number(raw.intensity || 0), updated_at: new Date().toISOString() }));
    if (rows.length) await db('tracker_activity?on_conflict=room_code,user_id,day_key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(rows) });
    return res.status(200).json({ ok: true });
  } catch (error) { return res.status(500).json({ error: error.message || 'Could not save activity.' }); }
};
