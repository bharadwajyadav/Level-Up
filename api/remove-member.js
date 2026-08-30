const { assertConfig, db, code, input } = require('./_supabase');
module.exports = async (req,res) => {
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  if(!assertConfig(res)) return;
  try {
    const {roomCode,hostToken,targetId}=input(req), room=code(roomCode), token=String(hostToken||''), target=String(targetId||'');
    const rows=await db(`tracker_rooms?code=eq.${encodeURIComponent(room)}&select=host_token`);
    if(!rows[0]||!token||rows[0].host_token!==token) return res.status(403).json({error:'Only this room’s host can remove members.'});
    if(!target) return res.status(400).json({error:'Choose a member to remove.'});
    await db('tracker_bans?on_conflict=room_code,client_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({room_code:room,client_id:target})});
    await db(`tracker_members?room_code=eq.${encodeURIComponent(room)}&client_id=eq.${encodeURIComponent(target)}`,{method:'DELETE'});
    res.status(200).json({ok:true});
  } catch(e) { res.status(500).json({error:e.message}); }
};
