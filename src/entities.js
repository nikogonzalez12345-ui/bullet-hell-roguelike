// Keep a circular body inside the island arena and out of trees/rocks.
function confineToArena(ent) {
  const d = Math.hypot(ent.x, ent.y);
  const max = ARENA_RADIUS - ent.radius;
  if (d > max) {
    ent.x *= max / d;
    ent.y *= max / d;
  }
  for (const o of OBSTACLES) {
    const dx = ent.x - o.x, dy = ent.y - o.y;
    const dd = Math.hypot(dx, dy);
    const min = o.r + ent.radius;
    if (dd < min && dd > 0.001) {
      ent.x = o.x + (dx / dd) * min;
      ent.y = o.y + (dy / dd) * min;
    }
  }
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

class Player {
  constructor() {
    this.x = 0;
    this.y = 120;
    this.radius = PLAYER.radius;

    // Stats — copied from constants so upgrades can mutate freely per-run.
    this.speed = PLAYER.baseSpeed;
    this.maxHp = PLAYER.baseHp;
    this.hp = this.maxHp;
    this.fireRate = PLAYER.baseFireRate;
    this.damage = PLAYER.baseDamage;
    this.bulletSpeed = PLAYER.baseBulletSpeed;
    this.bulletRadius = PLAYER.baseBulletRadius;
    this.pierce = PLAYER.pierce;
    this.multishot = PLAYER.multishot;
    this.spreadDeg = PLAYER.spreadDeg;
    this.rollSpeed = PLAYER.rollSpeed;
    this.rollDuration = PLAYER.rollDuration;
    this.rollCooldown = PLAYER.rollCooldown;
    this.regenPerSec = PLAYER.regenPerSec;
    this.magnetRadius = PLAYER.magnetRadius;

    this.weapons = ["pistol"];
    this.weaponCooldowns = { pistol: 0 };

    this.rollTimer = 0;      // >0 while rolling
    this.rollCooldownTimer = 0;
    this.rollDirX = 0;
    this.rollDirY = 0;
    this.iframeTimer = 0;    // >0 = invulnerable
    this.regenAccum = 0;

    this.alive = true;
    this.facing = 0; // radians, for aim indicator
    this.moving = false;
    this.animTime = 0;
  }

  get isRolling() { return this.rollTimer > 0; }
  get isInvulnerable() { return this.iframeTimer > 0; }
  get rollReady() { return this.rollCooldownTimer <= 0; }

  takeDamage(amount) {
    if (this.isInvulnerable || !this.alive) return false;
    this.hp -= amount;
    this.iframeTimer = PLAYER.hitIframes;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
    return true;
  }

  addWeapon(id) {
    if (this.weapons.includes(id)) return false;
    if (this.weapons.length >= MAX_EQUIPPED_WEAPONS) return false;
    this.weapons.push(id);
    this.weaponCooldowns[id] = 0;
    return true;
  }

  startRoll(dirX, dirY) {
    if (!this.rollReady) return;
    const len = Math.hypot(dirX, dirY) || 1;
    this.rollDirX = dirX / len;
    this.rollDirY = dirY / len;
    this.rollTimer = this.rollDuration;
    this.rollCooldownTimer = this.rollCooldown;
    this.iframeTimer = Math.max(this.iframeTimer, PLAYER.rollIframes);
  }

  update(dt, input) {
    if (!this.alive) return;

    this.animTime += dt;
    if (this.iframeTimer > 0) this.iframeTimer -= dt;
    if (this.rollCooldownTimer > 0) this.rollCooldownTimer -= dt;
    for (const id of this.weapons) {
      if (this.weaponCooldowns[id] > 0) this.weaponCooldowns[id] -= dt;
    }

    if (this.regenPerSec > 0 && this.hp < this.maxHp) {
      this.regenAccum += this.regenPerSec * dt;
      if (this.regenAccum >= 1) {
        const whole = Math.floor(this.regenAccum);
        this.hp = clamp(this.hp + whole, 0, this.maxHp);
        this.regenAccum -= whole;
      }
    }

    this.facing = input.yaw;

    if (this.rollTimer > 0) {
      this.rollTimer -= dt;
      this.x += this.rollDirX * this.rollSpeed * dt;
      this.y += this.rollDirY * this.rollSpeed * dt;
      this.moving = true;
    } else {
      // WASD is relative to where the camera is looking.
      const f = (input.up ? 1 : 0) - (input.down ? 1 : 0);
      const s = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const cy = Math.cos(input.yaw), sy = Math.sin(input.yaw);
      let mx = cy * f - sy * s;
      let my = sy * f + cy * s;
      this.moving = f !== 0 || s !== 0;
      if (this.moving) {
        const len = Math.hypot(mx, my);
        mx /= len; my /= len;
        this.x += mx * this.speed * dt;
        this.y += my * this.speed * dt;
      }

      if (input.dashPressed && this.rollReady) {
        let dx = mx, dy = my;
        if (dx === 0 && dy === 0) { dx = Math.cos(this.facing); dy = Math.sin(this.facing); }
        this.startRoll(dx, dy);
      }
    }

    confineToArena(this);
  }

  tryShoot(bullets, enemies) {
    for (const id of this.weapons) {
      if (this.weaponCooldowns[id] > 0) continue;
      const def = WEAPONS[id];
      this.weaponCooldowns[id] = 1 / (this.fireRate * def.fireRateMul);
      fireWeapon(id, this, bullets, enemies);
    }
  }
}

// ---------------------------------------------------------------------------
// Bullet — used for both player and enemy projectiles
// ---------------------------------------------------------------------------

class Bullet {
  constructor(opts) {
    this.x = opts.x;
    this.y = opts.y;
    this.vx = opts.vx;
    this.vy = opts.vy;
    this.radius = opts.radius;
    this.damage = opts.damage;
    this.pierce = opts.pierce || 0;
    this.owner = opts.owner; // "player" | "enemy"
    this.color = opts.color;
    this.life = opts.life || 4.5;
    this.dead = false;
    // Optional homing (used by some upgrades / enemy patterns)
    this.homing = opts.homing || 0; // turn rate, radians/sec, 0 = off
    this.target = opts.target || null;
    this.acc = opts.acc || 0; // acceleration along velocity, px/sec^2
  }

  update(dt) {
    if (this.homing && this.target && this.target.alive !== false) {
      const desired = angleTo(this.x, this.y, this.target.x, this.target.y);
      const current = Math.atan2(this.vy, this.vx);
      let diff = desired - current;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const maxTurn = this.homing * dt;
      const turn = clamp(diff, -maxTurn, maxTurn);
      const speed = Math.hypot(this.vx, this.vy);
      const newAngle = current + turn;
      this.vx = Math.cos(newAngle) * speed;
      this.vy = Math.sin(newAngle) * speed;
    }
    if (this.acc) {
      const speed = Math.hypot(this.vx, this.vy) + this.acc * dt;
      const angle = Math.atan2(this.vy, this.vx);
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
    if (Math.hypot(this.x, this.y) > ARENA_RADIUS + 200) this.dead = true;
    // Trees and rocks inside the arena are cover — they stop bullets.
    for (const o of OBSTACLES) {
      if (circleHit(this.x, this.y, this.radius, o.x, o.y, o.r)) {
        this.dead = true;
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Enemy
// ---------------------------------------------------------------------------

const ENEMY_DEFS = {
  grunt: {
    hp: 22, radius: 13, speed: 95, color: COLORS.enemyGrunt,
    contactDamage: 10, score: 10, behavior: "chase",
  },
  shooter: {
    hp: 30, radius: 14, speed: 60, color: COLORS.enemyShooter,
    contactDamage: 8, score: 18, behavior: "keepDistance",
    preferredRange: 220, fireInterval: 1.4, pattern: "aimedBurst",
  },
  sniper: {
    hp: 26, radius: 12, speed: 45, color: COLORS.enemySniper,
    contactDamage: 8, score: 22, behavior: "keepDistance",
    preferredRange: 320, fireInterval: 2.2, pattern: "sniperShot",
  },
  orbiter: {
    hp: 40, radius: 15, speed: 70, color: COLORS.enemyOrbiter,
    contactDamage: 10, score: 28, behavior: "orbit",
    preferredRange: 180, fireInterval: 1.8, pattern: "radialBurst",
  },
  boss_oni: {
    hp: 850, radius: 30, speed: 60, color: COLORS.enemyBoss,
    contactDamage: 20, score: 500, behavior: "boss",
    preferredRange: 240, fireInterval: 0.9, pattern: "oniPattern",
    name: "Oni Brute",
  },
  boss_kitsune: {
    hp: 1100, radius: 28, speed: 85, color: "#ff9bd6",
    contactDamage: 16, score: 650, behavior: "boss",
    preferredRange: 260, fireInterval: 0.8, pattern: "kitsunePattern",
    name: "Kitsune Spirit",
  },
  boss_dragon: {
    hp: 1400, radius: 32, speed: 70, color: "#2fe6c8",
    contactDamage: 22, score: 800, behavior: "boss",
    preferredRange: 250, fireInterval: 0.75, pattern: "dragonPattern",
    name: "Ryujin Dragon",
  },
};

const BOSS_CYCLE = ["boss_oni", "boss_kitsune", "boss_dragon"];

let enemyIdCounter = 1;

class Enemy {
  constructor(type, x, y, waveScale) {
    const def = ENEMY_DEFS[type];
    this.id = enemyIdCounter++;
    this.type = type;
    this.def = def;
    this.isBoss = type.startsWith("boss_");
    this.name = def.name || null;
    this.x = x;
    this.y = y;
    this.radius = def.radius;
    this.color = def.color;
    this.hp = Math.round(def.hp * waveScale);
    this.maxHp = this.hp;
    this.speed = def.speed;
    this.contactDamage = def.contactDamage;
    this.score = def.score;
    this.alive = true;
    this.fireTimer = rand(0.2, def.fireInterval || 1);
    this.orbitAngle = rand(0, Math.PI * 2);
    this.hitFlash = 0;
    this.telegraph = 0; // used by sniper wind-up
    this.animTime = rand(0, 10);
  }

  takeDamage(amount) {
    this.hp -= amount;
    this.hitFlash = 0.08;
    if (this.hp <= 0) this.alive = false;
    return !this.alive;
  }

  update(dt, player, bullets) {
    if (!this.alive) return;
    this.animTime += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;

    const d = dist(this.x, this.y, player.x, player.y);
    const toPlayerAngle = angleTo(this.x, this.y, player.x, player.y);

    switch (this.def.behavior) {
      case "chase": {
        this.x += Math.cos(toPlayerAngle) * this.speed * dt;
        this.y += Math.sin(toPlayerAngle) * this.speed * dt;
        break;
      }
      case "keepDistance": {
        const range = this.def.preferredRange;
        let moveAngle = toPlayerAngle;
        if (d < range - 20) moveAngle += Math.PI; // back off
        else if (d < range + 20) moveAngle = null; // hold
        if (moveAngle !== null) {
          this.x += Math.cos(moveAngle) * this.speed * dt;
          this.y += Math.sin(moveAngle) * this.speed * dt;
        }
        this.fireTimer -= dt;
        if (this.fireTimer <= 0) {
          this.fireTimer = this.def.fireInterval;
          firePattern(this.def.pattern, this, player, bullets);
        }
        break;
      }
      case "orbit": {
        this.orbitAngle += dt * 0.8;
        const targetX = player.x + Math.cos(this.orbitAngle) * this.def.preferredRange;
        const targetY = player.y + Math.sin(this.orbitAngle) * this.def.preferredRange;
        this.x = lerp(this.x, targetX, clamp(dt * 2, 0, 1));
        this.y = lerp(this.y, targetY, clamp(dt * 2, 0, 1));
        this.fireTimer -= dt;
        if (this.fireTimer <= 0) {
          this.fireTimer = this.def.fireInterval;
          firePattern(this.def.pattern, this, player, bullets);
        }
        break;
      }
      case "boss": {
        const range = this.def.preferredRange;
        let moveAngle = toPlayerAngle + Math.PI / 2; // strafe
        if (d > range + 40) moveAngle = toPlayerAngle;
        else if (d < range - 40) moveAngle = toPlayerAngle + Math.PI;
        this.x += Math.cos(moveAngle) * this.speed * dt;
        this.y += Math.sin(moveAngle) * this.speed * dt;
        this.fireTimer -= dt;
        if (this.fireTimer <= 0) {
          this.fireTimer = this.def.fireInterval;
          firePattern(this.def.pattern, this, player, bullets);
        }
        break;
      }
    }

    confineToArena(this);
  }
}

// ---------------------------------------------------------------------------
// Particle — cosmetic only, never affects gameplay
// ---------------------------------------------------------------------------

class Particle {
  constructor(x, y, color, opts = {}) {
    this.x = x;
    this.y = y;
    const speed = opts.speed || rand(40, 160);
    const angle = opts.angle !== undefined ? opts.angle : rand(0, Math.PI * 2);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.color = color;
    this.life = opts.life || rand(0.25, 0.5);
    this.maxLife = this.life;
    this.size = opts.size || rand(2, 4);
    // Height above ground in world units, with a little upward pop + gravity.
    this.h = opts.h !== undefined ? opts.h : BULLET_HEIGHT;
    this.vh = rand(1, 4.5);
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= 0.92;
    this.vy *= 0.92;
    this.vh -= 12 * dt;
    this.h = Math.max(0.05, this.h + this.vh * dt);
    this.life -= dt;
  }

  get dead() { return this.life <= 0; }
}
