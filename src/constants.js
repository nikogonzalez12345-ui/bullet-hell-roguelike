// Global tunables. Kept in one place so balancing is a config edit, not a code hunt.

// HUD overlay size (the 3D view sits inside it, letterboxed).
const CANVAS_W = 960;
const CANVAS_H = 600;
const VIEW_TOP = 30;
const VIEW_H = 540;

// Gameplay still simulates on a flat 2D plane in "sim units" (the old pixel
// scale, so all speed/range tuning carries over). WORLD_SCALE converts sim
// units to Three.js world units: sim (x, y) -> world (x, z).
const ARENA_RADIUS = 520;
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
  magnetRadius: 0,
  regenPerSec: 0,
};

const ENEMY_BULLET = {
  baseSpeed: 190,
  radius: 5,
  damage: 12,
};

const WAVE = {
  baseEnemyCount: 6,
  enemyCountGrowth: 2.1,   // additive per wave
  baseSpawnInterval: 0.9,  // seconds between spawns within a wave
  spawnIntervalFloor: 0.28,
  bossEvery: 5,
};

const COLORS = {
  player: "#7dd3ff",
  playerDash: "#ffffff",
  playerBullet: "#a3f7ff",
  enemyGrunt: "#ff6b6b",
  enemyShooter: "#ff9b3b",
  enemySniper: "#c46bff",
  enemyOrbiter: "#ff6bd0",
  enemyBoss: "#ff2b4d",
  enemyBullet: "#ffd23b",
  xpGem: "#7dffb3",
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
