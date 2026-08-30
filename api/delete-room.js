const { assertConfig, db, code, input } = require('./_supabase');

// A room can only be removed by the person who holds that room's host token.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!assertConfig(res)) return;
  try {
    const { roomCode, hostToken } = input(req);
    const room = code(roomCode);
    const token = String(hostToken || '');
    if (!room || !token) return res.status(400).json({ error: 'Room host credentials are required.' });

    const rows = await db(`tracker_rooms?code=eq.${encodeURIComponent(room)}&host_token=eq.${encodeURIComponent(token)}&select=code`);
    if (!rows.length) return res.status(403).json({ error: 'Only this room\'s host can delete it.' });

    // The schema's ON DELETE CASCADE removes members, activity, and bans for this room.
    await db(`tracker_rooms?code=eq.${encodeURIComponent(room)}&host_token=eq.${encodeURIComponent(token)}`, { method: 'DELETE' });
    return res.status(200).json({ deleted: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Could not delete the room.' });
  }
};
