// Human-like bots: reaction-time decisions, imperfect aim, obstacle steering, unstick logic,
// ranged kiting vs melee pressure, edge awareness near fence gaps, gift hunting.
import { blockedLine } from './sim.js';
import { isRanged } from './weapons-data.js';

const rand = (a, b) => a + Math.random() * (b - a);

export function makeBotBrain(skill = rand(0.45, 0.85)) {
  return {
    skill, aggr: rand(0.7, 1.2), caution: rand(0.8, 1.3), think: 0, goal: null, target: null, mode: 'idle',
    wob: Math.random() * 6, hesitate: 0, pendingAtk: -1, pendingDash: -1, dashDir: null,
    pendingSkill: -1, strafe: Math.random() < 0.5 ? 1 : -1, strafeT: rand(1, 3), aimErr: 0,
    lastPos: null, stuckT: 0, unstick: 0, unstickDir: null,
    commitT: 0, reactT: 0, fleeT: 0, fleeCd: rand(2, 5), aimA: null, wanderT: 0,
  };
}

function nearFenceGap(s, x, z) {
  const a = Math.atan2(z, x);
  for (const [a0, a1] of s.map.fences) {
    let A = a; while (A < a0) A += Math.PI * 2; while (A > a0 + Math.PI * 2) A -= Math.PI * 2;
    if (A >= a0 && A <= a1) return false;
  }
  return true;
}

// route around props: if the straight line to the goal is blocked, pick a side point around the blocker
function detour(s, me, g) {
  const fx = g.x - me.x, fz = g.z - me.z, L = Math.hypot(fx, fz) || 1, ux = fx / L, uz = fz / L;
  let best = null, bt = Infinity;
  for (const c of s.col.circles) {
    if (c.post) continue;
    const dx = c.x - me.x, dz = c.z - me.z, along = dx * ux + dz * uz; if (along < 0 || along > L) continue;
    const perp = dx * uz - dz * ux; if (Math.abs(perp) < c.r + me.r + 0.2 && along < bt) { bt = along; best = { x: c.x, z: c.z, r: c.r + me.r + 0.7 }; }
  }
  for (const b of s.col.boxes) {
    const cx = Math.max(b.x - b.hw, Math.min(me.x + ux * Math.min(L, 2), b.x + b.hw)), cz = Math.max(b.z - b.hd, Math.min(me.z + uz * Math.min(L, 2), b.z + b.hd));
    const along = (cx - me.x) * ux + (cz - me.z) * uz;
    if (along > 0 && along < bt && Math.hypot(me.x + ux * along - cx, me.z + uz * along - cz) < me.r + 0.3) { bt = along; best = { x: b.x, z: b.z, r: Math.hypot(b.hw, b.hd) + me.r + 0.6 }; }
  }
  if (!best) return null;
  const px = -uz, pz = ux, opts = [1, -1].map((sg) => ({ x: best.x + px * best.r * sg, z: best.z + pz * best.r * sg }))
    .filter((p) => Math.hypot(p.x, p.z) < s.R - 0.8)
    .sort((a, b) => (Math.hypot(a.x - me.x, a.z - me.z) + Math.hypot(g.x - a.x, g.z - a.z)) - (Math.hypot(b.x - me.x, b.z - me.z) + Math.hypot(g.x - b.x, g.z - b.z)));
  return opts[0] || null;
}

export function botThink(br, me, s, dt, opts = {}) {
  const inp = me.input;
  inp.atk = false; inp.dash = false; inp.skill = false; inp.jump = false; inp.aim = true;
  if (s.hurry) br.aggr = Math.max(br.aggr, 1.6);
  if (!me.alive || me.falling) { inp.mx = inp.mz = 0; return; }
  br.wob += dt * rand(1, 3);
  br.strafeT -= dt; if (br.strafeT < 0) { br.strafe *= -1; br.strafeT = rand(1, 3.5); }
  br.commitT -= dt; br.reactT -= dt; br.fleeT -= dt; br.fleeCd -= dt; br.wanderT -= dt;

  if (br.pendingAtk >= 0) { br.pendingAtk -= dt; if (br.pendingAtk < 0) { if (br.reactT > 0) br.pendingAtk = br.reactT; else inp.atk = true; } }
  if (br.pendingSkill >= 0) { br.pendingSkill -= dt; if (br.pendingSkill < 0) inp.skill = true; }
  if (br.pendingDash >= 0) {
    br.pendingDash -= dt;
    if (br.pendingDash < 0) { inp.dash = true; if (br.dashDir) { inp.mx = br.dashDir.x; inp.mz = br.dashDir.z; br.dashDir = null; return; } }
  }

  // stuck detection -> sidestep for a moment
  br.stuckT += dt;
  if (br.stuckT > 0.8) {
    if (br.lastPos && br.goal && Math.hypot(me.x - br.lastPos.x, me.z - br.lastPos.z) < 0.35 && Math.hypot(br.goal.x - me.x, br.goal.z - me.z) > 1.2) {
      br.unstick = rand(0.4, 0.8); const a = Math.random() * Math.PI * 2; br.unstickDir = { x: Math.cos(a), z: Math.sin(a) };
    }
    br.lastPos = { x: me.x, z: me.z }; br.stuckT = 0;
  }

  br.think -= dt;
  if (br.think <= 0) {
    br.think = rand(0.12, 0.28) * (1.4 - br.skill * 0.6);
    if (Math.random() < 0.035 * (1 - br.skill)) br.hesitate = rand(0.15, 0.4);
    decide(br, me, s, opts);
    br.wp = br.goal && blockedLine(s, me.x, me.z, br.goal.x, br.goal.z) ? detour(s, me, br.goal) : null;
  }

  // aim at target with human error
  if (br.target && br.target.alive) {
    const t = br.target, lead = isRanged(me.w) ? Math.hypot(t.x - me.x, t.z - me.z) / (me.w.speed || 15) * br.skill : 0;
    const tx = t.x + t.vx * lead - me.x, tz = t.z + t.vz * lead - me.z;
    const err = (1 - br.skill) * 0.35 * Math.sin(br.wob * 1.7);
    const want = Math.atan2(tx, tz) + err; if (br.aimA == null) br.aimA = me.face;
    let da = want - br.aimA; da = Math.atan2(Math.sin(da), Math.cos(da)); br.aimA += da * Math.min(1, dt * (br.reactT > 0 ? 3 : 6 + br.skill * 10));   // humans turn, they don't snap
    const a = br.aimA; inp.ax = Math.sin(a); inp.az = Math.cos(a); inp.ad = Math.hypot(tx, tz) * (1 + err * 0.5);
  } else { inp.aim = false; }

  for (const r of s.rollers) { if (r.falling) continue; const d = Math.hypot(r.x - me.x, r.z - me.z), rv = Math.hypot(r.vx, r.vz) || 1; if (d < 2.2 && ((me.x - r.x) * r.vx + (me.z - r.z) * r.vz) / (d * rv) > 0.5 && Math.random() < 0.08 + br.skill * 0.2) inp.jump = true; }
  if (br.skill > 0.3 && Math.random() < dt * 0.12 * (1.2 - br.skill)) inp.jump = true;   // the occasional excited hop, like real players
  if (br.hesitate > 0) { br.hesitate -= dt; inp.mx *= 0.85; inp.mz *= 0.85; return; }

  let mx = 0, mz = 0;
  if (br.unstick > 0) { br.unstick -= dt; mx = br.unstickDir.x; mz = br.unstickDir.z; }
  else if (br.goal) {
    const tg = br.wp && Math.hypot(br.wp.x - me.x, br.wp.z - me.z) > 0.5 ? br.wp : br.goal;
    const gx = tg.x - me.x, gz = tg.z - me.z, gl = Math.hypot(gx, gz);
    if (gl > 0.3) { mx = gx / gl; mz = gz / gl; }
    if (br.mode === 'fight' && gl < 0.8 && br.target) {
      const ax = br.target.x - me.x, az = br.target.z - me.z, al = Math.hypot(ax, az) || 1;
      mx += (-az / al) * br.strafe * 0.6; mz += (ax / al) * br.strafe * 0.6;
    }
  }
  // obstacle avoidance: look ahead along movement
  const ml0 = Math.hypot(mx, mz);
  if (ml0 > 0.1) {
    const fx = mx / ml0, fz = mz / ml0;
    for (const c of s.col.circles) {
      const dx = c.x - me.x, dz = c.z - me.z, along = dx * fx + dz * fz;
      if (along < 0 || along > 2.6) continue;
      const perp = dx * fz - dz * fx, need = c.r + me.r + 0.25;
      if (Math.abs(perp) < need) { const sgn = perp > 0 ? -1 : 1; mx += fz * sgn * 1.2 * (1 - along / 2.6); mz += -fx * sgn * 1.2 * (1 - along / 2.6); }
    }
    for (const b of s.col.boxes) {
      const cx = Math.max(b.x - b.hw, Math.min(me.x + fx * 1.2, b.x + b.hw)), cz = Math.max(b.z - b.hd, Math.min(me.z + fz * 1.2, b.z + b.hd));
      const dx = me.x + fx * 1.2 - cx, dz = me.z + fz * 1.2 - cz, d = Math.hypot(dx, dz);
      if (d < me.r + 0.4) { const sgn = (dx * fz - dz * fx) > 0 ? 1 : -1; mx += fz * sgn * 1.3; mz += -fx * sgn * 1.3; }
    }
  }
  // learn from getting sniped: each ranged hit makes this bot warier, then it sidesteps shots and zigzags in
  if (me.lastHitT != null && me.lastHitT !== br.seenHit) { br.seenHit = me.lastHitT; const by = s.blobs.find((o) => o.id === me.lastHitBy); if (by && (isRanged(by.w) || by.w.type === 'thunder')) br.aware = Math.min(1, (br.aware || 0) + 0.3); }
  br.aware = Math.max(0, (br.aware || 0) - dt * 0.03);
  const dodgeP = 0.1 + br.skill * 0.35 + (br.aware || 0) * 0.55;
  if (br.dodgeT > 0) { br.dodgeT -= dt; mx = mx * 0.3 + br.dodgeDir.x * 1.6; mz = mz * 0.3 + br.dodgeDir.z * 1.6; }
  else for (const p of s.proj) {
    if (p.owner === me.id || p.lob) continue; const rx = me.x - p.x, rz = me.z - p.z, sp = Math.hypot(p.vx, p.vz) || 1, along = (rx * p.vx + rz * p.vz) / sp;
    if (along <= 0 || along > 4.5) continue; const perp = (rx * p.vz - rz * p.vx) / sp; if (Math.abs(perp) > me.r + 0.6) continue;
    if (Math.random() < dodgeP * dt * 8) { const sg = perp >= 0 ? 1 : -1; br.dodgeT = 0.28; br.dodgeDir = { x: (p.vz / sp) * sg, z: (-p.vx / sp) * sg }; if (br.skill > 0.5 && Math.random() < 0.3) inp.jump = true; }
    break;
  }
  for (const q of s.bolts || []) { if (q.owner === me.id) continue; const dx = me.x - q.x, dz = me.z - q.z, d = Math.hypot(dx, dz); if (d < q.r + me.r + 0.4 && Math.random() < dodgeP) { mx += (dx / (d || 1)) * 2; mz += (dz / (d || 1)) * 2; } }
  if ((br.aware || 0) > 0.3 && br.mode === 'fight' && br.target && isRanged(br.target.w) && !isRanged(me.w)) {   // zigzag in on a shooter
    const ax = br.target.x - me.x, az = br.target.z - me.z, al = Math.hypot(ax, az) || 1, zz = Math.sin(br.wob * 2.2) * br.aware;
    mx += (-az / al) * zz * 1.1; mz += (ax / al) * zz * 1.1;
  }
  // edge avoidance (only matters at fence gaps)
  const dist = Math.hypot(me.x, me.z), edge = s.R - dist;
  if (edge < 2.4 && dist > 0.01 && nearFenceGap(s, me.x, me.z)) {
    const w = (1 - edge / 2.4) * 2.4 * (0.5 + br.skill * 0.7) * br.caution;
    mx -= (me.x / dist) * w; mz -= (me.z / dist) * w;
  }
  const jit = (1 - br.skill) * 0.4 * Math.sin(br.wob), c = Math.cos(jit), sn = Math.sin(jit);
  const ml = Math.hypot(mx, mz);
  const pace = br.skill < 0.3 ? 0.62 + br.skill : br.skill < 0.5 ? 0.85 : 1;   // rookies amble instead of dancing around
  if (ml > 0.05) { inp.mx = (mx * c - mz * sn) / Math.max(1, ml) * pace; inp.mz = (mx * sn + mz * c) / Math.max(1, ml) * pace; } else { inp.mx *= 0.7; inp.mz *= 0.7; }
}

function decide(br, me, s, opts) {
  const live = s.blobs.filter((b) => b.alive && !b.falling && b !== me);
  const ranged = isRanged(me.w);
  // dodge an incoming melee swing
  for (const o of live) {
    const dx = me.x - o.x, dz = me.z - o.z, d = Math.hypot(dx, dz);
    if (o.atkT >= 0 && !o.fired && !isRanged(o.w) && d < (o.w.reach || 1.4) + 1.6) {
      const fx = Math.sin(o.face), fz = Math.cos(o.face);
      if ((dx * fx + dz * fz) / (d || 1) > 0.5 && Math.random() < br.skill * 0.5 && me.dashCd <= 0) {
        let sx = -fz, sz = fx; if (sx * me.x + sz * me.z > 0) { sx = -sx; sz = -sz; }
        br.unstick = rand(0.25, 0.45); br.unstickDir = { x: sx, z: sz }; return;
      }
    }
  }
  // low HP: run away from the closest threats, toward the middle (and a heal if there is one)
  const hpF = me.hp / 170, threats = live.filter((o) => Math.hypot(o.x - me.x, o.z - me.z) < 5);
  if (br.mode !== 'flee' && hpF < 0.32 * br.caution && threats.length && br.fleeCd <= 0 && Math.random() < 0.55 + (1 - br.aggr) * 0.4) { br.mode = 'flee'; br.fleeT = rand(1.3, 2.6); br.fleeCd = rand(5, 8); }
  if (br.mode === 'flee' && br.fleeT > 0) {
    let ax = -me.x * 0.12, az = -me.z * 0.12, near = null, nd = 99;
    for (const o of threats) { const dx = me.x - o.x, dz = me.z - o.z, d = Math.hypot(dx, dz) || 0.1; ax += dx / (d * d); az += dz / (d * d); if (d < nd) { nd = d; near = o; } }
    const heal = s.gifts.find((g) => g.kind === 'heal' && Math.hypot(g.x - me.x, g.z - me.z) < 6);
    const al = Math.hypot(ax, az) || 1; br.goal = heal ? { x: heal.x, z: heal.z } : { x: me.x + (ax / al) * 3, z: me.z + (az / al) * 3 };
    br.target = near;
    if (near && nd < 1.7 && me.atkCd <= 0 && br.pendingAtk < 0) br.pendingAtk = rand(0.02, 0.1);   // cornered: swing back
    return;
  }
  if (br.mode === 'flee') br.mode = 'idle';
  // gifts if close and safe
  let best = null, bestScore = -1;
  for (const g of s.gifts) {
    const d = Math.hypot(g.x - me.x, g.z - me.z);
    const sc = (g.kind === 'heal' && me.hp < 60 ? 3.2 : 1.6) / (1 + d * 0.3);
    if (sc > bestScore) { bestScore = sc; best = { kind: 'gift', g }; }
  }
  for (const g of s.tut ? [] : s.drops || []) {   // jelly beads: worth a detour when nobody is in your face, and more so when you're small
    if (g.t < 0.3 || (g.src === me.id && g.t < 1.2)) continue; const d = Math.hypot(g.x - me.x, g.z - me.z); if (d > 6) continue;
    const sc = (1.1 + (1.3 - (me.m || 1)) * 1.2) * Math.min(1.2, g.v / 0.03) * 0.55 / (1 + d * 0.5);
    if (sc > bestScore) { bestScore = sc; best = { kind: 'gift', g }; }
  }
  const nPlayer = opts.countTargeting && opts.playerId != null ? opts.countTargeting(opts.playerId) : 0;
  for (const o of live) {
    if (opts.ignoreId != null && o.id === opts.ignoreId) continue;
    if (opts.onlyId != null && o.id !== opts.onlyId) continue;   // tutorial: leave the learner alone
    const d = Math.hypot(o.x - me.x, o.z - me.z);
    let sc = br.aggr * (2.4 / (1 + d * 0.3)) * (1 + (1 - o.hp / 100) * 0.9);
    if (o.id === opts.playerId) sc *= nPlayer >= 1 && br.target !== o ? (br.skill < 0.3 ? 0.3 : 0.55) : 0.95;   // don't dogpile the human (rookie bots almost never gang up)
    if (o.id === opts.playerId && (opts.playerIdle || 0) > 2.5 && (nPlayer < 1 || br.target === o)) sc *= 2.6;   // a player standing still gets visited: nobody is ever left out of the brawl
    if (!br.pref || (br.prefT -= 0.2) < 0) { br.pref = new Map(); br.prefT = rand(4, 8); }
    if (!br.pref.has(o.id)) br.pref.set(o.id, rand(0.7, 1.35));
    sc *= br.pref.get(o.id);
    if (br.target === o) sc *= br.commitT > 0 ? 1.8 : 1.25;   // stay locked on for a while, like a player would
    if (o.lastHitT != null && s.t - o.lastHitT < 1.2) sc *= 1.15;   // third-party a jelly that's already getting hit
    if (sc > bestScore) { bestScore = sc; best = { kind: 'enemy', o, d }; }
  }
  if (best?.kind === 'enemy' && best.o !== br.target) { br.commitT = rand(1.8, 3.6); br.reactT = rand(0.18, 0.5) * (1.35 - br.skill); }
  if (!best) { br.mode = 'idle'; br.target = null; if (br.wanderT <= 0 || !br.goal) { const a = Math.random() * 6.28, r = Math.random() * s.R * 0.5; br.goal = { x: Math.cos(a) * r, z: Math.sin(a) * r }; br.wanderT = rand(1.5, 3); } return; }
  if (best.kind === 'gift') { br.mode = 'gift'; br.goal = { x: best.g.x, z: best.g.z }; br.target = null; return; }

  const o = best.o, d = best.d || 1e-3; br.target = o; br.mode = 'fight';
  const ux = (o.x - me.x) / d, uz = (o.z - me.z) / d;
  const w = me.w;
  if (ranged) {
    const want = w.type === 'cloud' ? w.range * 0.65 : w.type === 'rocket' ? w.range * 0.55 : w.range * 0.6;
    br.goal = { x: o.x - ux * want, z: o.z - uz * want };
    const clear = !blockedLine(s, me.x, me.z, o.x, o.z);
    if (d < w.range * 0.95 && clear && me.atkCd <= 0 && Math.random() < 0.5 + br.skill * 0.45) br.pendingAtk = rand(0.03, 0.15);
    if (!clear) { br.goal = { x: o.x + (-uz) * br.strafe * 3, z: o.z + ux * br.strafe * 3 }; }
  } else {
    // stand between target and centre so hits push them outward
    const od = Math.hypot(o.x, o.z) || 1;
    const reach = (w.reach || 1.3) + me.r + o.r * 0.6;
    const wantD = reach * 0.75;
    br.goal = { x: o.x - (o.x / od) * wantD * 0.6 - ux * wantD * 0.4, z: o.z - (o.z / od) * wantD * 0.6 - uz * wantD * 0.4 };
    // footsies: after swinging, hop back out of range and circle, then step back in
    if (br.skill > 0.35 && me.atkCd > 0.12 && d < reach * 1.2) { const back = reach * 1.35; br.goal = { x: o.x - ux * back + (-uz) * br.strafe * 1.2, z: o.z - uz * back + ux * br.strafe * 1.2 }; }
    if (br.skill > 0.4 && Math.random() < 0.06 * br.skill && d < 3.5) { br.unstick = rand(0.15, 0.3); br.unstickDir = { x: -uz * br.strafe, z: ux * br.strafe }; }   // juke
    const fx = Math.sin(me.face), fz = Math.cos(me.face), facing = ux * fx + uz * fz;
    const range = w.type === 'slam' ? me.r + w.reach * 0.65 + w.aoe + o.r * 0.5 : reach;
    // melee needs lead time for wind-up: swing a bit early, like players do
    if (me.atkCd <= 0 && br.pendingAtk < 0 && d < range * (0.95 + w.wind) && facing > 0.4 && Math.random() < 0.5 + br.skill * 0.45) br.pendingAtk = rand(0.03, 0.18) * (1.3 - br.skill);
    else if (me.atkCd <= 0 && d < range * 1.4 && Math.random() < (1 - br.skill) * 0.1) br.pendingAtk = rand(0.02, 0.1);
    else if (w.type === 'thunder' && me.atkCd <= 0 && br.pendingAtk < 0 && d < 7.5 && facing > 0.7 && Math.random() < 0.25 + br.skill * 0.3) br.pendingAtk = rand(0.05, 0.2);
    if (me.dashCd <= 0 && br.pendingDash < 0 && d > range && d < 5 && facing > 0.85 && Math.random() < 0.15 * (0.5 + br.skill)) {
      br.pendingDash = rand(0.06, 0.18); br.dashDir = { x: ux, z: uz };
    }
  }
  // signature skill when it makes sense (skilled bots time it better)
  if (me.sk >= 100 && br.pendingSkill < 0 && Math.random() < 0.35 + br.skill * 0.5) {
    const id = me.ch.skill.id, fxx = Math.sin(me.face), fzz = Math.cos(me.face), fac = ux * fxx + uz * fzz;
    if ((id === 'rush' && d < 6 && fac > 0.8) || (id === 'grapeshot' && d < 6.5 && fac > 0.7) || ((id === 'sour' || id === 'geyser' || id === 'fizz') && d < 2.6)
      || (id === 'shield' && me.hp < 80 && d < 3) || (id === 'rage' && d < 5) || (id === 'nova' && d < 3.2) || (id === 'bounce' && d < 5 && fac > 0.7) || (id === 'caramel' && d < 3) || (id === 'boba' && d < 5) || (id === 'blackhole' && d < 5.5 && fac > 0.6)) br.pendingSkill = rand(0.05, 0.25) * (1.4 - br.skill);
  }
  if (me.hp < 30 && Math.random() < br.caution * 0.25 && d < 3) br.goal = { x: me.x - ux * 3, z: me.z - uz * 3 }; // back off when hurt
}

const NAMES = ['Gumdrop', 'Sir Wobble', 'Captain Gummy', 'Lady Pudding', 'Boba Bop', 'Mochi Max', 'Jellybean Jo', 'Sprinkles', 'Marshmallow', 'Taffy Tim', 'Cupcake Kid', 'Licorice Lu', 'Caramel Cat', 'Jam Jam', 'Fudge Fox', 'Lolli Pop', 'Bonbon', 'Waffle Wu', 'Peachy Pip', 'Minty Mo'];   // jelly-world NPC names (clearly not real player handles)
const FLAGS = ['NL', 'DE', 'KR', 'JP', 'FR', 'BR', 'US', 'GB', 'ES', 'IT', 'PL', 'SE', 'TR', 'MX'];
export function botProfile(used, nearTrophies) {
  const bans = (() => { try { return JSON.parse(localStorage.getItem('jellybattle_admin'))?.banned || []; } catch { return []; } })();
  let n, k = 0; do n = NAMES[(Math.random() * NAMES.length) | 0]; while ((used.has(n) || bans.includes(n)) && k++ < 80); used.add(n);
  return { name: n, flag: FLAGS[(Math.random() * FLAGS.length) | 0], trophies: Math.max(0, Math.round(nearTrophies + rand(-35, 45))) };
}
