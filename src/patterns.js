// Enemy bullet patterns — this is where "bullet hell" actually happens.
// Each function pushes Bullet instances (owner: "enemy") into the shared array.

function spawnEnemyBullet(bullets, x, y, angle, opts = {}) {
  const speed = opts.speed || ENEMY_BULLET.baseSpeed;
  bullets.push(new Bullet({
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: opts.radius || ENEMY_BULLET.radius,
    damage: opts.damage || ENEMY_BULLET.damage,
    owner: "enemy",
    color: opts.color || COLORS.enemyBullet,
    life: opts.life || 6,
  }));
}

function firePattern(name, enemy, player, bullets) {
  PATTERNS[name](enemy, player, bullets);
}

const PATTERNS = {
  // 3-round burst aimed at the player, slight spread
  aimedBurst(enemy, player, bullets) {
    const base = angleTo(enemy.x, enemy.y, player.x, player.y);
    const spread = 0.16;
    for (let i = -1; i <= 1; i++) {
      spawnEnemyBullet(bullets, enemy.x, enemy.y, base + i * spread);
    }
  },

  // Single fast, precise shot — telegraphed by a brief pause (handled via fireInterval)
  sniperShot(enemy, player, bullets) {
    const angle = angleTo(enemy.x, enemy.y, player.x, player.y);
    spawnEnemyBullet(bullets, enemy.x, enemy.y, angle, {
      speed: ENEMY_BULLET.baseSpeed * 2.1,
      radius: 4,
      color: "#ff5b9c",
      damage: ENEMY_BULLET.damage * 1.3,
    });
  },

  // Full-circle burst — classic bullet-hell ring
  radialBurst(enemy, player, bullets) {
    const count = 14;
    const offset = rand(0, Math.PI * 2);
    for (let i = 0; i < count; i++) {
      const angle = offset + (i / count) * Math.PI * 2;
      spawnEnemyBullet(bullets, enemy.x, enemy.y, angle, { speed: 150 });
    }
  },

  // Boss: rotates between a ring burst, a spiral, and an aimed spread — escalates with lower hp
  bossPattern(enemy, player, bullets) {
    const hpPct = enemy.hp / enemy.maxHp;
    const phase = Math.floor(performance.now() / 2600) % 3;

    if (phase === 0) {
      // Expanding ring
      const count = hpPct < 0.4 ? 20 : 14;
      const offset = rand(0, Math.PI * 2);
      for (let i = 0; i < count; i++) {
        const angle = offset + (i / count) * Math.PI * 2;
        spawnEnemyBullet(bullets, enemy.x, enemy.y, angle, { speed: 140, color: "#ff8a3b" });
      }
    } else if (phase === 1) {
      // Spiral arm
      enemy._spiralAngle = (enemy._spiralAngle || 0) + 0.5;
      for (let i = 0; i < 3; i++) {
        const angle = enemy._spiralAngle + i * ((Math.PI * 2) / 3);
        spawnEnemyBullet(bullets, enemy.x, enemy.y, angle, { speed: 170, color: "#ff2b4d" });
      }
    } else {
      // Aimed spread at player, denser at low hp
      const base = angleTo(enemy.x, enemy.y, player.x, player.y);
      const count = hpPct < 0.4 ? 7 : 5;
      const spread = 0.5;
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0 : i / (count - 1) - 0.5;
        spawnEnemyBullet(bullets, enemy.x, enemy.y, base + t * spread, { speed: 210, color: "#ffd23b" });
      }
    }
  },
};
