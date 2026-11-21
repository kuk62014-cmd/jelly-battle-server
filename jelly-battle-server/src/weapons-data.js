// Pure weapon definitions shared by sim, bots and UI.
// type: slam (overhead smash, ground AoE) | swing (horizontal arc) | thrust (long poke)
//       shoot (projectile) | spread (3 projectiles) | lob (arcing explosive)
export const WEAPONS = [
  { id: 'mallet', rarity: 'common', name: 'Jelly Mallet', type: 'slam', starter: true, price: 0, dmg: 27, kb: 11, cd: 0.7, wind: 0.2, reach: 1.4, aoe: 1.2, stun: 0.3,
    desc: 'Overhead smash. Hits everything in front.' },
  { id: 'bat', rarity: 'common', name: 'Gummy Bat', type: 'swing', starter: true, price: 0, dmg: 24, kb: 11, cd: 0.35, wind: 0.1, reach: 1.65, arc: 1.5, stun: 0.18,
    desc: 'Fast sweeping swings.' },
  { id: 'blaster', rarity: 'common', name: 'Bean Blaster', type: 'shoot', starter: true, price: 0, dmg: 3.95, kb: 4.3, cd: 0.28, wind: 0.04, speed: 18, range: 8.6, stun: 0.08,
    desc: 'Rapid jellybean shots from afar.' },
  { id: 'spear', rarity: 'rare', name: 'Candy Cane Spear', type: 'thrust', price: 250, dmg: 20, kb: 11, cd: 0.55, wind: 0.13, reach: 2.6, stun: 0.22,
    desc: 'Long poke. Keep them at a distance.' },
  { id: 'daggers', rarity: 'common', name: 'Candy Shiv', type: 'swing', price: 300, dmg: 27, kb: 9, cd: 0.2, wind: 0.05, reach: 1.75, arc: 1.0, stun: 0.08,
    desc: 'Super fast stabs. Stay close.' },
  { id: 'pan', rarity: 'rare', name: 'Choco Pan', type: 'swing', price: 350, dmg: 38, kb: 11, cd: 0.45, wind: 0.13, reach: 1.45, arc: 1.2, stun: 0.75,
    desc: 'BONG! Long stun on every hit.' },
  { id: 'mace', rarity: 'epic', name: 'Lollipop Mace', type: 'slam', price: 400, dmg: 31, kb: 12, cd: 0.95, wind: 0.32, reach: 1.5, aoe: 1.35, stun: 0.4,
    desc: 'Heavy smash with a big shockwave.' },
  { id: 'whip', rarity: 'rare', name: 'Licorice Whip', type: 'swing', price: 400, dmg: 15, kb: 9, cd: 0.7, wind: 0.16, reach: 2.4, arc: 1.5, stun: 0.2,
    desc: 'Huge reach, wide crack.' },
  { id: 'cannon', rarity: 'epic', name: 'Cupcake Cannon', type: 'spread', price: 450, dmg: 3.7, kb: 5.5, cd: 0.9, wind: 0.08, speed: 14, range: 6, stun: 0.12,
    desc: 'Three cupcakes at once. Brutal up close.' },
  { id: 'glove', rarity: 'epic', name: 'Gummy Bear Glove', type: 'thrust', price: 450, dmg: 31, kb: 16, cd: 0.76, wind: 0.13, reach: 1.95, stun: 0.3,
    desc: 'Massive knockback punch.' },
  { id: 'bazooka', rarity: 'legendary', name: 'Bubblegum Bazooka', type: 'rocket', price: 500, dmg: 12.5, kb: 9.5, cd: 1.35, wind: 0.1, speed: 13, range: 8, aoe: 1.35, stun: 0.3,
    desc: 'Gum rocket that pops on impact. Big boom.' },
  { id: 'mega', rarity: 'legendary', name: 'Marshmallow XL', type: 'slam', price: 650, dmg: 32, kb: 13.5, cd: 1.5, wind: 0.42, reach: 1.7, aoe: 1.7, stun: 0.5,
    desc: 'Enormous. Slow. Devastating.' },
  { id: 'axe', rarity: 'rare', name: 'Taffy Axe', type: 'swing', price: 350, dmg: 30, kb: 11.5, cd: 0.52, wind: 0.13, reach: 1.65, arc: 1.35, stun: 0.25, desc: 'Heavy taffy cleave in a wide arc.' },
  { id: 'donut', rarity: 'rare', name: 'Donut Disc', type: 'shoot', price: 350, dmg: 5.2, kb: 6, cd: 0.62, wind: 0.06, speed: 14, range: 8, stun: 0.12, desc: 'Fling frosted donuts across the arena.' },
  { id: 'churro', rarity: 'epic', name: 'Churro Saber', type: 'swing', price: 450, dmg: 21.5, kb: 9, cd: 0.38, wind: 0.09, reach: 1.75, arc: 1.3, stun: 0.18, desc: 'Crispy, cinnamon-dusted slashes.' },
  { id: 'sprinkle', rarity: 'epic', name: 'Sprinkle Shotgun', type: 'spread', price: 450, dmg: 4.4, kb: 5.9, cd: 0.82, wind: 0.08, speed: 16, range: 6.6, stun: 0.12, desc: 'A rainbow burst of sprinkles.' },
  { id: 'lance', rarity: 'legendary', name: 'Ice Pop Lance', type: 'thrust', price: 600, dmg: 20, kb: 10.5, cd: 0.75, wind: 0.14, reach: 2.6, stun: 0.25, desc: 'Frozen reach that skewers from afar.' },
  { id: 'flail', rarity: 'mythic', name: 'Jawbreaker Flail', type: 'slam', price: 800, dmg: 30, kb: 13.5, cd: 1.2, wind: 0.3, reach: 1.7, aoe: 1.6, stun: 0.4, desc: 'A rock-hard candy wrecking ball.' },
  { id: 'wand', rarity: 'mythic', name: 'Cotton Candy Wand', type: 'cloud', price: 800, dmg: 15, kb: 9, cd: 1.15, wind: 0.12, range: 7.5, aoe: 2.0, stun: 0.35, desc: 'Summon a sugar cloud where you aim. It bursts and slows.' },
  { id: 'scythe', rarity: 'secret', name: 'Galaxy Scythe', type: 'swing', price: 1000, dmg: 21, kb: 11, cd: 0.55, wind: 0.12, reach: 2.0, arc: 1.6, stun: 0.2, desc: 'Reaps a sweeping crescent of stardust.' },
  { id: 'thunder', rarity: 'secret', name: 'Thunder Lollipop', type: 'thunder', price: 1000, dmg: 25, kb: 12.5, cd: 1.15, wind: 0.24, reach: 1.6, aoe: 1.6, range: 8, stun: 0.1, desc: 'Smashes up close, calls lightning on far targets.' },
];
export const WMAP = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));
export const STARTERS = WEAPONS.filter((w) => w.starter).map((w) => w.id);
export const isRanged = (w) => w.type === 'shoot' || w.type === 'spread' || w.type === 'lob' || w.type === 'rocket' || w.type === 'cloud';

// stat bars for UI (0..1)
export function statBars(w) {
  const dps = w.dmg / w.cd;
  return {
    Damage: Math.min(1, w.dmg / 38),
    Speed: Math.min(1, 0.2 / w.cd * 1.6),
    Range: Math.min(1, (isRanged(w) || w.type === 'thunder' ? w.range : w.reach + (w.aoe || 0) * 0.6) / 9),
    Knock: Math.min(1, w.kb / 15),
    dps,
  };
}
