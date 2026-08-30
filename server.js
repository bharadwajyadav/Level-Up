const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const clients = new Map();
function readData() { try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return { rooms: {} }; } }
function writeData(data) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
function json(res, status, body) { res.writeHead(status, {'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(body)); }
function body(req) { return new Promise((resolve, reject) => { let raw=''; req.on('data', c => raw += c); req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('Invalid JSON')); } }); }); }
function cleanCode(value) { return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12); }
function publish(roomCode) { const set = clients.get(roomCode); if (!set) return; for (const res of set) res.write('event: change\ndata: {}\n\n'); }
function roomView(room) { return { code: room.code, members: Object.values(room.members), activity: room.activity || {} }; }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'GET' && url.pathname === '/events') {
    const code = cleanCode(url.searchParams.get('room'));
    if (!code) return json(res, 400, {error:'Room code required'});
    res.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'}); res.write(': connected\n\n');
    if (!clients.has(code)) clients.set(code, new Set()); clients.get(code).add(res);
    req.on('close', () => { clients.get(code)?.delete(res); }); return;
  }
  if (req.method === 'GET' && url.pathname === '/api/client-config') {
    res.writeHead(200, {'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'});
    return res.end(`window.TRACKER_CONFIG=${JSON.stringify({supabaseUrl:process.env.SUPABASE_URL||'',supabasePublishableKey:process.env.SUPABASE_PUBLISHABLE_KEY||''})};`);
  }
  if (req.method === 'POST' && url.pathname === '/api/join') {
    try {
      const { roomCode, displayName, userId } = await body(req); const code = cleanCode(roomCode);
      const name = String(displayName || '').trim().slice(0, 32); const id = String(userId || crypto.randomUUID());
      if (code.length < 4 || !name) return json(res, 400, {error:'Use a 4+ character room code and a display name.'});
      const data = readData(); const room = data.rooms[code] ||= {code, members:{}, activity:{}};
      room.members[id] = {id, name, joinedAt: room.members[id]?.joinedAt || new Date().toISOString()}; writeData(data); publish(code);
      return json(res, 200, {userId:id, room:roomView(room)});
    } catch (e) { return json(res, 400, {error:e.message}); }
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/room/')) {
    const room = readData().rooms[cleanCode(url.pathname.split('/').pop())];
    return room ? json(res, 200, roomView(room)) : json(res, 404, {error:'Room not found'});
  }
  if (req.method === 'PUT' && url.pathname === '/api/activity') {
    try {
      const {roomCode, userId, date, done, pending} = await body(req); const code=cleanCode(roomCode);
      const data=readData(), room=data.rooms[code];
      if (!room || !room.members[String(userId)]) return json(res, 403, {error:'Join the room first.'});
      if (!date || String(date).length > 80) return json(res,400,{error:'Invalid date'});
      const safe = v => Array.isArray(v) ? v.map(x=>String(x).trim().slice(0,120)).filter(Boolean).slice(0,100) : [];
      const complete=safe(done), todo=safe(pending); room.activity ||= {}; room.activity[userId] ||= {};
      room.activity[userId][date] = {done:complete, pending:todo, intensity: complete.length+todo.length ? complete.length/(complete.length+todo.length) : 0, updatedAt:new Date().toISOString()};
      writeData(data); publish(code); return json(res,200,{ok:true});
    } catch(e) { return json(res,400,{error:e.message}); }
  }
  if (req.method === 'PUT' && url.pathname === '/api/snapshot') {
    try {
      const {roomCode, userId, consistency} = await body(req); const code=cleanCode(roomCode);
      const data=readData(), room=data.rooms[code];
      if (!room || !room.members[String(userId)]) return json(res,403,{error:'Join the room first.'});
      const clean={};
      if (consistency && typeof consistency==='object') for (const [date, entry] of Object.entries(consistency).slice(-366)) {
        if (typeof date==='string' && date.length<=80 && entry && typeof entry==='object') clean[date]={done:Array.isArray(entry.done)?entry.done.map(x=>String(x).slice(0,120)).slice(0,100):[],pending:Array.isArray(entry.pending)?entry.pending.map(x=>String(x).slice(0,120)).slice(0,100):[],intensity:Math.max(0,Math.min(1,Number(entry.intensity)||0)),updatedAt:new Date().toISOString()};
      }
      room.activity ||= {}; room.activity[userId]=clean; writeData(data); publish(code); return json(res,200,{ok:true});
    } catch(e) { return json(res,400,{error:e.message}); }
  }
  if (req.method === 'GET' && url.pathname === '/') { res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}); return fs.createReadStream(path.join(__dirname,'public','index.html')).pipe(res); }
  if (req.method === 'GET' && ['/social.js','/config.js','/config.example.js'].includes(url.pathname)) {
    const file = path.join(__dirname, 'public', path.basename(url.pathname));
    if (!fs.existsSync(file)) return json(res, 404, {error:'Create public/config.js from config.example.js first.'});
    res.writeHead(200, {'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'});
    return fs.createReadStream(file).pipe(res);
  }
  json(res,404,{error:'Not found'});
});
server.listen(PORT, () => console.log(`Together Tracker running at http://localhost:${PORT}`));
