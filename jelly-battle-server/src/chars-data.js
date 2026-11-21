// Pure character + rarity data (shared by sim, bots, UI, gacha).
export const RARITY = {
  common: { name: 'Common', color: '#8fa3bf', weight: 55, mul: 1.0, dupe: 20 },
  rare: { name: 'Rare', color: '#3fa8ff', weight: 28, mul: 1.06, dupe: 50 },
  epic: { name: 'Epic', color: '#a66bff', weight: 12, mul: 1.12, dupe: 120 },
  legendary: { name: 'Legendary', color: '#ffb31a', weight: 4, mul: 1.18, dupe: 300 },
  mythic: { name: 'Mythic', color: '#ff3d6e', weight: 1, mul: 1.24, dupe: 600 },
  secret: { name: 'Secret', color: '#28e0ff', weight: 0.1, mul: 1.3, dupe: 1500 },
};
export const RORDER = ['common', 'rare', 'epic', 'legendary', 'mythic', 'secret'];

// shape = body scale (x width, y height, z depth); face = drawing style
export const CHARS = [
  { id: 'berry', name: 'Berry', title: 'The Brave', rarity: 'common', starter: true, shape: [0.72, 0.84, 0.70], face: 'fierce',
    skill: { id: 'rush', name: 'Berry Rush', desc: 'Meteor charge: a 3-hit flurry that sets enemies on fire.', charge: 100 } },
  { id: 'lemon', name: 'Lemo', title: 'The Sour Sleepyhead', rarity: 'common', shape: [0.80, 0.78, 0.78], face: 'sleepy',
    skill: { id: 'sour', name: 'Sour Splash', desc: 'Squirt sour juice all around. Enemies get slowed.', charge: 95 } },
  { id: 'soda', name: 'Fizz', title: 'The Hyper Bubble', rarity: 'rare', shape: [0.68, 0.92, 0.66], face: 'cheer',
    skill: { id: 'fizz', name: 'Fizz Rocket', desc: 'Rocket onto the nearest jelly with a soda splash, then zoom.', charge: 100 } },
  { id: 'melon', name: 'Mel', title: 'The Chill Tank', rarity: 'rare', shape: [0.82, 0.82, 0.80], face: 'calm',
    skill: { id: 'shield', name: 'Rind Shield', desc: 'Harden up and heal 30% HP over 3.5s.', charge: 105 } },
  { id: 'mochi', name: 'Mochi', title: 'The Bouncy Buddy', rarity: 'rare', shape: [0.80, 0.74, 0.78], face: 'dreamy',
    skill: { id: 'bounce', name: 'Mochi Hop', desc: 'Three big bounces forward, each landing squishes everyone nearby.', charge: 95 } },
  { id: 'grape', name: 'Grapo', title: 'The Smug Sniper', rarity: 'epic', shape: [0.70, 0.80, 0.68], face: 'smug',
    skill: { id: 'grapeshot', name: 'Grape Shot', desc: 'Fire a wide fan of seven bouncy grapes.', charge: 100 } },
  { id: 'cola', name: 'Coco', title: 'The Wild Fizz', rarity: 'epic', shape: [0.72, 0.90, 0.70], face: 'grin',
    skill: { id: 'geyser', name: 'Cola Geyser', desc: 'ERUPT! Then three minty candies blow up around you.', charge: 100 } },
  { id: 'pudding', name: 'Pud', title: 'The Wobbly Chef', rarity: 'epic', shape: [0.78, 0.80, 0.76], face: 'cat',
    skill: { id: 'caramel', name: 'Caramel Trap', desc: 'Drop a giant pudding into a sticky caramel lake. Stand in it for +35% damage.', charge: 100 } },
  { id: 'rainbow', name: 'Prisma', title: 'The Legend', rarity: 'legendary', shape: [0.74, 0.86, 0.72], face: 'star',
    skill: { id: 'rage', name: 'Rainbow Rage', desc: 'Become HUGE, fast and powerful for 4 seconds.', charge: 130 } },
  { id: 'boba', name: 'Boba', title: 'The Pearl Boss', rarity: 'legendary', shape: [0.72, 0.90, 0.72], face: 'shy',
    skill: { id: 'boba', name: 'Boba Barrage', desc: 'Spin and spray a spiral of chewy tapioca pearls.', charge: 110 } },
  { id: 'nova', name: 'Nova', title: 'The Star Dragon', rarity: 'mythic', shape: [0.76, 0.88, 0.74], face: 'wink',
    skill: { id: 'nova', name: 'Supernova', desc: 'Crash down as a star, then glow: 80% block, faster attacks.', charge: 125 } },
  { id: 'void', name: 'Void', title: 'The Unknown', rarity: 'secret', shape: [0.74, 0.86, 0.72], face: 'hollow',
    skill: { id: 'blackhole', name: 'Black Hole', desc: 'Open a black hole that sucks everyone in, then implodes.', charge: 140 } },
];
export const CMAP = Object.fromEntries(CHARS.map((c) => [c.id, c]));
