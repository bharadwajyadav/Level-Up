const { assertConfig, db, code, input } = require('./_supabase');
const crypto = require('crypto');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  if (!assertConfig(res)) return;
  try {
    const { roomCode, displayName, userId, hostToken } = input(req); const room=code(roomCode), name=String(displayName||'').trim().slice(0,32), id=String(userId||crypto.randomUUID());
    if(room.length<4||!name) return res.status(400).json({error:'Use a 4+ character room code and a display name.'});
    const banned=await db(`tracker_bans?room_code=eq.${encodeURIComponent(room)}&client_id=eq.${encodeURIComponent(id)}&select=client_id`);
    if(banned.length) return res.status(403).json({error:'You were removed from this room by its host.'});
    let rooms=await db(`tracker_rooms?code=eq.${encodeURIComponent(room)}&select=code,host_token`), record=rooms[0], token=String(hostToken||''), isHost=false;
    if(!record){
      token=crypto.randomBytes(32).toString('hex');
      await db('tracker_rooms?on_conflict=code',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates'},body:JSON.stringify({code:room,host_token:token})});
      rooms=await db(`tracker_rooms?code=eq.${encodeURIComponent(room)}&select=code,host_token`); record=rooms[0];
      isHost=record?.host_token===token;
    } else if(!record.host_token) {
      token=crypto.randomBytes(32).toString('hex');
      const claimed=await db(`tracker_rooms?code=eq.${encodeURIComponent(room)}&host_token=is.null`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({host_token:token})});
      if(claimed.length) { record=claimed[0]; isHost=true; }
    } else isHost=token!==''&&token===record.host_token;
    await db('tracker_members?on_conflict=room_code,client_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({room_code:room,client_id:id,display_name:name})});
    res.status(200).json({userId:id,hostToken:isHost?token:'',isHost,room:{code:room}});
  } catch(e) { res.status(500).json({error:e.message}); }
};
