// Global tunables. Kept in one place so balancing is a config edit, not a code hunt.

const CANVAS_W = 960;
const CANVAS_H = 600;

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
  rollSpins: 2.5,        // full rotations per second while rolling
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

// Character palette — used by sprites.js to render the procedural chibi
// pixel-art figures. Kept separate from COLORS (which is mostly bullets/UI).
const PALETTES = {
  player:  { skin: "#ffd9b3", hair: "#7dd3ff", hairDark: "#4fa8d9", body: "#2b2f4a", bodyAccent: "#7dd3ff", eye: "#12141f" },
  grunt:   { skin: "#e8b48a", hair: "#c0392b", hairDark: "#7a1f16", body: "#5a1f1f", bodyAccent: "#ff6b6b", eye: "#12141f" },
  shooter: { skin: "#e8b48a", hair: "#ff9b3b", hairDark: "#b3611a", body: "#4a2e12", bodyAccent: "#ff9b3b", eye: "#12141f" },
  sniper:  { skin: "#cdb8e0", hair: "#c46bff", hairDark: "#7a3bab", body: "#2a1a3a", bodyAccent: "#c46bff", eye: "#ffffff" },
  orbiter: { skin: "#ffd9ef", hair: "#ff6bd0", hairDark: "#b33d92", body: "#3a1a30", bodyAccent: "#ff6bd0", eye: "#ffffff" },
  boss_oni:     { skin: "#e0574a", hair: "#2a1a1a", hairDark: "#000000", body: "#3a0f0f", bodyAccent: "#ff2b4d", eye: "#ffe066", horn: "#f2e6c8" },
  boss_kitsune: { skin: "#fff3e6", hair: "#ffffff", hairDark: "#e0b3d9", body: "#8a2a5a", bodyAccent: "#ff9bd6", eye: "#ff3b6b", tail: "#ffffff" },
  boss_dragon:  { skin: "#2fb8a8", hair: "#0d3d38", hairDark: "#062421", body: "#0f4a44", bodyAccent: "#2fe6c8", eye: "#ffea3b", horn: "#d9f2ee" },
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
