const { assertConfig, db, input, code, requireUser } = require('./_tracker_auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!assertConfig(res)) return;
  try {
    const user = await requireUser(req, res); if (!user) return;
    const { action, roomCode } = input(req); const room = code(roomCode);
    if (room.length < 4) return res.status(400).json({ error: 'Use a 4+ character room code.' });
    if (action === 'create') {
      const exists = await db(`tracker_rooms?code=eq.${encodeURIComponent(room)}&select=code`);
      if (exists.length) return res.status(409).json({ error: 'That room code is already in use. Choose another.' });
      await db('tracker_rooms', { method: 'POST', body: JSON.stringify({ code: room, owner_id: user.id }) });
      await db('tracker_members', { method: 'POST', body: JSON.stringify({ room_code: room, user_id: user.id }) });
      return res.status(201).json({ room: { code: room, isOwner: true } });
    }
    if (action === 'join') {
      const rooms = await db(`tracker_rooms?code=eq.${encodeURIComponent(room)}&select=code,owner_id`);
      if (!rooms.length) return res.status(404).json({ error: 'That room does not exist. Check the room code.' });
      await db('tracker_members?on_conflict=room_code,user_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ room_code: room, user_id: user.id }) });
      return res.status(200).json({ room: { code: room, isOwner: rooms[0].owner_id === user.id } });
    }
    return res.status(400).json({ error: 'Choose whether to create or join a room.' });
  } catch (error) { return res.status(500).json({ error: error.message || 'Room request failed.' }); }
};
