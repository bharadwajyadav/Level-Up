const { assertConfig, db, code } = require('../_supabase');
module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});
  if (!assertConfig(res)) return;
  try {
    const room=code(req.query.code); const members=await db(`tracker_members?room_code=eq.${encodeURIComponent(room)}&select=client_id,display_name,joined_at`); const rows=await db(`tracker_activity?room_code=eq.${encodeURIComponent(room)}&select=client_id,day_key,done,pending,intensity,updated_at`);
    const activity={}; for(const row of rows){(activity[row.client_id] ||= {})[row.day_key]={done:row.done||[],pending:row.pending||[],intensity:Number(row.intensity)||0,updatedAt:row.updated_at};}
    res.status(200).json({code:room,members:members.map(x=>({id:x.client_id,name:x.display_name,joinedAt:x.joined_at})),activity});
  } catch(e) { return res.status(500).json({error:e.message}); }
};
