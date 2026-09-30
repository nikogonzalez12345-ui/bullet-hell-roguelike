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
  dashSpeed: 780,
  dashDuration: 0.16,    // seconds
  dashCooldown: 1.1,     // seconds
  dashIframes: 0.22,     // seconds of invulnerability after dash starts
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
