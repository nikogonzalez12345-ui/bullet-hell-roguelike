// Enemy bullet patterns — this is where "bullet hell" actually happens.
// Each function pushes Bullet instances (owner: "enemy") into the shared array.

function spawnEnemyBullet(bullets, x, y, angle, opts = {}) {
  const speed = opts.speed || ENEMY_BULLET.baseSpeed;
  bullets.push(new Bullet({
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: opts.radius || ENEMY_BULLET.radius,
    damage: (opts.damage || ENEMY_BULLET.damage) * INTENSITY.damage,
    owner: "enemy",
    color: opts.color || COLORS.enemyBullet,
    life: opts.life || 6,
    homing: opts.homing || 0,
    target: opts.target || null,
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

  // Boss 1 — Oni Brute: brute-force rings, a 3-arm spiral, and aimed spreads
  // that all get denser as HP drops.
  oniPattern(enemy, player, bullets) {
    const hpPct = enemy.hp / enemy.maxHp;
    const phase = Math.floor(performance.now() / 2600) % 3;

    if (phase === 0) {
      const count = hpPct < 0.4 ? 20 : 14;
      const offset = rand(0, Math.PI * 2);
      for (let i = 0; i < count; i++) {
        const angle = offset + (i / count) * Math.PI * 2;
        spawnEnemyBullet(bullets, enemy.x, enemy.y, angle, { speed: 140, color: "#ff8a3b" });
      }
    } else if (phase === 1) {
      enemy._spiralAngle = (enemy._spiralAngle || 0) + 0.5;
      for (let i = 0; i < 3; i++) {
        const angle = enemy._spiralAngle + i * ((Math.PI * 2) / 3);
        spawnEnemyBullet(bullets, enemy.x, enemy.y, angle, { speed: 170, color: "#ff2b4d" });
      }
    } else {
      const base = angleTo(enemy.x, enemy.y, player.x, player.y);
      const count = hpPct < 0.4 ? 7 : 5;
      const spread = 0.5;
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0 : i / (count - 1) - 0.5;
        spawnEnemyBullet(bullets, enemy.x, enemy.y, base + t * spread, { speed: 210, color: "#ffd23b" });
      }
    }
  },

  // Oni landing shockwave: a tight, fast ring at chest height — jump it.
  oniSlam(enemy, player, bullets) {
    const count = 28;
    const offset = rand(0, Math.PI * 2);
    for (let i = 0; i < count; i++) {
      const angle = offset + (i / count) * Math.PI * 2;
      spawnEnemyBullet(bullets, enemy.x, enemy.y, angle, { speed: 230, color: "#ffb03a", radius: 6 });
    }
  },

  // Boss 2 — Kitsune Spirit: fox-fire volleys that gently home in on the
  // player, interleaved with a wide illusion ring.
  kitsunePattern(enemy, player, bullets) {
    const hpPct = enemy.hp / enemy.maxHp;
    const phase = Math.floor(performance.now() / 2200) % 2;

    if (phase === 0) {
      const count = hpPct < 0.5 ? 5 : 3;
      for (let i = 0; i < count; i++) {
        const angle = rand(0, Math.PI * 2);
        spawnEnemyBullet(bullets, enemy.x, enemy.y, angle, {
          speed: 120, color: "#ffb3ec", homing: 1.6, target: player, life: 5,
        });
      }
    } else {
      const count = 16;
      const offset = rand(0, Math.PI * 2);
      for (let i = 0; i < count; i++) {
        const angle = offset + (i / count) * Math.PI * 2;
        spawnEnemyBullet(bullets, enemy.x, enemy.y, angle, { speed: 130, color: "#ff6bd0" });
      }
    }
  },

  // Boss 3 — Ryujin Dragon: a fast rotating spiral that thickens into a
  // full breath-weapon cone at low HP.
  dragonPattern(enemy, player, bullets) {
    const hpPct = enemy.hp / enemy.maxHp;
    enemy._spiralAngle = (enemy._spiralAngle || 0) + 0.35;
    const arms = hpPct < 0.4 ? 5 : 3;
    for (let i = 0; i < arms; i++) {
      const angle = enemy._spiralAngle + i * ((Math.PI * 2) / arms);
      spawnEnemyBullet(bullets, enemy.x, enemy.y, angle, { speed: 200, color: "#2fe6c8" });
    }
    if (Math.floor(performance.now() / 3000) % 3 === 0) {
      const base = angleTo(enemy.x, enemy.y, player.x, player.y);
      const cone = hpPct < 0.4 ? 9 : 6;
      for (let i = 0; i < cone; i++) {
        const t = cone === 1 ? 0 : i / (cone - 1) - 0.5;
        spawnEnemyBullet(bullets, enemy.x, enemy.y, base + t * 0.7, { speed: 260, color: "#ffea3b", damage: ENEMY_BULLET.damage * 1.2 });
      }
    }
  },
};
