const { assertConfig, db, code, requireUser } = require('./_tracker_auth');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!assertConfig(res)) return;
  try {
    const user = await requireUser(req, res); if (!user) return;
    const room = code(req.query.roomCode);
    const rooms = await db(`tracker_rooms?code=eq.${encodeURIComponent(room)}&select=code,owner_id`);
    if (!rooms.length) return res.status(404).json({ error: 'Room not found.' });
    const membership = await db(`tracker_members?room_code=eq.${encodeURIComponent(room)}&user_id=eq.${encodeURIComponent(user.id)}&select=user_id`);
    if (!membership.length) return res.status(403).json({ error: 'You are not a member of this room.' });
    const memberships = await db(`tracker_members?room_code=eq.${encodeURIComponent(room)}&select=user_id,tracker_users(id,display_name)`);
    const members = memberships.map(m => ({ id: m.user_id, name: m.tracker_users?.display_name || 'Member' }));
    const activityRows = await db(`tracker_activity?room_code=eq.${encodeURIComponent(room)}&select=user_id,day_key,done,pending,intensity`);
    const activity = {}; activityRows.forEach(row => { (activity[row.user_id] ||= {})[row.day_key] = { done: row.done, pending: row.pending, intensity: row.intensity }; });
    return res.status(200).json({ code: room, isOwner: rooms[0].owner_id === user.id, members, activity });
  } catch (error) { return res.status(500).json({ error: error.message || 'Could not load room.' }); }
};
