// Pure game simulation (no rendering). Runs identically on a future authoritative server.
import { WMAP } from './weapons-data.js';
import { buildColliders, freeSpot } from './maps-data.js';
import { CMAP, RARITY } from './chars-data.js';

export const C = {
  R_BODY: 0.62, HP: 170, SPEED: 7, DAMP: 7.5, STUN_DAMP: 2.2,
  DASH: false, DASH_T: 0.18, DASH_CD: 1.1, DASH_V: 16,
  SUDDEN: 50, GIFT_FIRST: 5, GIFT_EVERY: 8, BUFF_T: 6,
};

// signature perks for every Epic+ weapon (on hit)
function weaponPerk(s, a, o, kind) { const id = a.w.id;
  if (id === 'cannon') { o.slowT = Math.max(o.slowT || 0, 0.6); }                                    // frosting: sticky slow
  else if (id === 'churro') { if (!(o.burnT > 0)) o.burnTick = 0.5; o.burnT = Math.max(o.burnT || 0, 1.1); o.burnBy = a.id; o.burnDmg = Math.max(o.burnDmg || 0, 2); s.events.push({ type: 'perk', p: 'cinnamon', b: o.id, x: o.x, z: o.z }); }   // cinnamon sizzle
  else if (id === 'lance') { a.lanceN = (a.lanceN || 0) + 1; if (a.lanceN % 3 === 0) { o.stun = Math.max(o.stun, 0.55); o.slowT = Math.max(o.slowT || 0, 1.2); o.frozenT = 0.55; s.events.push({ type: 'perk', p: 'freeze', b: o.id, x: o.x, z: o.z }); } }   // every 3rd hit freezes
  else if (id === 'mega' && kind === 'slam') { o.vy = Math.max(o.vy, 8.5); o.air = true; s.events.push({ type: 'perk', p: 'launch', b: o.id, x: o.x, z: o.z }); }   // marshmallow bounce launch
  else if (id === 'sprinkle' && kind === 'shot') { if (s.t - (o.sprT || -9) > 0.25) o.sprN = 0; o.sprT = s.t; o.sprN = (o.sprN || 0) + 1;
    if (o.sprN === 3) { o.vx += (o.x - a.x) * 2.2; o.vz += (o.z - a.z) * 2.2; o.hp -= 6; s.events.push({ type: 'perk', p: 'rainbow', b: o.id, x: o.x, z: o.z }); } }   // 3 pellets on one jelly = rainbow burst
}
// weapon KO perks: Galaxy Scythe -> 3s phantom (fast, see-through, 50% damage shield); Thunder Lollipop -> 3s storm (next smash = giant bolt, 1s stun)
function weaponKill(s, a) { if (!a || !a.alive || a.falling) return;
  if (a.w.id === 'scythe') { a.ghostT = 3; s.events.push({ type: 'ghost', b: a.id }); }
  else if (a.w.id === 'thunder') { a.stormT = 20; s.events.push({ type: 'storm', b: a.id }); } }
const NOINP = { mx: 0, mz: 0, atk: false, skill: false, dash: false, jump: false, aim: false, ax: 0, az: 0 };
export function createSim(players, map) {
  const col = buildColliders(map);
  const n = players.length, s0 = [];
  return {
    t: 0, map, col, R: map.R, events: [], proj: [], gifts: [], rollers: [], vortex: [], zones: [], bolts: [], rollT: 4, sweepA: 0, giftT: C.GIFT_FIRST, over: false, winner: null, sudden: false,
    blobs: players.map((p, i) => {
      const a = (i / n) * Math.PI * 2 + Math.PI / 4;
      const r = map.R * 0.62;
      // spawn on the ring, but slide sideways / inward until clear of every structure (never inside a cone or tower)
      // spawn clear of every structure, jump pad and earlier spawn (generous margin = no visual overlap either)
      let x = Math.cos(a) * r, z = Math.sin(a) * r;
      const placed = s0.slice(0, i), pads = map.pads || [];
      const clear = (x, z) => Math.hypot(x, z) < map.R - 1.3 && !col.circles.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 1.45) && !col.boxes.some((q) => Math.abs(x - q.x) < q.hw + 1.4 && Math.abs(z - q.z) < q.hd + 1.4)
        && !pads.some((q) => Math.hypot(q.x - x, q.z - z) < 2.0) && !placed.some((q) => Math.hypot(q[0] - x, q[1] - z) < 2.4);
      if (!clear(x, z)) { let best = null, bd = 1e9; for (const rr of [r, r * 0.9, r * 1.08, r * 0.78, r * 1.15, r * 0.66, r * 0.5]) for (let k = 0; k < 48; k++) { const da = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.065, tx = Math.cos(a + da) * rr, tz = Math.sin(a + da) * rr;
          if (clear(tx, tz)) { const cost = Math.abs(da) * 3 + Math.abs(rr - r) * 0.5; if (cost < bd) { bd = cost; best = [tx, tz]; } } }
        if (best) [x, z] = best; }
      s0.push([x, z]);
      return {
        id: p.id, idx: i, human: !!(p.isMe || p.human), dummy: !!p.dummy, x, z, vx: 0, vz: 0, y: 0, vy: 0, r: C.R_BODY,
        face: Math.atan2(-x, -z), hp: C.HP, alive: true, falling: false, air: false,
        w: WMAP[p.weapon] || WMAP.mallet, ch: CMAP[p.char] || CMAP.berry, sk: 30, skillT: 0, slowT: 0, shieldT: 0, rushT: 0, rushHit: null, fizz: false, prevSkill: false, atkT: -1, fired: false, atkCd: 0.3, dashT: 0, dashCd: 0, stun: 0, padCd: 0, inv: 0,
        input: { mx: 0, mz: 0, ax: 0, az: 0, aim: false, atk: false, dash: false, skill: false }, prevDash: false,
        kos: 0, dmgDealt: 0, lastHitBy: null, lastHitT: -99, buff: { speed: 0, power: 0, giant: 0 }, stk: { speed: 0, power: 0, giant: 0 },
      };
    }),
  };
}

function damage(s, a, o, dmg, dx, dz, kb, stun, kind) {
  if (!o.alive || o.falling || o.inv > 0) return;
  const pw = a && a.buff.power > 0 ? 1.5 + 0.15 * (STK(a, 'power') - 1) : 1;
  const wpn = kind !== 'skill' && kind !== 'hazard' && kind !== 'thorn' && kind !== 'pop';
  // skill -> weapon combos: weapon hits right after your skill, on a stunned / frozen jelly, or inside your caramel all hit harder
  let syn = 1, combo = null;
  if (a && wpn) { if (a.comboT > 0) { syn *= 1.2; combo = 'combo'; }
    if (o.frozenT > 0 || o.stun > 0.22) { syn *= 1.15; combo = o.frozenT > 0 ? 'shatter' : 'combo'; }
    if (s.zones.some((z) => z.owner === a.id && !z.gum && Math.hypot(o.x - z.x, o.z - z.z) < z.r)) { syn *= 1.2; combo = combo || 'sticky'; }
    if (o.grapeT > 0 && o.grapeOwner === a.id) { o.grapeT = Math.min(o.grapeT, 0.05); combo = combo || 'grape'; } }
  const sd = s.sudden ? 1.5 : 1;
  const sh = (o.shieldT > 0 ? 0.3 : 1) * (o.novaGuardT > 0 ? 0.2 : 1) * (o.pudT > 0 ? 0.7 : 1) * (o.ghostT > 0 ? 0.5 : 1);
  const mochiCrit = a && a.bounces === 1 && a.air && kind !== 'skill' && kind !== 'hazard';   // Mochi's final hop: every weapon hit is a guaranteed crit
  const crit = a && kind !== 'hazard' && kind !== 'thorn' && kind !== 'pop' && (kind === 'crit' || mochiCrit || combo === 'shatter' || (kind !== 'jump' && Math.random() < 0.1));
  // tutorial tuning (s.tutPhase set by the client): bots spar each other gently and can't KO each other,
  // they only nibble at you while you learn, then fight for real in the final 'KO them all' phase
  const botVsBot = s.tut && a && !a.human && !o.human, botVsYou = s.tut && a && !a.human && o.human;
  if (o.dummy) { o.hp = C.HP + dmg; o.dummyT = 0; }   // the sandbag soaks everything
  const tutK = !s.tut ? 1 : botVsBot ? 0.25 : botVsYou ? (s.tutPhase === 'final' ? 0.8 : 0.2) : a?.human ? 1.25 : 1;
  if (botVsBot && o.hp - dmg * tutK < 25) return;
  const d = dmg * pw * sd * sh * syn * (crit ? 1.6 : 1) * tutK;
  if (o.novaGuardT > 0 && a && a !== o && wpn && Math.hypot(a.x - o.x, a.z - o.z) < 3.4) { const m = RARITY[o.ch.rarity].mul; damage(s, o, a, 4.5 * m, a.x - o.x, a.z - o.z, 8, 0.25, 'thorn'); s.events.push({ type: 'novaZap', b: o.id, a: a.id, x: a.x, z: a.z }); }   // Star Guard zaps whoever punches it
  o.hp -= d;
  o.sk = Math.min(100, o.sk + d * 0.42 * (100 / (o.ch.skill.charge || 100)));
  if (a) { a.dmgDealt += d; o.lastHitBy = a.id; o.lastHitT = s.t; a.sk = Math.min(100, a.sk + d * 0.72 * (100 / (a.ch.skill.charge || 100))); }
  const low = 1 + (1 - Math.max(0, o.hp) / C.HP) * 0.8; // battered jellies fly further (capped)
  const res = (o.buff.giant > 0 ? 0.55 - 0.07 * (STK(o, 'giant') - 1) : 1) * (o.novaGuardT > 0 ? 0.35 : 1) * (o.shieldT > 0 ? 0.15 : 1) * (o.armorT > 0 ? 0.25 : 1);
  const k = kb * low * res * (a && a.buff.power > 0 ? 1.3 : 1) * (a && a.buff.giant > 0 ? 1.25 + 0.1 * (STK(a, 'giant') - 1) : 1) * (s.sudden ? 1.25 : 1);
  const fair = a && a.human && !o.human ? 1.2 : 1;   // humans hit bots a bit harder: crunchier, more satisfying
  const l = Math.hypot(dx, dz) || 1;
  const tk = botVsBot || (botVsYou && s.tutPhase !== 'final') ? 0.35 : 1;
  o.vx = o.vx * 0.2 + (dx / l) * k * fair * tk; o.vz = o.vz * 0.2 + (dz / l) * k * fair * tk;
  if (k > 11) { o.vy = o.bounces > 0 ? Math.max(o.vy, 3.5) : 3.5; o.air = true; }   // Mochi keeps hopping even when smacked mid-skill
  if (o.armorT > 0) stun = 0;
  o.stun = Math.max(o.stun, Math.min(stun, 0.2));   // getting knocked back never cancels a swing you already started
  o.inv = Math.max(o.inv, 0.14);                                                  // brief hit protection: no stun-lock chains
  if (o.dummy) { o.vx = o.vz = 0; o.vy = 0; o.air = false; o.stun = 0; o.inv = 0.06; }   // a sandbag: it wobbles, it never slides
  if (a && o.alive && kind !== 'skill' && kind !== 'hazard' && kind !== 'boom') weaponPerk(s, a, o, kind);
  s.events.push({ type: 'hit', a: a?.id, b: o.id, x: o.x, z: o.z, dx: dx / l, dz: dz / l, dmg: Math.round(d), kind, big: k > 11 || crit, crit, mochi: !!mochiCrit || undefined, combo: combo || undefined });
  if (o.hp <= 0) {
    o.alive = false; o.hp = 0;
    if (a) { a.kos++; if (kind !== 'skill' && kind !== 'hazard') weaponKill(s, a); }
    s.events.push({ type: 'splat', b: o.id, by: a?.id ?? null, x: o.x, z: o.z });
  }
}

// ---------- character skills ----------
const GRAPE = { id: 'grape', dmg: 6, kb: 7, speed: 16, range: 8, stun: 0.12, slow: 1.2, stick: true };
// Grape Shot: grapes STICK to whoever they hit, then pop together ~1.6s later and splash everyone close by
function grapePop(s, o) {
  const n = o.grapeN || 0, own = s.blobs.find((q) => q.id === o.grapeOwner), m = o.grapeM || 1, R = 1.7 + 0.09 * n; o.grapeN = 0; o.grapeT = 0; if (!n || !o.alive || o.falling) return;
  s.events.push({ type: 'grapePop', b: o.id, x: o.x, z: o.z, r: R, n });
  for (const q of s.blobs) { if (q === own || !q.alive || q.falling) continue; const d = Math.hypot(q.x - o.x, q.z - o.z); if (d > R + q.r) continue; q.inv = 0;
    damage(s, own, q, (q === o ? 3.4 * n : 1.8 * n) * m, (q.x - o.x) || 0.01, (q.z - o.z) || 0.01, 5 + n * 0.8, 0.3, 'pop'); }
}
function aoe(s, b, r, dmg, kb, stun, kind, extra) {
  for (const o of s.blobs) { if (o === b || !o.alive || o.falling) continue; if (Math.hypot(o.x - b.x, o.z - b.z) < r + o.r) { damage(s, b, o, dmg, o.x - b.x, o.z - b.z, kb, stun, kind); extra?.(o); } }
}
export function castSkill(s, b) {
  const m = RARITY[b.ch.rarity].mul, id = b.ch.skill.id, fx = Math.sin(b.face), fz = Math.cos(b.face);
  b.sk = 0; b.skillT = 0.6; b.armorT = id === 'rush' ? 0.7 : 0.9;   // brief super-armor so skills don't get interrupted
  s.events.push({ type: 'skill', b: b.id, id, x: b.x, z: b.z, y: b.y || 0 });
  if (id === 'rush') { b.rushT = 0.4; b.rushHit = new Map(); b.vx = fx * 18; b.vz = fz * 18; b.inv = 0.4; }
  else if (id === 'sour') { aoe(s, b, 3.2, 13 * m, 6, 0.3, 'skill', (o) => { o.slowT = 3; o.acidT = 3.2; o.acidTick = 0.4; o.acidDmg = 4.2 * m; o.acidBy = b.id; s.events.push({ type: 'acidOn', b: o.id, x: o.x, z: o.z }); }); }
  else if (id === 'fizz') { let tgt = null, bd = 9; for (const o of s.blobs) { if (o === b || !o.alive || o.falling) continue; const d = Math.hypot(o.x - b.x, o.z - b.z); if (d < bd) { bd = d; tgt = o; } }
    const T = 2 * 13 / 24, tx = tgt ? tgt.x : b.x + fx * 4, tz = tgt ? tgt.z : b.z + fz * 4;   // big hop that lands right on them
    b.vy = 13; b.air = true; b.fizz = true; b.fizzTgt = tgt ? tgt.id : null; b.fizzX = tx; b.fizzZ = tz; b.vx = (tx - b.x) / T; b.vz = (tz - b.z) / T; b.face = Math.atan2(tx - b.x, tz - b.z); b.inv = 0.5; }
  else if (id === 'shield') { b.shieldT = 3.5; b.healT = 5; b.healLeft = C.HP * 0.3; }
  else if (id === 'grapeshot') { const sid = Math.random(); for (let i = -4; i <= 4; i++) { const a = b.face + i * 0.17; s.proj.push({ owner: b.id, x: b.x + Math.sin(a) * (b.r + 0.3), z: b.z + Math.cos(a) * (b.r + 0.3), y: 0.65, vx: Math.sin(a) * 16, vz: Math.cos(a) * 16, vy: 0, life: 0.55, w: { ...GRAPE, dmg: GRAPE.dmg * m, m }, sc: GS(b), lob: false, sid, alive: true }); } }
  else if (id === 'geyser') { aoe(s, b, 3.1, 12 * m, 16, 0.4, 'skill'); s.events.push({ type: 'boom', x: b.x, z: b.z, r: 3.1 });
    for (let i = 0; i < 3; i++) { const a = b.face + (i - 1) * 2.09 + (Math.random() - 0.5) * 1.1, d = 2.6 + Math.random() * 2.6, T = 0.75 + i * 0.12;
      s.proj.push({ owner: b.id, x: b.x, z: b.z, y: 1.4, vx: Math.sin(a) * d / T, vz: Math.cos(a) * d / T, vy: 0.5 * 16 * T - 1.4 / T, life: 5, lob: true, alive: true,
        w: { id: 'mentos', dmg: 16 * m, kb: 12, aoe: 1.9, stun: 0.3, noSelf: true } }); } }
  else if (id === 'bounce') { b.bounces = 3; b.vy = 9; b.air = true; b.vx = fx * 7; b.vz = fz * 7; }
  else if (id === 'caramel') { const cx = b.x + fx * 1.6, cz = b.z + fz * 1.6; s.zones.push({ owner: b.id, x: cx, z: cz, r: 3.1, t: 0, life: 4, tick: 0.35, m }); s.events.push({ type: 'caramel', b: b.id, x: cx, z: cz, r: 3.1 });
    for (const o of s.blobs) { if (o === b || !o.alive || o.falling) continue; if (Math.hypot(o.x - cx, o.z - cz) < 3.1 + o.r) damage(s, b, o, 14 * m, o.x - cx, o.z - cz, 4, 0.35, 'skill'); } }
  else if (id === 'boba') { b.bobaT = 1.8; b.bobaShot = 0; b.bobaA = b.face; }
  else if (id === 'nova') { b.vy = 14.5; b.air = true; b.nova = true; b.novaDive = false; b.vx *= 0.25; b.vz *= 0.25; b.inv = 1.4; s.events.push({ type: 'novaRise', b: b.id, x: b.x, z: b.z }); }
  else if (id === 'blackhole') { const d = b.aimD ? Math.max(1.6, Math.min(5.5, b.aimD)) : 2.8; s.vortex.push({ owner: b.id, x: b.x + fx * d, z: b.z + fz * d, t: 0, life: 1.9, m }); s.events.push({ type: 'vortex', b: b.id, x: b.x + fx * d, z: b.z + fz * d }); }
  else if (id === 'rage') { for (const k of ['power', 'speed', 'giant']) { b.stk[k] = b.buff[k] > 0 ? Math.min(3, (b.stk[k] || 1) + 1) : 1; b.buff[k] = Math.max(b.buff[k], 4); } b.rageT = 4; b.hp = Math.min(C.HP, b.hp + 8); }
}

function inBox(b, x, z, pad) { return Math.abs(x - b.x) < b.hw + pad && Math.abs(z - b.z) < b.hd + pad; }

function collideStatic(s, e, rad, glide = 0) {
  let hit = false;
  // glide > 0 (a jelly landing inside a structure): ease out at that speed instead of snapping, so a jump onto a big prop never 'teleports' you
  const put = (x, z) => { if (glide > 0) { const dx = x - e.x, dz = z - e.z, d = Math.hypot(dx, dz); if (d > glide) { e.x += dx / d * glide; e.z += dz / d * glide; return; } } e.x = x; e.z = z; };
  for (const c of s.col.circles) {
    const dx = e.x - c.x, dz = e.z - c.z, d = Math.hypot(dx, dz), m = c.r + rad;
    if (d < m && d > 1e-4) {
      const nx = dx / d, nz = dz / d; put(c.x + nx * m, c.z + nz * m);
      const vn = e.vx * nx + e.vz * nz; if (vn < 0) { e.vx -= 1.5 * vn * nx; e.vz -= 1.5 * vn * nz; }
      if (c.bumper && e.id != null && (e.bumpCd ?? 0) <= 0) { e.vx += nx * 13; e.vz += nz * 13; e.stun = Math.max(e.stun, 0.25); e.bumpCd = 0.4; s.events.push({ type: 'bumper', b: e.id, x: c.x, z: c.z }); }
      hit = true;
    }
  }
  for (const b of s.col.boxes) {
    const cx = Math.max(b.x - b.hw, Math.min(e.x, b.x + b.hw)), cz = Math.max(b.z - b.hd, Math.min(e.z, b.z + b.hd));
    const dx = e.x - cx, dz = e.z - cz, d = Math.hypot(dx, dz);
    if (d < rad) {
      let nx, nz;
      if (d > 1e-4) { nx = dx / d; nz = dz / d; } else { const ox = e.x - b.x, oz = e.z - b.z; if (Math.abs(ox) / b.hw > Math.abs(oz) / b.hd) { nx = Math.sign(ox); nz = 0; } else { nx = 0; nz = Math.sign(oz); } }
      put(cx + nx * rad, cz + nz * rad);
      const vn = e.vx * nx + e.vz * nz; if (vn < 0) { e.vx -= 1.5 * vn * nx; e.vz -= 1.5 * vn * nz; }
      hit = true;
    }
  }
  return hit;
}

export function blockedLine(s, x0, z0, x1, z1) {
  const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.4);
  for (let i = 1; i < n; i++) {
    const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n;
    if (s.col.circles.some((c) => !c.post && Math.hypot(c.x - x, c.z - z) < c.r)) return true;
    if (s.col.boxes.some((b) => inBox(b, x, z, 0))) return true;
  }
  return false;
}

const STK = (b, k) => (b.buff[k] > 0 ? Math.min(3, Math.max(1, b.stk?.[k] || 1)) : 0);   // pickup stacks (1..3) while the buff is up
const GS = (b) => b.buff.giant > 0 ? (b.rageT > 0 ? 2.0 : 1.5) * (1 + 0.14 * (STK(b, 'giant') - 1)) : 1;   // size of every attack: melee reach, AoE, bullets
const vOK = (a, o, lim = 1.05) => Math.abs((o.y || 0) - (a.y || 0)) < lim;
function fire(s, b) {
  const wm = RARITY[b.w.rarity || 'common'].mul * 0.5 + 0.5;
  const w = { ...b.w, dmg: b.w.dmg * wm }, fx = Math.sin(b.face), fz = Math.cos(b.face);
  const live = s.blobs.filter((o) => o !== b && o.alive && !o.falling);
  const gs = GS(b);
  // airborne melee turns into a dive: plunge down and smash where you land (crit off a jump pad with slam weapons)
  if (b.air && !b.falling && (w.type === 'slam' || w.type === 'swing' || w.type === 'thunder')) {
    if (b.bounces > 0 || b.fizz || b.nova) { b.dive = { pad: false, wm, ride: true }; return; }   // mid-skill hop: ride the skill, the weapon smash lands WITH it (no cancel)
    b.dive = { pad: !!b.padAir, wm }; b.vy = Math.min(b.vy, -17); b.vx *= 0.55; b.vz *= 0.55; s.events.push({ type: 'dive', b: b.id }); return;
  }
  if (w.type === 'thunder') {
    let tx = b.x + fx * 4, tz = b.z + fz * 4, best = null, bs = 1e9;
    for (const o of live) { const dx = o.x - b.x, dz = o.z - b.z, d = Math.hypot(dx, dz) || 1e-3; if (d > 8) continue; const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / d))); if (ang > 0.75) continue; const sc = d + ang * 3; if (sc < bs) { bs = sc; best = o; } }
    if (best) { tx = best.x + best.vx * 0.15; tz = best.z + best.vz * 0.15; } else if (b.input.aim && b.input.ad) { const d = Math.min(7.5, b.input.ad); tx = b.x + fx * d; tz = b.z + fz * d; }
    const td = Math.hypot(tx - b.x, tz - b.z);
    if (b.stormT > 0) {   // storm charged: a colossal bolt on the smash point, big radius, 1s stun
      b.stormT = 0; const cx = b.x + fx * (b.r + w.reach * 0.7 * gs), cz = b.z + fz * (b.r + w.reach * 0.7 * gs), R = 5.2 * gs;
      s.events.push({ type: 'megaBolt', b: b.id, x: cx, z: cz, r: R });
      for (const o of live) if (o !== b && Math.hypot(o.x - cx, o.z - cz) < R + o.r) { o.inv = 0; damage(s, b, o, w.dmg * 1.9, o.x - cx || 0.01, o.z - cz || 0.01, w.kb * 1.7, 1.0, 'crit'); o.stun = Math.max(o.stun, 1.1); o.vy = 7; o.air = true; }
      return; }
    if (td <= b.r + w.reach + 0.7) {   // close: smash + a bolt right on the impact
      const cx = b.x + fx * (b.r + w.reach * 0.65 * gs), cz = b.z + fz * (b.r + w.reach * 0.65 * gs);
      s.events.push({ type: 'impact', b: b.id, x: cx, z: cz, r: w.aoe * gs }); s.events.push({ type: 'bolt', b: b.id, x: cx, z: cz, r: w.aoe * gs });
      for (const o of live) if (Math.hypot(o.x - cx, o.z - cz) < w.aoe * gs + o.r) { damage(s, b, o, w.dmg, o.x - b.x, o.z - b.z, w.kb, 0.1, 'slam'); o.stun = Math.max(o.stun, 0.1); }
    } else {   // far: call lightning down on them after a short warning
      s.bolts.push({ kind: 'bolt', owner: b.id, x: tx, z: tz, t: 0.24, r: 1.35 * gs, dmg: w.dmg * 0.75, kb: w.kb * 0.65 });
      s.events.push({ type: 'boltWarn', b: b.id, x: tx, z: tz, r: 1.35 * gs, t: 0.24 });
    }
    return;
  }
  if (w.type === 'cloud') {   // summon a candy cloud where you aim (capped range); it bursts with sugar rain
    const d = Math.max(1.6, Math.min(w.range, b.input.ad || 4)), tx = b.x + fx * d, tz = b.z + fz * d;
    b.wandN = ((b.wandN || 0) % 3) + 1; const big = b.wandN === 3, rr = w.aoe * gs * (big ? 1.65 : 1);   // every 3rd cast: a giant storm cloud
    s.bolts.push({ kind: 'cloud', owner: b.id, x: tx, z: tz, t: big ? 0.5 : 0.42, r: rr, dmg: w.dmg * (big ? 1.7 : 1), kb: w.kb * (big ? 1.4 : 1), slow: big ? 2 : 1.4, big });
    s.events.push({ type: 'cloudWarn', b: b.id, x: tx, z: tz, r: rr, t: big ? 0.5 : 0.42, big });
    return;
  }
  if (w.type === 'slam') {
    const cx = b.x + fx * (b.r + w.reach * 0.65 * gs), cz = b.z + fz * (b.r + w.reach * 0.65 * gs);
    s.events.push({ type: 'impact', b: b.id, x: cx, z: cz, r: w.aoe * gs });
    for (const o of live) {
      const d = Math.hypot(o.x - cx, o.z - cz);
      if (d < w.aoe * gs + o.r && vOK(b, o, 1.25)) { const sweet = w.id === 'mace' && d < 0.75;   // Lollipop Mace sweet spot: +40% and a dizzy stun
        damage(s, b, o, w.dmg * (1 + 0.25 * Math.max(0, 1 - d / (w.aoe * gs + o.r))) * (sweet ? 1.4 : 1), o.x - b.x, o.z - b.z, w.kb, sweet ? 0.45 : w.stun, 'slam'); if (sweet) { o.stun = Math.max(o.stun, 0.45); s.events.push({ type: 'perk', p: 'sweet', b: o.id, x: o.x, z: o.z }); } }
    }
  } else if (w.type === 'swing') {
    let any = false;
    for (const o of live) {
      const dx = o.x - b.x, dz = o.z - b.z, d = Math.hypot(dx, dz) || 1e-3;
      if (d > b.r + w.reach * gs + o.r || !vOK(b, o)) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / d)));
      if (ang > w.arc && d > b.r + o.r + 0.15) continue;
      const close = 1 + 0.28 * Math.max(0, 1 - (d - b.r - o.r) / (w.reach * gs));   // point-blank swings hurt more
      damage(s, b, o, w.dmg * close, dx * 0.7 + fx * 0.3 * d, dz * 0.7 + fz * 0.3 * d, w.kb, w.stun, 'swing'); any = true;
    }
    if (w.id === 'scythe') {   // the scythe also throws a piercing stardust crescent
      s.proj.push({ owner: b.id, x: b.x + fx * (b.r + 0.6), z: b.z + fz * (b.r + 0.6), y: 0.7, vx: fx * 12, vz: fz * 12, vy: 0, life: 0.42, w: { id: 'crescent', dmg: 8 * wm, kb: 6, stun: 0.1 }, sc: gs, lob: false, pierce: true, hit: new Set(), alive: true });
      s.events.push({ type: 'crescent', b: b.id }); any = true;
    }
    if (!any) s.events.push({ type: 'whiff', b: b.id });
  } else if (w.type === 'thrust') {
    if (w.id === 'glove') b.gloveN = (b.gloveN || 0) + 1;
    for (const o of live) {
      const dx = o.x - b.x, dz = o.z - b.z;
      const along = dx * fx + dz * fz, perp = Math.abs(dx * fz - dz * fx);
      if (along > 0 && along < b.r + w.reach * gs + o.r && perp < o.r + 0.45 && vOK(b, o)) { const up = w.id === 'glove' && b.gloveN % 3 === 0;   // Gummy Glove: every 3rd punch is a launching uppercut
        damage(s, b, o, w.dmg * (1 + 0.22 * Math.max(0, 1 - (along - b.r - o.r) / (w.reach * gs))) * (up ? 1.3 : 1), fx, fz, w.kb * (up ? 1.2 : 1), w.stun, 'thrust'); if (up) { o.vy = 10; o.air = true; s.events.push({ type: 'perk', p: 'uppercut', b: o.id, x: o.x, z: o.z }); } }
    }
  } else {
    const shots = w.type === 'spread' ? [-0.26, -0.13, 0, 0.13, 0.26] : [0], sid = Math.random(), hy = (b.y || 0) + 0.65;
    const kick = w.type === 'rocket' ? 3.2 : w.type === 'spread' ? 2.2 : 0.7; b.vx -= fx * kick; b.vz -= fz * kick;   // recoil
    for (const off of shots) {
      const a = b.face + off, dx = Math.sin(a), dz = Math.cos(a);
      const lob = w.type === 'lob';
      // lobs land where you aim (clamped to range), flight time fixed so it reads well
      const ad = Math.max(2, Math.min(w.range, b.input.ad || w.range));
      const T = 0.8, hs = lob ? ad / T : w.speed;
      s.proj.push({
        owner: b.id, x: b.x + dx * (b.r + 0.3), z: b.z + dz * (b.r + 0.3), y: lob ? 1.2 + (b.y || 0) : hy, sid,
        vx: dx * hs, vz: dz * hs, sc: gs, vy: lob ? 0.5 * 16 * T - (1.2 + (b.y || 0)) / T : 0, life: lob ? 5 : w.range / w.speed, w, lob, boom: w.type === 'rocket', alive: true,
      });
    }
    s.events.push({ type: 'shot', b: b.id, id: w.id, x: b.x + fx * (b.r + 0.35), z: b.z + fz * (b.r + 0.35), face: b.face });
  }
}

function explode(s, p) {
  const owner = s.blobs.find((o) => o.id === p.owner);
  const AO = p.w.aoe * (p.sc || 1); s.events.push({ type: 'boom', x: p.x, z: p.z, r: AO, id: p.w.id });
  if (p.w.id === 'bazooka') s.zones.push({ owner: p.owner, x: p.x, z: p.z, r: 1.7, t: 0, life: 2.2, tick: 99, m: 0, gum: true });   // Bubblegum Bazooka leaves a sticky gum puddle
  for (const o of s.blobs) {
    if (!o.alive || o.falling || (p.w.noSelf && o.id === p.owner)) continue;
    const d = Math.hypot(o.x - p.x, o.z - p.z);
    if (d < AO + o.r) damage(s, owner, o, p.w.dmg * (o.id === p.owner ? 0.25 : 1), o.x - p.x, o.z - p.z, p.w.kb, p.w.stun, 'boom');
  }
}

function freeSpotSim(s) {
  for (let k = 0; k < 30; k++) { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * s.R * 0.78, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (s.col.circles.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 1)) continue; if (s.col.boxes.some((q) => Math.abs(x - q.x) < q.hw + 1 && Math.abs(z - q.z) < q.hd + 1)) continue; return { x, z }; }
  return { x: 0, z: 0 };
}
export function step(s, dt) {
  if (s.over) return;
  s.t += dt;
  if (!s.sudden && s.t >= C.SUDDEN) { s.sudden = true; s.events.push({ type: 'sudden' }); }
  // sudden death: the cake shrinks toward the middle; fences tumble off first, then any structure the edge reaches slides into the sea
  if (s.sudden && !s.map.noShrink) {
    const k = Math.min(1, (s.t - C.SUDDEN) / 22), R0 = s.map.R, R1 = Math.max(5.6, R0 * 0.55);
    s.R = R0 + (R1 - R0) * (k * k * (3 - 2 * k));
    if (!s.fenceGone) { s.fenceGone = true; s.col.circles = s.col.circles.filter((c) => !c.post); s.events.push({ type: 'fenceDrop' }); }
    const out = (c) => Math.hypot(c.x, c.z) + (c.r || Math.max(c.hw || 0, c.hd || 0)) * 0.4 > s.R - 0.15;
    for (const list of [s.col.circles, s.col.boxes]) for (let i = list.length - 1; i >= 0; i--) if (list[i].pi != null && out(list[i])) { s.events.push({ type: 'pieceFall', pi: list[i].pi }); list.splice(i, 1); }
  }
  const live = s.blobs.filter((b) => b.alive);
  // overtime: the sugar rush drains everyone so rounds always end
  if (s.t > C.SUDDEN + 25) for (const b of live) if (!b.falling) { b.hp -= 3 * dt; if (b.hp <= 0 && b.alive) { b.alive = false; s.events.push({ type: 'splat', b: b.id, by: null, x: b.x, z: b.z }); } }

  for (const b of live) {
    for (const k in b.buff) b.buff[k] = Math.max(0, b.buff[k] - dt);
    b.rageT = Math.max(0, (b.rageT || 0) - dt); if (b.buff.giant <= 0) b.rageT = 0;
    b.r = C.R_BODY * (b.rageT > 0 ? 1.9 : b.buff.giant > 0 ? 1.35 : 1) * (1 + 0.1 * Math.max(0, STK(b, 'giant') - 1)); for (const k in b.stk) if (!(b.buff[k] > 0)) b.stk[k] = 0;
    if (b.comboT > 0) b.comboT -= dt;
    if (b.grapeT > 0) { b.grapeT -= dt; if (b.grapeT <= 0) grapePop(s, b); }
    b.novaGuardT = Math.max(0, (b.novaGuardT || 0) - dt); if (b.ghostT > 0) b.ghostT -= dt; if (b.frozenT > 0) b.frozenT -= dt; if (b.stormT > 0) b.stormT -= dt; if (b.pudT > 0) b.pudT -= dt;
    if (b.healT > 0) { const h = Math.min(b.healLeft, C.HP * 0.3 / 5 * dt); b.healT -= dt; b.healLeft -= h; b.hp = Math.min(C.HP, b.hp + h); }
    b.atkCd -= dt; b.dashCd -= dt; b.stun -= dt; b.padCd -= dt; b.inv -= dt; b.jumpCd = (b.jumpCd || 0) - dt; b.armorT = (b.armorT || 0) - dt; b.slowT -= dt; b.shieldT -= dt; b.skillT -= dt;
    if (b.burnT > 0 && !b.falling) {   // meteor burn: fire bites every 0.4 s
      b.burnT -= dt; b.burnTick -= dt;
      if (b.burnTick <= 0) { b.burnTick = 0.5; const by = s.blobs.find((q) => q.id === b.burnBy); const d = b.dummy ? 0 : b.burnDmg; b.hp -= d; if (by) by.dmgDealt += d; b.lastHitBy = b.burnBy; b.lastHitT = s.t; s.events.push({ type: 'burn', b: b.id, x: b.x, z: b.z, dmg: Math.round(b.burnDmg), a: b.burnBy });
        if (b.hp <= 0 && b.alive) { b.alive = false; b.hp = 0; if (by) by.kos++; s.events.push({ type: 'splat', b: b.id, by: b.burnBy ?? null, x: b.x, z: b.z }); continue; } }
    }
    if (b.acidT > 0 && !b.falling) {   // sour acid: little bites every 0.4 s, no knockback, can finish a jelly off
      b.acidT -= dt; b.acidTick -= dt;
      if (b.acidTick <= 0) { b.acidTick = 0.4; const by = s.blobs.find((q) => q.id === b.acidBy); b.hp -= b.acidDmg; if (by) by.dmgDealt += b.acidDmg; s.events.push({ type: 'acid', b: b.id, x: b.x, z: b.z, dmg: Math.round(b.acidDmg), a: b.acidBy });
        if (b.hp <= 0 && b.alive) { b.alive = false; b.hp = 0; if (by) by.kos++; s.events.push({ type: 'splat', b: b.id, by: b.acidBy ?? null, x: b.x, z: b.z }); continue; } }
    }
    b.sk = Math.min(100, b.sk + dt * 2.8 * (100 / (b.ch.skill.charge || 100))); b.bumpCd = (b.bumpCd ?? 0) - dt; b.hazCd = (b.hazCd ?? 0) - dt;
    if (b.cineT > 0) b.cineT -= dt;
    const inp = b.cineT > 0 ? NOINP : b.input;   // Void's cutscene drives the owner
    const dashPressed = inp.dash && !b.prevDash; b.prevDash = inp.dash;
    if (inp.skill && !b.prevSkill) b.skBuf = 0.3; b.prevSkill = inp.skill; b.skBuf = Math.max(0, (b.skBuf || 0) - dt); const skillPressed = b.skBuf > 0;   // buffered: a tap during stun / landing still fires

    if (b.falling) {
      b.vy -= 26 * dt; b.y += b.vy * dt; b.x += b.vx * dt; b.z += b.vz * dt;
      if (b.y < -8) {
        b.alive = false;
        const killer = s.t - b.lastHitT < 5 ? b.lastHitBy : null;
        if (killer != null) { const kb = s.blobs.find((o) => o.id === killer); if (kb) { kb.kos++; weaponKill(s, kb); } }
        s.events.push({ type: 'out', b: b.id, by: killer, x: b.x, z: b.z });
      }
      continue;
    }

    let mx = inp.mx, mz = inp.mz; const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    const control = b.stun > 0 ? 0.15 : b.atkT >= 0 ? 0.5 : 1;
    const spd = C.SPEED * (b.buff.speed > 0 ? 1.45 + 0.12 * (STK(b, 'speed') - 1) : 1) * (b.buff.giant > 0 ? 0.85 : 1) * (b.slowT > 0 && !(b.pudT > 0) ? 0.55 : 1) * (b.pudT > 0 ? 1.3 : 1) * (b.ghostT > 0 ? 1.35 : 1);
    const damp = (b.stun > 0 || b.dashT > 0 || b.air || b.rushT > 0 ? C.STUN_DAMP * (b.rushT > 0 ? 0.3 : 1) : C.DAMP) * (s.map.ice && !b.air ? 0.45 : 1);
    const ac = b.air ? 0.6 : 1; b.vx += mx * spd * damp * control * ac * dt; b.vz += mz * spd * damp * control * ac * dt;
    b.vx *= Math.exp(-damp * dt); b.vz *= Math.exp(-damp * dt);

    // facing: aim (mouse) wins, else movement direction
    if (b.stun <= 0 && b.dashT <= 0 && !(b.atkT >= 0 && !inp.aim)) {
      let tf = null;
      if (inp.aim && (inp.ax || inp.az)) tf = Math.atan2(inp.ax, inp.az);
      else if (ml > 0.15) tf = Math.atan2(mx, mz);
      if (tf != null) { let d = tf - b.face; d = Math.atan2(Math.sin(d), Math.cos(d)); b.face += d * Math.min(1, dt * (inp.aim ? 40 : b.atkT >= 0 ? 10 : 20)); }
    }

    if (C.DASH && dashPressed && b.dashCd <= 0 && b.stun <= 0 && !b.air) {
      const dx = ml > 0.15 ? mx : Math.sin(b.face), dz = ml > 0.15 ? mz : Math.cos(b.face), dl = Math.hypot(dx, dz) || 1;
      b.vx = (dx / dl) * C.DASH_V; b.vz = (dz / dl) * C.DASH_V; b.dashT = C.DASH_T; b.dashCd = C.DASH_CD; b.dashHit = false; b.inv = 0.12;
      s.events.push({ type: 'dash', b: b.id });
    }
    b.dashT -= dt;

    if (skillPressed && b.sk >= 100 && b.stun <= 0.1) { b.skBuf = 0; b.comboT = 2.5;   // skills work mid-air too
      if (inp.aim) { b.face = Math.atan2(inp.ax, inp.az); b.aimD = inp.ad; } else b.aimD = 0; castSkill(s, b); }
    if (b.rushT > 0) {
      b.rushT -= dt;
      const m = RARITY[b.ch.rarity].mul, fx = Math.sin(b.face), fz = Math.cos(b.face);
      // meteor rush: rapid 3-hit flurry that drags victims along the bow shock and sets them on fire, then a finishing blast
      for (const o of live) { if (o === b || o.falling || !o.alive) continue; const st = b.rushHit.get(o) || { n: 0, cd: 0 }; st.cd -= dt;
        const ox = o.x - b.x, oz = o.z - b.z, od = Math.hypot(ox, oz) || 1, front = (ox * fx + oz * fz) / od;
        if (od < b.r + o.r + 0.45 && st.n === 0 && front < 0.6) {   // only grazed from the side: shoved out of the way, no damage, no flurry
          if (!st.shoved) { st.shoved = true; const sx = ox - fx * (ox * fx + oz * fz), sz = oz - fz * (ox * fx + oz * fz), sl = Math.hypot(sx, sz) || 1; o.vx += (sx / sl) * 9 + fx * 3; o.vz += (sz / sl) * 9 + fz * 3; o.stun = Math.max(o.stun, 0.12); s.events.push({ type: 'bumper', b: o.id, x: b.x, z: b.z }); }
          b.rushHit.set(o, st); continue; }
        if (od < b.r + o.r + 0.45) { if (st.n < 3 && st.cd <= 0) { st.n++; st.cd = 0.09; o.inv = 0; damage(s, b, o, 5.5 * m, fx, fz, 2.5, 0.2, 'skill'); o.vx = b.vx * 0.55; o.vz = b.vz * 0.55; o.x = b.x + fx * (b.r + o.r + 0.2); o.z = b.z + fz * (b.r + o.r + 0.2);
            o.burnT = 1.5; o.burnTick = Math.min(o.burnTick || 0.5, 0.5); o.burnBy = b.id; o.burnDmg = 3 * m; s.events.push({ type: 'rushHit', b: o.id, a: b.id, x: o.x, z: o.z, n: st.n }); }
          b.rushHit.set(o, st); } }
      if (b.rushT <= 0) { for (const [o, st] of b.rushHit) if (st.n > 0 && o.alive && !o.falling && Math.hypot(o.x - b.x, o.z - b.z) < 2.4) { o.inv = 0; damage(s, b, o, 11 * m, o.x - b.x + fx * 0.5, o.z - b.z + fz * 0.5, 12, 0.35, 'skill'); }
        if (b.rushHit.size && [...b.rushHit.values()].some((q) => q.n > 0)) s.events.push({ type: 'rushEnd', b: b.id, x: b.x + fx * 0.8, z: b.z + fz * 0.8 }); }
    }
    if (inp.atk) b.atkBuf = 0.25; else b.atkBuf = Math.max(0, (b.atkBuf || 0) - dt);   // buffered click
    if (b.atkBuf > 0 && b.atkCd <= 0 && b.stun <= 0.16 && b.atkT < 0) {
      b.atkBuf = 0;
      if (b.w.id === 'mega') b.armorT = Math.max(b.armorT || 0, (b.w.wind || 0.4) + 0.1);   // Marshmallow XL: fluff armour during the wind-up
      b.atkT = 0; b.fired = false; b.atkCd = b.w.cd * (b.novaGuardT > 0 ? 0.7 : 1) * (b.pudT > 0 ? 0.77 : 1);
      if (!inp.aim) { // aim assist: lock onto the best enemy in front when attacking toward your facing
        const ranged = b.w.type === 'shoot' || b.w.type === 'spread' || b.w.type === 'lob' || b.w.type === 'rocket' || b.w.type === 'cloud' || b.w.type === 'thunder';
        const maxD = ranged ? (b.w.range || 8) : b.r + (b.w.reach || 1.3) + (b.w.aoe || 0) + 1.2, cone = ranged ? 0.6 : 1.2;
        let best = null, bs = 1e9; const fx = Math.sin(b.face), fz = Math.cos(b.face);
        for (const o of live) { if (o === b || o.falling) continue; const dx = o.x - b.x, dz = o.z - b.z, d = Math.hypot(dx, dz) || 1e-3; if (d > maxD) continue;
          const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / d))); if (ang > cone) continue; const sc = d + ang * 2; if (sc < bs) { bs = sc; best = o; } }
        if (best) { b.face = Math.atan2(best.x - b.x, best.z - b.z); inp.ad = Math.hypot(best.x - b.x, best.z - b.z); }
      }
      s.events.push({ type: 'swing', b: b.id, wtype: b.w.type });
    }
    if (b.atkT >= 0) {
      b.atkT += dt;
      if (!b.fired && b.atkT >= b.w.wind) { b.fired = true; fire(s, b); }
      if (b.atkT > b.w.wind + 0.15) b.atkT = -1;
    }

    b.x += b.vx * dt; b.z += b.vz * dt;
    if (b.nova && !b.novaDive && b.vy < 1.5) { b.novaHang = (b.novaHang || 0) + dt; b.vy = Math.max(b.vy, 0.2);
      if (b.novaHang > 0.28) { b.novaDive = true; b.novaHang = 0; let tgt = null, bd = 6; for (const o of live) { if (o === b || o.falling) continue; const d = Math.hypot(o.x - b.x, o.z - b.z); if (d < bd) { bd = d; tgt = o; } }
        if (tgt) { b.vx = (tgt.x - b.x) * 2.2; b.vz = (tgt.z - b.z) * 2.2; b.face = Math.atan2(tgt.x - b.x, tgt.z - b.z); } b.vy = -28; s.events.push({ type: 'novaDive', b: b.id }); } }
    if (b.fizz && b.air) {   // Fizz Rocket homes in: re-aim each frame so it lands right on the target, even if they move
      const t = s.blobs.find((o) => o.id === b.fizzTgt && o.alive && !o.falling); if (t) { b.fizzX = t.x; b.fizzZ = t.z; }
      const tr = Math.max(0.05, (b.vy + Math.sqrt(Math.max(0, b.vy * b.vy + 48 * b.y))) / 24); b.vx = (b.fizzX - b.x) / tr; b.vz = (b.fizzZ - b.z) / tr; }
    if (b.air) { b.vy -= 24 * dt; b.y += b.vy * dt; if (b.y <= 0) { s.events.push({ type: 'land', b: b.id, x: b.x, z: b.z, v: -b.vy }); b.y = 0; b.vy = 0; b.air = false;
          if (b.dive) { const w = b.w, heavy = w.type === 'slam' || w.type === 'thunder', big = (b.dive.pad && heavy) || b.bounces === 1, crit = big || heavy, gs = GS(b), mult = big ? 1.9 : heavy ? 1.15 : 1.35;   // slam weapons: every jump-smash is a CRIT
            const cx = b.x + Math.sin(b.face) * (b.r + 0.45), cz = b.z + Math.cos(b.face) * (b.r + 0.45), r = ((w.aoe || 1.1) * 1.2 + (crit ? 0.5 : 0)) * gs;
            const iev = { type: 'impact', b: b.id, x: cx, z: cz, r, jump: true, crit: false }; s.events.push(iev); let anyHit = false; if (w.type === 'thunder') s.events.push({ type: 'bolt', b: b.id, x: cx, z: cz, r });
            for (const o of s.blobs) { if (o === b || !o.alive || o.falling) continue; if (Math.hypot(o.x - cx, o.z - cz) < r + o.r) { const fl = w.id === 'flail'; anyHit = true; damage(s, b, o, w.dmg * b.dive.wm * mult * (fl ? 0.6 : 1), o.x - b.x, o.z - b.z, w.kb * (crit ? 1.3 : 1.12), fl ? 0.1 : Math.max(0.2, w.stun), crit ? 'crit' : 'jump'); if (fl) { o.stun = Math.max(o.stun, 0.1); s.events.push({ type: 'stunPop', b: o.id, x: o.x, z: o.z }); } } }
            iev.crit = crit && anyHit; b.dive = null; }
          b.padAir = false; if (b.bounces > 0) { const m = RARITY[b.ch.rarity].mul, fin = b.bounces === 1, R = fin ? 3.6 : 2.2;   // the 3rd landing is a big shockwave
            aoe(s, b, R, (fin ? 20 : 11) * m, fin ? 15 : 10, fin ? 0.45 : 0.3, 'skill'); s.events.push({ type: fin ? 'mochiFinal' : 'impact', b: b.id, x: b.x, z: b.z, r: R }); b.bounces--; if (b.bounces > 0) { b.vy = 8.5; b.air = true; b.vx = Math.sin(b.face) * 7; b.vz = Math.cos(b.face) * 7; } }
          if (b.nova) { b.nova = false; const m = RARITY[b.ch.rarity].mul; aoe(s, b, 3.6, 24 * m, 15, 0.4, 'skill'); s.events.push({ type: 'novaBoom', b: b.id, x: b.x, z: b.z, r: 3.6 }); b.vx *= 0.2; b.vz *= 0.2; b.novaGuardT = 3.2;
            for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; s.proj.push({ owner: b.id, x: b.x + Math.sin(a) * 0.9, z: b.z + Math.cos(a) * 0.9, y: 0.6, vx: Math.sin(a) * 13, vz: Math.cos(a) * 13, vy: 0, life: 0.55, w: { id: 'star', dmg: 8 * m, kb: 7, speed: 13, range: 7, stun: 0.1 }, sc: GS(b), lob: false, alive: true }); } }
          if (b.fizz) { b.fizz = false; aoe(s, b, 3.2, 28 * RARITY[b.ch.rarity].mul, 13, 0.35, 'skill'); s.events.push({ type: 'fizzSplash', b: b.id, x: b.x, z: b.z, r: 3.2 }); b.vx *= 0.15; b.vz *= 0.15; b.buff.speed = Math.max(b.buff.speed, 2.5); } } }
    if (!b.air || b.y < 1.2) collideStatic(s, b, b.r, Math.max(0.05, 14 * dt));

    // jump (Space): short hop, keeps your momentum, clears rollers and sweepers
    if (inp.jump && !b.air && !b.falling && b.jumpCd <= 0 && b.stun <= 0.1) { b.vy = 8.6; b.air = true; b.jumpCd = 0.6; s.events.push({ type: 'jump', b: b.id, x: b.x, z: b.z }); }
    // jump pads: bounce the way you're heading (toward the middle if you're standing still)
    if (!b.air && b.padCd <= 0) for (const p of s.map.pads) if (Math.hypot(b.x - p.x, b.z - p.z) < 0.85) {
      let dx = inp.mx || 0, dz = inp.mz || 0, dl = Math.hypot(dx, dz);
      if (dl < 0.2) { dx = -p.x; dz = -p.z; dl = Math.hypot(dx, dz) || 1; }
      b.vy = 11; b.air = true; b.padAir = true; b.padCd = 0.9; b.vx = (dx / dl) * 8; b.vz = (dz / dl) * 8;
      s.events.push({ type: 'pad', b: b.id, x: p.x, z: p.z });
    }

    if (Math.hypot(b.x, b.z) > s.R + b.r * 0.1 && !b.air) {
      b.falling = true; b.vy = 2.5; b.atkT = -1; s.events.push({ type: 'fall', b: b.id });
    }
  }

  // blob-blob
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i], b = live[j];
    if (a.falling || b.falling || !a.alive || !b.alive || Math.abs(a.y - b.y) > 1) continue;
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = a.r + b.r;
    if (d >= min || d < 1e-4) continue;
    const nx = dx / d, nz = dz / d, pen = (min - d) / 2;
    a.x -= nx * pen; a.z -= nz * pen; b.x += nx * pen; b.z += nz * pen;
    const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    if (rv < 0) {
      const aD = a.dashT > 0 && !a.dashHit, bD = b.dashT > 0 && !b.dashHit;
      if (aD || bD) { const atk = aD ? a : b, vic = aD ? b : a, sg = aD ? 1 : -1; atk.dashHit = true; atk.vx *= 0.3; atk.vz *= 0.3; damage(s, atk, vic, 6, nx * sg, nz * sg, 9, 0.25, 'slam'); }
      else { a.vx += rv * nx * 0.8; a.vz += rv * nz * 0.8; b.vx -= rv * nx * 0.8; b.vz -= rv * nz * 0.8; }
    }
  }

  // projectiles
  for (const p of s.proj) {
    if (!p.alive) continue;
    p.life -= dt; p.x += p.vx * dt; p.z += p.vz * dt;
    if (p.lob) { p.vy -= 16 * dt; p.y += p.vy * dt; if (p.y <= 0.15) { p.alive = false; explode(s, p); continue; } }
    else if (p.y > 0.66) p.y = Math.max(0.65, p.y - dt * 2.2);
    if (p.life <= 0) { p.alive = false; if (p.lob || p.boom) explode(s, p); continue; }
    const tmp = { x: p.x, z: p.z, vx: 0, vz: 0 };
    if (p.y < 1.4 && collideStatic(s, tmp, 0.15)) { p.alive = false; if (p.lob || p.boom) explode(s, p); else s.events.push({ type: 'pop', x: p.x, z: p.z }); continue; }
    if (p.lob) continue;
    for (const o of s.blobs) {
      if (o.id === p.owner || !o.alive || o.falling) continue;
      if (Math.hypot(o.x - p.x, o.z - p.z) < o.r + (p.boom ? 0.3 : 0.2) * (p.sc || 1) && Math.abs((o.y || 0) + 0.6 - p.y) < 0.95) {
        if (p.sid) { if (o.sidHit === p.sid) o.inv = 0; o.sidHit = p.sid; }   // every pellet of one blast lands
        if (p.boom) { p.alive = false; explode(s, p); break; }
        if (p.pierce) { if (p.hit.has(o.id)) continue; p.hit.add(o.id); damage(s, s.blobs.find((q) => q.id === p.owner), o, p.w.dmg, p.vx, p.vz, p.w.kb, p.w.stun, 'shot'); s.events.push({ type: 'projHit', id: p.w.id, x: o.x, z: o.z }); continue; }
        p.alive = false; damage(s, s.blobs.find((q) => q.id === p.owner), o, p.w.dmg, p.vx, p.vz, p.w.kb, p.w.stun, 'shot'); if (p.w.stick && o.alive && !o.falling) { if (!(o.grapeT > 0) || o.grapeOwner !== p.owner) { o.grapeN = 0; o.grapeT = 1.6; } o.grapeN = Math.min(9, (o.grapeN || 0) + 1); o.grapeOwner = p.owner; o.grapeM = p.w.m || 1; } if (p.w.slow) o.slowT = Math.max(o.slowT || 0, p.w.slow); s.events.push({ type: 'projHit', id: p.w.id, x: o.x, z: o.z }); break;
      }
    }
  }
  s.proj = s.proj.filter((p) => p.alive);

  // gift boxes
  s.giftT -= dt;
  if (s.giftT <= 0 && s.gifts.length < 2) {
    s.giftT = C.GIFT_EVERY + Math.random() * 4;
    const sp = freeSpot(s.map, s.col, 0.9, 0.7);
    const kinds = ['heal', 'speed', 'power', 'giant'];
    s.gifts.push({ id: Math.random(), x: sp.x, z: sp.z, kind: kinds[(Math.random() * kinds.length) | 0], t: 0 });
    s.events.push({ type: 'giftSpawn', x: sp.x, z: sp.z });
  }
  for (const g of s.gifts) {
    g.t += dt;
    for (const b of live) {
      if (b.falling || !b.alive || g.taken) continue;
      if (Math.hypot(b.x - g.x, b.z - g.z) < b.r + 0.5) {
        g.taken = true;
        if (g.kind === 'heal') b.hp = Math.min(C.HP, b.hp + 35); else { const had = b.buff[g.kind] > 0; b.buff[g.kind] = Math.min(C.BUFF_T * 2, (had ? b.buff[g.kind] : 0) + C.BUFF_T); b.stk[g.kind] = had ? Math.min(3, (b.stk[g.kind] || 1) + 1) : 1; }   // pickups STACK: longer + stronger, up to x3
        s.events.push({ type: 'gift', b: b.id, kind: g.kind, x: g.x, z: g.z, n: b.stk[g.kind] || 0 });
      }
    }
  }
  s.gifts = s.gifts.filter((g) => !g.taken);

  // boba barrage: spiral of pearls
  for (const b of live) if (b.bobaT > 0) {
    b.bobaT -= dt; b.bobaShot -= dt;
    if (b.bobaShot <= 0) { b.bobaShot = 0.075; b.bobaA += 0.62; const m = RARITY[b.ch.rarity].mul, sc = GS(b) * 1.45;
      for (const k of [0, 2.094, 4.189]) { const a = b.bobaA + k; s.proj.push({ owner: b.id, x: b.x + Math.sin(a) * (b.r + 0.2), z: b.z + Math.cos(a) * (b.r + 0.2), y: 0.6, vx: Math.sin(a) * 13, vz: Math.cos(a) * 13, vy: 0, life: 0.5, w: { id: 'boba', dmg: 8.5 * m, kb: 7, speed: 14, range: 7, stun: 0.1, slow: 0.6 }, sc, lob: false, alive: true }); }
      s.events.push({ type: 'shot', b: b.id }); }
  }
  // caramel pools: sticky slow + damage ticks
  for (const q of s.bolts) {
    q.t -= dt; if (q.t > 0 || q.done) continue; q.done = true; const own = s.blobs.find((o) => o.id === q.owner);
    s.events.push({ type: q.kind === 'bolt' ? 'bolt' : 'cloudPop', b: q.owner, x: q.x, z: q.z, r: q.r, big: q.big || undefined });
    for (const o of s.blobs) { if (o.id === q.owner || !o.alive || o.falling) continue; if (Math.hypot(o.x - q.x, o.z - q.z) < q.r + o.r) { damage(s, own, o, q.dmg, o.x - q.x, o.z - q.z, q.kb, 0.1, 'boom'); o.stun = Math.max(o.stun, 0.1); if (q.slow) o.slowT = Math.max(o.slowT || 0, q.slow); } }
  }
  s.bolts = s.bolts.filter((q) => !q.done);
  for (const z of s.zones) {
    z.t += dt; z.tick -= dt;
    { const ow = s.blobs.find((q) => q.id === z.owner); if (ow && ow.alive && !ow.falling && Math.hypot(ow.x - z.x, ow.z - z.z) < z.r) { if (!(ow.pudT > 0)) s.events.push({ type: 'pudBuff', b: ow.id, x: ow.x, z: ow.z }); ow.pudT = 0.25; } }   // Pud in his own caramel: +30% attack & move speed, 30% damage shield (and the caramel doesn't slow him)
    for (const o of live) { if (o.id === z.owner || o.falling || o.air) continue; if (Math.hypot(o.x - z.x, o.z - z.z) < z.r) { o.slowT = Math.max(o.slowT || 0, 0.4); o.vx *= Math.exp(-8 * dt); o.vz *= Math.exp(-8 * dt); o.vx += (z.x - o.x) * 1.6 * dt; o.vz += (z.z - o.z) * 1.6 * dt;   // sticky + gently sucked to the middle
      if (z.tick <= 0 && !z.gum) damage(s, s.blobs.find((q) => q.id === z.owner), o, 7 * z.m, o.x - z.x, o.z - z.z, 1.5, 0.05, 'skill'); } }
    if (z.tick <= 0) z.tick = 0.5;
  }
  s.zones = s.zones.filter((z) => z.t < z.life);
  // black holes: pull, then implode
  for (const v of s.vortex) {
    v.t += dt; let caught = 0;
    for (const o of live) {
      if (o.id === v.owner || o.falling || !o.alive) continue;
      const dx = v.x - o.x, dz = v.z - o.z, d = Math.hypot(dx, dz);
      if (d < 6.2 && d > 0.05) { const f = (1 - d / 6.2) * 46 * dt; o.vx += (dx / d) * f; o.vz += (dz / d) * f; o.slowT = Math.max(o.slowT || 0, 0.25); }
      if (d < 2.6) caught++;
    }
    if (!v.mCheck && v.t >= v.life - 0.7) { v.mCheck = true; const own = s.blobs.find((q) => q.id === v.owner);
      const vic = live.filter((o) => o.id !== v.owner && !o.falling && o.alive && Math.hypot(o.x - v.x, o.z - v.z) < 3.0);
      if (vic.length >= 3 && own && own.alive && !own.falling) {   // EVENT HORIZON: 3+ caught -> cutscene, hammer leap, total wipe
        v.cine = 1; v.vic = vic.map((o) => o.id); v.cT = 0; v.life = v.t + 2.4; own.cineT = 2.45; own.cine0 = [own.x, own.z]; own.atkT = -1;
        s.events.push({ type: 'voidCine', b: v.owner, x: v.x, z: v.z, dur: 2.4, vic: v.vic });
      } else if (caught >= 2) { v.meteor = true; s.events.push({ type: 'meteorFall', b: v.owner, x: v.x, z: v.z, t: 0.7 }); } }
    if (v.cine && !v.done) { v.cT += dt; const own = s.blobs.find((q) => q.id === v.owner);
      v.vic.forEach((id, i) => { const o = s.blobs.find((q) => q.id === id); if (!o || !o.alive || o.falling) return; const a = v.cT * 7 + i * (6.283 / v.vic.length), rr = 0.95 - Math.min(0.4, v.cT * 0.2);
        o.x += (v.x + Math.cos(a) * rr - o.x) * Math.min(1, dt * 9); o.z += (v.z + Math.sin(a) * rr - o.z) * Math.min(1, dt * 9); o.vx = o.vz = 0; o.stun = Math.max(o.stun, 0.3); o.slowT = Math.max(o.slowT || 0, 0.3); });
      if (own && own.alive && !own.falling) { const [x0, z0] = own.cine0;
        if (v.ux == null) {   // pick the approach side once: from the owner, unless that would put the run-up or the hover outside the cake -> then from the centre side
          let dx = v.x - x0, dz = v.z - z0, d = Math.hypot(dx, dz) || 1; v.ux = dx / d; v.uz = dz / d; const lim = s.R - 1.2;
          if (Math.hypot(v.x - v.ux * 3.6, v.z - v.uz * 3.6) > lim) { const r = Math.hypot(v.x, v.z) || 1; v.ux = v.x / r; v.uz = v.z / r; if (r < 0.5) { v.ux = 0; v.uz = 1; } } }
        const ux = v.ux, uz = v.uz, d = Math.hypot(v.x - x0, v.z - z0), p1x = v.x - ux * 3.6, p1z = v.z - uz * 3.6;
        own.inv = Math.max(own.inv || 0, 0.3); own.stun = 0; own.vx = own.vz = own.vy = 0; own.face = Math.atan2(ux, uz);
        // run in -> leap up -> hang & charge the singularity -> dive-bomb straight down onto it
        if (v.cT < 0.4) { const k = v.cT / 0.4, e = k * k * (3 - 2 * k); own.x = x0 + (p1x - x0) * e; own.z = z0 + (p1z - z0) * e; own.y = 0; own.air = false; }
        else if (v.cT < 0.85) { const k = (v.cT - 0.4) / 0.45, e = 1 - (1 - k) * (1 - k); own.x = p1x + (v.x - ux * 2.3 - p1x) * e; own.z = p1z + (v.z - uz * 2.3 - p1z) * e; own.y = 5.6 * e + 0.02; own.air = true;
          if (!v.leapEv) { v.leapEv = 1; s.events.push({ type: 'voidLeap', b: own.id, x: own.x, z: own.z }); } }
        else if (v.cT < 2.15) { own.x = v.x - ux * 2.3; own.z = v.z - uz * 2.3; own.y = 5.6 + Math.sin((v.cT - 0.85) * 5) * 0.12; own.air = true;
          if (!v.chargeEv) { v.chargeEv = 1; s.events.push({ type: 'voidCharge', b: own.id, x: v.x, z: v.z, dur: 1.3 }); } }
        else { const k = Math.min(1, (v.cT - 2.15) / 0.25); own.x = v.x - ux * 2.3; own.z = v.z - uz * 2.3; own.y = Math.max(0.02, 5.6 * (1 - k * k)); own.air = true;
          if (!v.diveEv) { v.diveEv = 1; s.events.push({ type: 'voidDive', b: own.id, x: v.x, z: v.z }); } } } }
    if (v.t >= v.life && !v.done) {
      v.done = true; const own = s.blobs.find((b) => b.id === v.owner), R = v.cine ? 7 : v.meteor ? 4.8 : 3.8, dmg = (v.cine ? 60 : v.meteor ? 52 : 36) * v.m, kb = v.cine ? 34 : v.meteor ? 25 : 20;
      if (v.cine && own) { own.cineT = 0; own.y = 0; own.air = false; own.vy = 0; own.inv = 0.5; }
      for (const o of live) { if (o.id === v.owner || o.falling || !o.alive) continue; const inside = Math.hypot(o.x - v.x, o.z - v.z) < R + o.r; if (!inside) continue;
        if (v.cine && v.vic.includes(o.id)) o.inv = 0; damage(s, own, o, v.cine && v.vic.includes(o.id) ? 999 : dmg, (o.x - v.x) || 0.01, (o.z - v.z) || 0.01, kb, 0.6, 'skill'); }
      s.events.push({ type: 'implode', b: v.owner, x: v.x, z: v.z, r: R, mega: !!(v.meteor || v.cine), cine: !!v.cine });
      if (v.cine) { const gone = []; for (const list of [s.col.circles, s.col.boxes]) for (let i = list.length - 1; i >= 0; i--) if (list[i].pi != null) { if (!gone.includes(list[i].pi)) gone.push(list[i].pi); list.splice(i, 1); }
        s.events.push({ type: 'piecesBlast', x: v.x, z: v.z, pis: gone }); }
    }
  }
  s.vortex = s.vortex.filter((v) => !v.done);

  // map hazards
  const hz = s.map.hazard;
  if (hz?.type === 'sweeper') {
    s.sweepA += hz.speed * dt * (s.sudden ? 1.6 : 1);
    const ux = Math.cos(s.sweepA), uz = Math.sin(s.sweepA), tx = -uz, tz = ux;
    for (const b of live) {
      if (b.falling || b.air || !b.alive || b.hazCd > 0) continue;
      const along = b.x * ux + b.z * uz, perp = b.x * tx + b.z * tz;
      if (along > hz.r0 - 0.2 && along < hz.r1 + 0.2 && Math.abs(perp) < b.r + 0.28) {
        b.hazCd = 0.7; damage(s, null, b, 8, tx * Math.sign(hz.speed) + ux * 0.3, tz * Math.sign(hz.speed) + uz * 0.3, 11, 0.3, 'hazard');
        s.events.push({ type: 'hazard', b: b.id, x: b.x, z: b.z });
      }
    }
  } else if (hz?.type === 'roller') {
    s.rollT -= dt;
    if (s.rollT <= 0) {
      s.rollT = hz.every * (s.sudden ? 0.6 : 1) + Math.random() * 2;
      const a = Math.random() * Math.PI * 2, R = s.R - 1.2, aim = a + Math.PI + (Math.random() - 0.5) * 0.7;
      s.rollers.push({ x: Math.cos(a) * R, z: Math.sin(a) * R, y: 7, vy: 0, vx: Math.cos(aim) * hz.speed, vz: Math.sin(aim) * hz.speed, r: hz.r, rot: 0, alive: true, falling: false, landed: false });
      s.events.push({ type: 'rollerSpawn', x: Math.cos(a) * R, z: Math.sin(a) * R });
    }
    for (const r of s.rollers) {
      const onFloor = !r.falling && Math.hypot(r.x, r.z) < s.R + r.r * 0.3;
      if (r.y > r.r || !onFloor) { r.vy -= 24 * dt; r.y += r.vy * dt; }
      if (onFloor && r.y <= r.r) { if (r.vy < -4) s.events.push({ type: 'rollerLand', x: r.x, z: r.z, v: -r.vy }); r.y = r.r; r.vy = r.vy < -4 ? -r.vy * 0.35 : 0; r.landed = true; }
      if (!onFloor) r.falling = true;
      if (r.falling && r.y < -4.8 && !r.splashed) { r.splashed = true; s.events.push({ type: 'rollerSplash', x: r.x, z: r.z }); }
      if (r.y < -9) r.alive = false;
      r.age = (r.age || 0) + dt;
      if (!r.falling && (r.age > 14 || (r.landed && Math.hypot(r.vx, r.vz) < 1.2))) { r.alive = false; s.events.push({ type: 'rollerMelt', x: r.x, z: r.z, r: r.r }); }
      r.x += r.vx * dt; r.z += r.vz * dt; r.rot += Math.hypot(r.vx, r.vz) * dt / r.r;
      if (!r.falling && r.y <= r.r + 0.3) {   // bounce off structures instead of passing through them
        const sp = Math.hypot(r.vx, r.vz), hit = collideStatic(s, r, r.r);
        if (hit) { const k = sp / (Math.hypot(r.vx, r.vz) || 1); r.vx *= k * 0.9; r.vz *= k * 0.9; s.events.push({ type: 'rollerBump', x: r.x, z: r.z }); }
      }
      for (const b of live) {
        if (b.falling || b.air || !b.alive || b.hazCd > 0 || r.falling || r.y > r.r + 0.6) continue;
        if (Math.hypot(b.x - r.x, b.z - r.z) < b.r + r.r) { b.hazCd = 0.8; damage(s, null, b, 14, b.x - r.x + r.vx * 0.2, b.z - r.z + r.vz * 0.2, 13, 0.35, 'hazard'); s.events.push({ type: 'hazard', b: b.id, x: b.x, z: b.z }); }
      }
    }
    s.rollers = s.rollers.filter((r) => r.alive);
  }

  // choco geysers: a warning bubble, then a sticky eruption that launches anyone standing on it
  if (hz && hz.type === 'geyser') {
    s.geyT = (s.geyT ?? 3) - dt;
    if (s.geyT <= 0) { s.geyT = hz.every * (s.sudden ? 0.6 : 1) + Math.random(); const n = s.sudden ? 2 : 1;
      for (let k = 0; k < n; k++) { const sp = freeSpotSim(s); (s.geys ||= []).push({ x: sp.x, z: sp.z, t: 1.0 }); s.events.push({ type: 'geyWarn', x: sp.x, z: sp.z, r: hz.r, t: 1.0 }); } }
    for (const g of s.geys || []) { g.t -= dt; if (g.t > 0 || g.done) continue; g.done = true; s.events.push({ type: 'geyser', x: g.x, z: g.z, r: hz.r });
      for (const b of live) { if (b.falling || !b.alive) continue; const d = Math.hypot(b.x - g.x, b.z - g.z); if (d < hz.r + b.r) { damage(s, null, b, 10, b.x - g.x + 0.01, b.z - g.z, 9, 0.25, 'hazard'); b.vy = 10; b.air = true; } } }
    if (s.geys) s.geys = s.geys.filter((g) => !g.done);
  }
  const standing = s.blobs.filter((b) => b.alive);
  if (standing.length <= 1 && !standing.some((b) => b.falling)) {
    s.over = true; s.winner = standing[0]?.id ?? null; s.events.push({ type: 'roundEnd', winner: s.winner });
  }
}
