const { assertConfig, db, code, input } = require('./_supabase');
module.exports = async (req, res) => {
  if (req.method !== 'PUT') return res.status(405).json({error:'Method not allowed'});
  if (!assertConfig(res)) return;
  try {
    const {roomCode, userId, consistency} = input(req), room=code(roomCode), id=String(userId||'');
    if (!room || !id) return res.status(400).json({error:'Join a room first.'});
    await db(`tracker_activity?room_code=eq.${encodeURIComponent(room)}&client_id=eq.${encodeURIComponent(id)}`, {method:'DELETE'});
    const rows=[];
    if (consistency && typeof consistency==='object') for (const [day_key, item] of Object.entries(consistency).slice(-366)) if (item && typeof item==='object') rows.push({room_code:room,client_id:id,day_key:String(day_key).slice(0,80),done:Array.isArray(item.done)?item.done.map(x=>String(x).slice(0,120)).slice(0,100):[],pending:Array.isArray(item.pending)?item.pending.map(x=>String(x).slice(0,120)).slice(0,100):[],intensity:Math.max(0,Math.min(1,Number(item.intensity)||0))});
    if (rows.length) await db('tracker_activity', {method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify(rows)});
    return res.status(200).json({ok:true});
  } catch(e) { return res.status(500).json({error:e.message}); }
};
