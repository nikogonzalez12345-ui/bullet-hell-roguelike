// Global tunables. Kept in one place so balancing is a config edit, not a code hunt.

// HUD overlay size (the 3D view sits inside it, letterboxed).
const CANVAS_W = 960;
const CANVAS_H = 600;
const VIEW_TOP = 30;
const VIEW_H = 540;

// Gameplay still simulates on a flat 2D plane in "sim units" (the old pixel
// scale, so all speed/range tuning carries over). WORLD_SCALE converts sim
// units to Three.js world units: sim (x, y) -> world (x, z).
const ARENA_RADIUS = 1500;
const WORLD_SCALE = 0.05;

// Internal render resolution — the PS1 look depends on this being tiny.
const RENDER_W = 320;
const RENDER_H = 180;

const PLAYER = {
  radius: 12,
  baseSpeed: 230,        // px/sec
  baseHp: 100,
  baseFireRate: 4.5,     // shots/sec
  baseDamage: 10,
  baseBulletSpeed: 520,
  baseBulletRadius: 4,
  pierce: 0,
  multishot: 1,          // extra projectiles beyond the first
  spreadDeg: 8,          // angle between multishot projectiles
  rollSpeed: 780,
  rollDuration: 0.16,    // seconds
  rollCooldown: 1.1,     // seconds
  rollIframes: 0.22,     // seconds of invulnerability after roll starts
  hitIframes: 0.5,       // brief invulnerability after taking damage
  pickupRadius: 80,      // XP gems start flying to you inside this range
  regenPerSec: 0,
  backpackSlots: 6,
  maxBackpackSlots: 30,
};

const ENEMY_BULLET = {
  baseSpeed: 190,
  radius: 5,
  damage: 12,
};

// The run's internal clock drives difficulty instead of waves.
const DIRECTOR = {
  baseSpawnRate: 0.55,     // enemies/sec at 0:00
  spawnRateGrowth: 0.012,  // + enemies/sec per second survived
  baseCap: 25,             // max enemies alive at 0:00…
  capGrowth: 1 / 6,        // …+1 per 6s
  maxCap: 110,
  bossEvery: 180,          // seconds
  swarmEvery: 60,
  firstSwarm: 40,
  spawnMin: 480,           // spawn ring around the player (sim units)
  spawnMax: 680,
  leashDistance: 1100,     // non-boss enemies further than this get recycled closer
};

const XP = {
  // XP needed to go from `level` to `level + 1`.
  toNext: (level) => Math.floor(6 + level * 4 + Math.pow(level, 1.6)),
  gemTiers: [
    { min: 10, color: "#c05aff", size: 1.6 },
    { min: 3, color: "#4a9aff", size: 1.25 },
    { min: 0, color: "#8fe04a", size: 1 },
  ],
};

const RARITIES = [
  { id: "common",    name: "Common",    color: "#c8c0b0", weight: 60, affixes: 0, mult: 1.0 },
  { id: "uncommon",  name: "Uncommon",  color: "#6fce4a", weight: 25, affixes: 1, mult: 1.15 },
  { id: "rare",      name: "Rare",      color: "#4a9aff", weight: 10, affixes: 2, mult: 1.35 },
  { id: "epic",      name: "Epic",      color: "#c05aff", weight: 4,  affixes: 3, mult: 1.6 },
  { id: "legendary", name: "Legendary", color: "#ff8a1e", weight: 1,  affixes: 4, mult: 2.0 },
];

// Soft lock-on: enemies within `cone` radians of the aim line (plus their own
// angular size) with a clear line of fire get targeted.
const AIM = {
  cone: 0.12,
  range: 760,
  blockCheck: 220, // how far ahead to look for a tree/rock in the line of fire
};

const LOOT = {
  itemDropChance: 0.045,
  potionDropChance: 0.03,
  bossItemDrops: 3,
  pickupRange: 36,
};

const COLORS = {
  enemyGrunt: "#ff6b6b",
  enemyShooter: "#ff9b3b",
  enemySniper: "#c46bff",
  enemyOrbiter: "#ff6bd0",
  enemyBoss: "#ff2b4d",
  enemyBullet: "#ffd23b",
};

// Pixel UI palette, pulled from the sunset island: ink outlines, maroon
// panels, cream text, sunset reds/oranges, grass greens.
const UI = {
  ink: "#1a0a10",
  panel: "#2a1420",
  panelLight: "#4a2430",
  cream: "#ffe9c0",
  muted: "#b89a8a",
  gold: "#ffcf5c",
  font: "'Press Start 2P', monospace",
  hp:     { fill: "#d83a22", light: "#ff8a4a", dark: "#7a1418" },
  energy: { fill: "#f0a81e", light: "#ffe07a", dark: "#9a5a10" },
  xp:     { fill: "#6fae3a", light: "#c8e67a", dark: "#2e5220" },
  boss:   { fill: "#b82a4a", light: "#ff6a8a", dark: "#5a0a20" },
};

// Weapon archetypes the player can unlock through upgrades. Each fires
// independently on its own cooldown, scaled by the player's global
// fireRate/damage stats so generic upgrades still matter.
const WEAPONS = {
  pistol: {
    id: "pistol", name: "Pistol", icon: "•",
    fireRateMul: 1, damageMul: 1,
    color: "#a3f7ff",
  },
  shotgun: {
    id: "shotgun", name: "Shotgun", icon: "»",
    fireRateMul: 0.45, damageMul: 0.4,
    pellets: 5, spreadDeg: 32, life: 0.35,
    color: "#ffcf5c",
  },
  smg: {
    id: "smg", name: "SMG", icon: "≡",
    fireRateMul: 2.6, damageMul: 0.32,
    jitterDeg: 6,
    color: "#c9ff5c",
  },
  laser: {
    id: "laser", name: "Laser", icon: "‖",
    fireRateMul: 0.8, damageMul: 0.85,
    pierce: 3, speedMul: 1.8, radiusMul: 0.6,
    color: "#e6f7ff",
  },
  missile: {
    id: "missile", name: "Missile", icon: "✷",
    fireRateMul: 0.3, damageMul: 2.4,
    speedMul: 0.55, radiusMul: 1.8, homing: 4.2,
    color: "#ff8a5b",
  },
};
