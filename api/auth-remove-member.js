const { assertConfig, db, input, code, requireUser } = require('./_tracker_auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!assertConfig(res)) return;
  try {
    const user = await requireUser(req, res); if (!user) return;
    const { roomCode, targetId } = input(req); const room = code(roomCode);
    const rooms = await db(`tracker_rooms?code=eq.${encodeURIComponent(room)}&owner_id=eq.${encodeURIComponent(user.id)}&select=code`);
    if (!rooms.length) return res.status(403).json({ error: 'Only this room\'s admin can remove members.' });
    if (String(targetId) === user.id) return res.status(400).json({ error: 'Use Delete room instead of removing yourself.' });
    await db(`tracker_members?room_code=eq.${encodeURIComponent(room)}&user_id=eq.${encodeURIComponent(targetId)}`, { method: 'DELETE' });
    return res.status(200).json({ ok: true });
  } catch (error) { return res.status(500).json({ error: error.message || 'Could not remove member.' }); }
};
