// Global tunables. Kept in one place so balancing is a config edit, not a code hunt.

// Logical screen size in "UI pixels". The game fills the whole window, so
// these are recomputed on resize (see setViewport): the shorter side is at
// least 960x600 UI pixels and everything is scaled up to the real window.
const MIN_UI_W = 960;
const MIN_UI_H = 600;
let CANVAS_W = MIN_UI_W;
let CANVAS_H = MIN_UI_H;
let VIEW_TOP = 0;
let VIEW_H = CANVAS_H;

// Internal 3D render resolution: ~420 lines (Tomb Raider-era 640x480 feel)
// rather than raw-PS1 240, so things stay readable; width follows the
// window's aspect ratio. The PS1 vertex wobble still snaps to a 320x240 grid.
const RENDER_SCALE = 0.7;
let RENDER_W = 320;
let RENDER_H = 180;

function setViewport(windowW, windowH) {
  const s = Math.min(windowW / MIN_UI_W, windowH / MIN_UI_H);
  CANVAS_W = Math.round(windowW / s);
  CANVAS_H = Math.round(windowH / s);
  VIEW_TOP = 0;
  VIEW_H = CANVAS_H;
  RENDER_W = Math.round(CANVAS_W * RENDER_SCALE);
  RENDER_H = Math.round(CANVAS_H * RENDER_SCALE);
  return s;
}

// Gameplay still simulates on a flat 2D plane in "sim units" (the old pixel
// scale, so all speed/range tuning carries over). WORLD_SCALE converts sim
// units to Three.js world units: sim (x, y) -> world (x, z).
const ARENA_RADIUS = 2400;
const WORLD_SCALE = 0.05;

// The run moves through four biomes as the clock advances. A stage change
// waits for any living boss to die first.
const STAGES = [
  { biome: "sunset", name: "SUNSET ISLE", start: 0 },
  { biome: "night",  name: "NIGHTFALL",   start: 240 },
  { biome: "cave",   name: "THE DEPTHS",  start: 480 },
  { biome: "hell",   name: "INFERNO",     start: 720 },
];

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
  rollDistance: 115,     // sim units from the roll's burst (plus a little walk carry)
  rollDuration: 0.3,     // seconds — long enough to read as a real tuck-and-roll
  // Stamina (the EN bar) powers sprinting and rolling.
  maxStamina: 100,
  staminaRegen: 30,      // per second, after a short pause
  staminaDelay: 0.5,     // seconds after spending before it refills
  sprintDrain: 24,       // per second while sprinting
  rollCost: 32,
  rollMinGap: 0.35,      // seconds between rolls even with stamina to spare
  winded: 25,            // drained to 0 -> no sprinting until back above this
  rollIframes: 0.26,     // seconds of invulnerability after roll starts
  accel: 22,             // how quickly movement reaches full speed (1/sec)
  sprintMul: 1.45,       // hold Shift
  hitIframes: 0.5,       // brief invulnerability after taking damage
  pickupRadius: 80,      // XP gems start flying to you inside this range
  regenPerSec: 0,
  backpackSlots: 6,
  maxBackpackSlots: 30,
  maxPotions: 3,         // potions live on their own belt, not in the backpack
};

// Jumping (player and enemies), in world units. Anything whose feet are above
// `clear` is over the bullets (which fly at BULLET_HEIGHT) — shots and body
// contact pass underneath.
const JUMP = {
  velocity: 8,
  gravity: 24,     // apex ~1.33, airtime ~0.67s
  clear: 0.55,
};

const ENEMY_BULLET = {
  baseSpeed: 190,
  radius: 5,
  damage: 12,
};

// The run's internal clock drives difficulty instead of waves.
const DIRECTOR = {
  baseSpawnRate: 0.8,      // enemies/sec at 0:00
  spawnRateGrowth: 0.019,  // + enemies/sec per second survived
  baseCap: 34,             // max enemies alive at 0:00…
  capGrowth: 1 / 4.8,      // …+1 per 4.8s
  maxCap: 145,
  hpBase: 1.1,             // enemy HP multiplier at 0:00, growing as
  hpLinear: 110,           //   1 + t/hpLinear + (t/hpQuad)^2 (seconds)
  hpQuad: 320,
  // Adaptive scaling: if the player's damage output outgrows the expected
  // curve (1 + t/powerLinear + (t/powerQuad)^2), enemy HP absorbs part of
  // the lead: x (lead ^ catchUpExp), capped at catchUpMax.
  powerLinear: 40,
  powerQuad: 140,
  catchUpExp: 0.6,
  catchUpMax: 5,
  eliteFrom: 120,          // elites (gold, ~3x HP, better drops) appear after this…
  eliteChance: [0.02, 0.12], // …at this chance, ramping to the max over ~10 min
  dmgBase: 1.06,           // enemy damage multiplier at 0:00…
  dmgPerSec: 1 / 250,
  bossEvery: 180,          // seconds between returning bosses in the last stage
  stageBossAt: 150,        // each stage's boss arrives this long into the stage
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
};

const LOOT = {
  itemDropChance: 0.036,
  weaponDropChance: 0.016,
  potionDropChance: 0.008,
  bossItemDrops: 3,
  pickupRange: 36,
};

const COLORS = {
  enemyGrunt: "#ff6b6b",
  enemyShooter: "#ff5a8a",
  enemySniper: "#c46bff",
  enemyOrbiter: "#ff6bd0",
  enemyBoss: "#ff2b4d",
  enemyBullet: "#ffd23b",
};

// Pixel UI palette, pulled from the sunset island: ink outlines, maroon
// panels, cream text, sunset reds/oranges, grass greens.
const UI = {
  // Angelic HUD: ivory and gold on deep celestial glass.
  ink: "#0e1230",          // deep celestial navy (troughs, outlines)
  shadow: "rgba(8, 10, 30, 0.88)",
  panel: "#1a2048",
  panelLight: "#2c3468",
  cream: "#fff6e2",        // ivory text
  muted: "#b8b4d0",        // lavender grey
  gold: "#f0cf7e",
  goldLight: "#fff0c2",
  font: "'Cinzel', 'Times New Roman', serif",
  hp:     { fill: "#ff6f8e", light: "#ffd6df", dark: "#8a1e3e" },
  energy: { fill: "#6fc4ff", light: "#e2f4ff", dark: "#1e4a8a" },
  xp:     { fill: "#e8b84a", light: "#fff2b8", dark: "#7a5410" },
  boss:   { fill: "#c8203e", light: "#ff8a9e", dark: "#4a0614" },
};
