// Jelly Battle game server: authoritative rooms of 4 running the same pure sim as the client.
// Real players queue together; empty seats fill with bots so a match never waits long.
// Each client sees itself as blob id 0 (ids are swapped per client when serialising).
// Run: node server/server.mjs  (PORT env, default 8787). Admin API uses header x-admin: <ADMIN_CODE>.
import http from 'node:http';
import fs from 'node:fs';
import { WebSocketServer } from 'ws';
import { createSim, step, C } from '../src/sim.js';
import { makeBotBrain, botThink } from '../src/bot.js';
import { MAPS, scaleMap } from '../src/maps-data.js';
import { WEAPONS } from '../src/weapons-data.js';
import { CHARS } from '../src/chars-data.js';

const PORT = Number(process.env.PORT || 8787), ADMIN = process.env.ADMIN_CODE || '1695', DB = process.env.DB_FILE || new URL('./players.json', import.meta.url).pathname;
const TICK = 1 / 30, FILL_WAIT = 2.6, MAX_ROUNDS = 5;
const BOT_NAMES = ['GooeyGuy', 'jellyking', 'Wobbler', 'SquishyPro', 'gummyfan', 'Blobby', 'noodle42', 'BoingBoing', 'SugarRush', 'pudding_pal'];
const db = (() => { try { return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { return { players: {}, banned: [], admins: [] }; } })();
let dirty = false; setInterval(() => { if (dirty) { dirty = false; fs.writeFile(DB, JSON.stringify(db), () => {}); } }, 5000);
const clean = (n) => String(n || 'Jelly').replace(/[<>&"'`]/g, '').slice(0, 14) || 'Jelly';
const rand = (a, b) => a + Math.random() * (b - a);

// ---------- rooms ----------
let uidN = 1; const rooms = new Set(); let queue = [];
const swapId = (id, k) => (id === k ? 0 : id === 0 ? k : id);
function newRoom(priv = null) { const r = { id: Math.random().toString(36).slice(2, 8), priv, seats: [], phase: 'lobby', t: 0, round: 0, wins: {}, kos: {}, map: null, sim: null, brains: new Map(), createdAt: Date.now() }; rooms.add(r); return r; }
const CAP = (r) => (r.priv ? 12 : 4);
function seatHuman(r, c) { const id = r.seats.length; c.room = r; c.sid = id; r.seats.push({ id, human: c, name: c.name, char: c.char, skin: c.char, weapon: c.weapon, outfit: c.outfit, trophies: c.trophies, ready: false }); broadcastLobby(r); if (r.seats.length === 1) r.fillAt = Date.now() + rand(1.2, FILL_WAIT) * 1000; }
function seatBot(r) {
  const id = r.seats.length, used = new Set(r.seats.map((s) => s.name)), name = BOT_NAMES.filter((n) => !used.has(n))[(Math.random() * 6) | 0] || 'Bot' + id;
  const avg = r.seats.reduce((a, s) => a + (s.trophies || 0), 0) / Math.max(1, r.seats.length), maxR = avg < 40 ? 1 : avg < 300 ? 2 : 3;
  const ch = CHARS.filter((c) => ['common', 'rare', 'epic', 'legendary'].indexOf(c.rarity) < maxR + 1 && !r.seats.some((s) => s.char === c.id)); const c = ch[(Math.random() * ch.length) | 0] || CHARS[0];
  const ws = WEAPONS.filter((w) => w.price <= (avg < 40 ? 0 : 150 + avg)); const w = ws[(Math.random() * ws.length) | 0] || WEAPONS[0];
  r.seats.push({ id, bot: true, name, char: c.id, skin: c.id, weapon: w.id, outfit: {}, trophies: Math.max(0, Math.round(avg + rand(-60, 60))) });
  const mm = Math.min(...r.seats.filter((x) => x.human).map((x) => x.human.matches | 0), 99), rook = [0.2, 0.18, 0.14, 0.11, 0.08, 0.06, 0.04, 0.02][mm] ?? 0;   // newcomers in the room -> gentler bots
  r.brains.set(id, Object.assign(makeBotBrain(Math.max(0.08, Math.min(0.85, 0.25 + avg / 1200 - rook))), { aggr: Math.max(0.3, 0.6 + avg / 2000 - rook * 1.5) })); broadcastLobby(r);
}
function lobbyInfo(r, k) { return r.seats.map((s) => ({ id: swapId(s.id, k), name: s.name, char: s.char, weapon: s.weapon, trophies: s.trophies, bot: !!s.bot, outfit: s.outfit, ready: !!s.ready, host: s.id === 0 })); }
function broadcastLobby(r) { for (const s of r.seats) if (s.human) send(s.human, { t: 'lobby', room: r.id, code: r.priv, priv: !!r.priv, cap: CAP(r), host: s.id === 0, players: lobbyInfo(r, s.id) }); }
function startMatch(r) {
  if (!r.priv) while (r.seats.length < 4) seatBot(r);
  r.map = scaleMap(MAPS[process.env.QA_MAP != null ? +process.env.QA_MAP % MAPS.length : (Math.random() * MAPS.length) | 0], r.seats.length); r.round = 0; r.wins = {}; r.kos = {}; for (const s of r.seats) { r.wins[s.id] = 0; r.kos[s.id] = 0; }
  for (const s of r.seats) { s.ready = false; if (s.human) send(s.human, { t: 'start', map: r.map.id, n: r.seats.length, friendly: !!r.priv, players: lobbyInfo(r, s.id) }); }
  r.phase = 'vs'; r.t = 2.6;
}
function startRound(r) {
  r.round++; const players = r.seats.map((s) => ({ id: s.id, name: s.name, skin: s.skin, char: s.char, weapon: s.weapon, isMe: false, human: !!s.human, }));
  const keep = r.sim && r.round > 1 ? Object.fromEntries(r.sim.blobs.map((b) => [b.id, b.sk])) : null;
  r.sim = createSim(players, r.map); for (const b of r.sim.blobs) b.sk = 100;
  r.phase = 'intro'; r.t = r.round === 1 ? 3.6 : 1.8;
  for (const s of r.seats) if (s.human) send(s.human, { t: 'phase', phase: 'intro', round: r.round, cd: r.t });
}
const PICK = ['id', 'x', 'y', 'z', 'vx', 'vy', 'vz', 'face', 'hp', 'alive', 'falling', 'air', 'stun', 'sk', 'skillT', 'shieldT', 'rushT', 'dashT', 'armorT', 'kos', 'nova', 'novaDive', 'slowT', 'lastHitBy', 'bobaT', 'acidT', 'rageT', 'novaGuardT', 'healT', 'cineT', 'pudT', 'burnT', 'ghostT', 'grapeN', 'grapeT', 'comboT', 'frozenT', 'stormT'];
const r2 = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
function uid(o) { if (!o.uid) o.uid = uidN++; return o.uid; }
function snapshot(r, k) {
  const s = r.sim, sw = (id) => (id == null ? id : swapId(id, k));
  const blobs = s.blobs.map((b) => { const o = {}; for (const f of PICK) o[f] = r2(b[f]); o.id = sw(b.id); o.lastHitBy = sw(b.lastHitBy); o.buff = { speed: r2(b.buff.speed), power: r2(b.buff.power), giant: r2(b.buff.giant) }; o.stk = { speed: b.stk?.speed || 0, power: b.stk?.power || 0, giant: b.stk?.giant || 0 }; o.mx = r2(b.input.mx); o.dive = !!b.dive; return o; });
  const sub = (arr, f) => (arr || []).map((o) => { const x = { uid: uid(o) }; for (const k2 of f) x[k2] = r2(o[k2]); if (o.owner != null) x.owner = sw(o.owner); return x; });
  return { t: 's', st: r2(s.t), sudden: s.sudden, R: r2(s.R), sweepA: r2(s.sweepA), blobs,
    proj: (s.proj || []).map((p) => ({ uid: uid(p), x: r2(p.x), y: r2(p.y), z: r2(p.z), vx: r2(p.vx), vz: r2(p.vz), lob: p.lob, boom: p.boom, w: p.w.id, owner: sw(p.owner), sc: p.sc && p.sc !== 1 ? r2(p.sc) : undefined })),
    rollers: sub(s.rollers, ['x', 'y', 'z', 'vx', 'vz', 'r', 'rot', 'falling']), zones: sub(s.zones, ['x', 'z', 'r', 't', 'life', 'gum']), vortex: sub(s.vortex, ['x', 'z', 't', 'life', 'cine', 'meteor']),
    gifts: sub(s.gifts, ['id', 'x', 'z', 'kind', 'y', 't']),
    ev: s.events.map((e) => { const o = { ...e }; for (const f of ['b', 'a', 'by', 'winner']) if (o[f] != null) o[f] = sw(o[f]); return o; }) };
}
function tickRoom(r, dt) {
  if (r.phase === 'lobby') { const humans = r.seats.filter((s) => s.human).length; if (!r.priv && (humans >= 4 || (humans && Date.now() > r.fillAt))) { if (Date.now() > (r.nextBot || 0)) { if (r.seats.length < 4) { seatBot(r); r.nextBot = Date.now() + rand(550, 1500) + (Math.random() < 0.2 ? rand(300, 900) : 0); } else startMatch(r); } } return; }
  if (r.phase === 'vs') { r.t -= dt; if (r.t <= 0) startRound(r); return; }
  if (r.phase === 'intro') { r.t -= dt; if (r.t <= 0) { r.phase = 'play'; for (const s of r.seats) if (s.human) send(s.human, { t: 'phase', phase: 'play' }); } }
  const s = r.sim; s.events = [];
  if (r.phase === 'play' || r.phase === 'roundEnd') {
    const meOut = s.blobs.filter((b) => b.human && b.alive && !b.falling).length === 0; s.hurry = meOut;
    for (const seat of r.seats) { const b = s.blobs[seat.id]; if (seat.human && seat.human.inp && r.phase === 'play') Object.assign(b.input, seat.human.inp); else if (!seat.human) { const br = r.brains.get(seat.id) || r.brains.set(seat.id, makeBotBrain(0.4)).get(seat.id); botThink(br, b, s, dt, { playerId: null, countTargeting: () => 0 }); if (r.phase === 'roundEnd') b.input.atk = false; } }
    step(s, dt * (meOut ? 1.6 : 1));
    if (r.phase === 'play' && s.over) { r.phase = 'roundEnd'; r.t = 2.6; const w = s.winner; if (w != null) r.wins[w]++; for (const b of s.blobs) r.kos[b.id] += b.kos;
      for (const seat of r.seats) if (seat.human) send(seat.human, { t: 'phase', phase: 'roundEnd', winner: w == null ? null : swapId(w, seat.id), wins: Object.fromEntries(Object.entries(r.wins).map(([id, v]) => [swapId(+id, seat.id), v])) }); }
    else if (r.phase === 'roundEnd' && (r.t -= dt) <= 0) {
      const champ = r.seats.find((x) => r.wins[x.id] >= 2);
      if (champ || r.round >= MAX_ROUNDS) endMatch(r); else startRound(r);
    }
  }
  r.snapN = (r.snapN || 0) + 1; const humans = r.seats.filter((x) => x.human).length;
  if (humans <= 4 || r.snapN % 2 === 0 || s.events.length) for (const seat of r.seats) if (seat.human && seat.human.ws.readyState === 1 && seat.human.ws.bufferedAmount < 64000) seat.human.ws.send(JSON.stringify(snapshot(r, seat.id)));
}
function endMatch(r) {
  r.phase = 'done';
  for (const seat of r.seats) if (seat.human) send(seat.human, { t: 'phase', phase: 'results', wins: Object.fromEntries(Object.entries(r.wins).map(([id, v]) => [swapId(+id, seat.id), v])), kos: Object.fromEntries(Object.entries(r.kos).map(([id, v]) => [swapId(+id, seat.id), v])) });
  // private rooms stay together for a rematch; public rooms dissolve
  if (r.priv) { r.phase = 'lobby'; r.sim = null; r.seats = r.seats.filter((s) => s.human); r.seats.forEach((s, i) => { s.id = i; s.human.sid = i; s.ready = false; }); r.brains.clear(); if (!r.seats.length) rooms.delete(r); else setTimeout(() => broadcastLobby(r), 400); } else { for (const s of r.seats) if (s.human) s.human.room = null; rooms.delete(r); }
}
function leave(c) {
  const r = c.room; if (!r) return; c.room = null; const seat = r.seats.find((s) => s.human === c); if (!seat) return;
  if (r.phase === 'lobby') { r.seats = r.seats.filter((s) => s !== seat); r.seats.forEach((s, i) => { s.id = i; if (s.human) s.human.sid = i; }); if (!r.seats.some((s) => s.human)) rooms.delete(r); else broadcastLobby(r); return; }
  seat.human = null; seat.bot = true; r.brains.set(seat.id, makeBotBrain(0.4));   // a bot takes over mid-match
  if (!r.seats.some((s) => s.human)) rooms.delete(r);
}
function findPublicRoom() { for (const r of rooms) if (!r.priv && r.phase === 'lobby' && r.seats.length < 4) return r; return newRoom(); }
setInterval(() => { for (const r of rooms) { try { tickRoom(r, TICK); } catch (e) { console.error('room error', e); rooms.delete(r); } } }, TICK * 1000);

// ---------- network ----------
function send(c, m) { if (c?.ws.readyState === 1) c.ws.send(JSON.stringify(m)); }
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'content-type,x-admin');
  if (req.method === 'OPTIONS') { res.end(); return; }
  const u = new URL(req.url, 'http://x'), json = (o, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/health') return json({ ok: true, rooms: rooms.size, online: clients.size });
  if (u.pathname.startsWith('/api/')) {
    if (req.headers['x-admin'] !== ADMIN) return json({ error: 'forbidden' }, 403);
    if (u.pathname === '/api/players') return json({ online: clients.size, rooms: rooms.size, players: Object.values(db.players).sort((a, b) => b.trophies - a.trophies).slice(0, 500), banned: db.banned, admins: db.admins });
    let body = ''; req.on('data', (d) => (body += d)); req.on('end', () => { let b = {}; try { b = JSON.parse(body || '{}'); } catch { /* bad json */ }
      const n = clean(b.name);
      if (u.pathname === '/api/ban') { if (db.admins.includes(n)) return json({ error: 'cannot ban an admin' }, 400); if (!db.banned.includes(n)) db.banned.push(n); for (const c of clients) if (c.name === n) { send(c, { t: 'banned' }); c.ws.close(); } }
      else if (u.pathname === '/api/unban') db.banned = db.banned.filter((x) => x !== n);
      else if (u.pathname === '/api/admin') { if (!db.admins.includes(n)) db.admins.push(n); }
      dirty = true; json({ ok: true, banned: db.banned, admins: db.admins }); });
    return;
  }
  res.writeHead(404); res.end();
});
const clients = new Set();
const wss = new WebSocketServer({ server, maxPayload: 4096 });
wss.on('connection', (ws) => {
  const c = { ws, name: 'Jelly', room: null, inp: null, lastIn: 0 }; clients.add(c);
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'hello') {
      Object.assign(c, { name: clean(m.name), char: CHARS.some((x) => x.id === m.char) ? m.char : 'berry', weapon: WEAPONS.some((w) => w.id === m.weapon) ? m.weapon : 'mallet', outfit: typeof m.outfit === 'object' ? m.outfit : {}, trophies: Math.max(0, Math.min(99999, m.trophies | 0)) });
      if (db.banned.includes(c.name)) { send(c, { t: 'banned' }); ws.close(); return; }
      const p = db.players[c.name] ||= { name: c.name, trophies: 0, wins: 0, matches: 0, first: Date.now() }; Object.assign(p, { trophies: c.trophies, wins: m.wins | 0, matches: m.matches | 0, last: Date.now() }); c.matches = m.matches | 0; dirty = true;
      send(c, { t: 'welcome', online: clients.size });
    } else if (m.t === 'queue') { leave(c); const code = m.room ? String(m.room).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) : null;
      let r = code ? [...rooms].find((x) => x.priv === code) : findPublicRoom();
      if (code && !r) { if (m.join) { send(c, { t: 'noroom' }); return; } r = newRoom(code); }
      if (r.phase !== 'lobby' || r.seats.length >= CAP(r)) { send(c, { t: r.phase !== 'lobby' ? 'busy' : 'full' }); return; } seatHuman(r, c); }
    else if (m.t === 'ready') { const r = c.room, st = r?.seats.find((x) => x.human === c); if (st && r.phase === 'lobby') { st.ready = !!m.on; broadcastLobby(r); } }
    else if (m.t === 'loadout') { const r = c.room, st = r?.seats.find((x) => x.human === c); if (CHARS.some((x) => x.id === m.char)) c.char = m.char; if (WEAPONS.some((w) => w.id === m.weapon)) c.weapon = m.weapon; if (m.outfit && typeof m.outfit === 'object') c.outfit = m.outfit;
      if (st && r.phase === 'lobby') { Object.assign(st, { char: c.char, skin: c.char, weapon: c.weapon, outfit: c.outfit }); broadcastLobby(r); } }
    else if (m.t === 'kick') { const r = c.room; if (!r?.priv || r.seats[0]?.human !== c || r.phase !== 'lobby') return; const st = r.seats.find((x) => x.id === swapId(m.id | 0, 0) && x.human && x.human !== c); if (st) { const v = st.human; send(v, { t: 'kicked' }); leave(v); } }
    else if (m.t === 'emote') { const r = c.room, st = r?.seats.find((x) => x.human === c); const e = String(m.e || '').slice(0, 12); if (!st || (c.lastEmote && Date.now() - c.lastEmote < 600)) return; c.lastEmote = Date.now(); for (const o of r.seats) if (o.human) send(o.human, { t: 'emote', id: swapId(st.id, o.id), e }); }
    else if (m.t === 'startPrivate') { const r = c.room; if (r?.priv && r.phase === 'lobby' && r.seats[0]?.human === c && r.seats.length >= 2 && r.seats.every((x) => x.id === 0 || x.ready)) startMatch(r); }
    else if (m.t === 'in') { const now = Date.now(); if (now - c.lastIn < 15) return; c.lastIn = now; c.inp = { mx: +m.mx || 0, mz: +m.mz || 0, atk: !!m.atk, skill: !!m.skill, jump: !!m.jump, aim: !!m.aim, ax: +m.ax || 0, az: +m.az || 0, ad: Math.min(20, +m.ad || 0) }; }
    else if (m.t === 'ping') send(c, { t: 'pong', c: +m.c || 0 });
    // lounge (friends-room lobby): each client owns its own jelly; the server just relays positions and hits
    else if (m.t === 'lpos' || m.t === 'lhit') { const r = c.room, st = r?.seats.find((x) => x.human === c); if (!st || r.phase !== 'lobby' || !r.priv) return; const now = Date.now();
      if (m.t === 'lpos') { if (now - (c.lastLp || 0) < 40) return; c.lastLp = now; const o = { t: 'lpos', x: +m.x || 0, z: +m.z || 0, y: +m.y || 0, f: +m.f || 0, a: m.a | 0, hp: +m.hp || 0 }; for (const q of r.seats) if (q.human && q.human !== c) send(q.human, { ...o, id: swapId(st.id, q.id) }); }
      else { if (now - (c.lastLh || 0) < 120) return; c.lastLh = now; const tg = r.seats.find((x) => x.id === swapId(m.id | 0, st.id) && x.human && x.human !== c); if (tg) send(tg.human, { t: 'lhit', from: swapId(st.id, tg.id), dx: Math.max(-1, Math.min(1, +m.dx || 0)), dz: Math.max(-1, Math.min(1, +m.dz || 0)), dmg: Math.min(60, Math.max(0, +m.dmg || 0)), kb: Math.min(20, Math.max(0, +m.kb || 0)) }); } }
    else if (m.t === 'leave') leave(c);
  });
  ws.on('close', () => { leave(c); clients.delete(c); });
});
server.listen(PORT, () => console.log(`Jelly Battle server on :${PORT}`));
