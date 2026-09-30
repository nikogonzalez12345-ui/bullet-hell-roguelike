// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

class Player {
  constructor() {
    this.x = CANVAS_W / 2;
    this.y = CANVAS_H / 2;
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
    this.dashSpeed = PLAYER.dashSpeed;
    this.dashDuration = PLAYER.dashDuration;
    this.dashCooldown = PLAYER.dashCooldown;
    this.regenPerSec = PLAYER.regenPerSec;
    this.magnetRadius = PLAYER.magnetRadius;

    this.fireCooldown = 0;
    this.dashTimer = 0;      // >0 while dashing
    this.dashCooldownTimer = 0;
    this.dashDirX = 0;
    this.dashDirY = 0;
    this.iframeTimer = 0;    // >0 = invulnerable
    this.regenAccum = 0;

    this.alive = true;
    this.facing = 0; // radians, for aim indicator
  }

  get isDashing() { return this.dashTimer > 0; }
  get isInvulnerable() { return this.iframeTimer > 0; }
  get dashReady() { return this.dashCooldownTimer <= 0; }

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

  startDash(dirX, dirY) {
    if (!this.dashReady) return;
    const len = Math.hypot(dirX, dirY) || 1;
    this.dashDirX = dirX / len;
    this.dashDirY = dirY / len;
    this.dashTimer = this.dashDuration;
    this.dashCooldownTimer = this.dashCooldown;
    this.iframeTimer = Math.max(this.iframeTimer, PLAYER.dashIframes);
  }

  update(dt, input) {
    if (!this.alive) return;

    if (this.iframeTimer > 0) this.iframeTimer -= dt;
    if (this.dashCooldownTimer > 0) this.dashCooldownTimer -= dt;
    if (this.fireCooldown > 0) this.fireCooldown -= dt;

    if (this.regenPerSec > 0 && this.hp < this.maxHp) {
      this.regenAccum += this.regenPerSec * dt;
      if (this.regenAccum >= 1) {
        const whole = Math.floor(this.regenAccum);
        this.hp = clamp(this.hp + whole, 0, this.maxHp);
        this.regenAccum -= whole;
      }
    }

    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      this.x += this.dashDirX * this.dashSpeed * dt;
      this.y += this.dashDirY * this.dashSpeed * dt;
    } else {
      let mx = 0, my = 0;
      if (input.up) my -= 1;
      if (input.down) my += 1;
      if (input.left) mx -= 1;
      if (input.right) mx += 1;
      if (mx !== 0 || my !== 0) {
        const len = Math.hypot(mx, my);
        mx /= len; my /= len;
        this.x += mx * this.speed * dt;
        this.y += my * this.speed * dt;
      }

      if (input.dashPressed && this.dashReady) {
        let dx = mx, dy = my;
        if (dx === 0 && dy === 0) { dx = Math.cos(this.facing); dy = Math.sin(this.facing); }
        this.startDash(dx, dy);
      }
    }

    this.x = clamp(this.x, this.radius, CANVAS_W - this.radius);
    this.y = clamp(this.y, this.radius, CANVAS_H - this.radius);

    if (input.mouseX !== null) {
      this.facing = angleTo(this.x, this.y, input.mouseX, input.mouseY);
    }
  }

  tryShoot(bullets) {
    if (this.fireCooldown > 0) return;
    this.fireCooldown = 1 / this.fireRate;

    const shots = this.multishot;
    const spread = (shots - 1) * this.spreadDeg;
    const startAngle = this.facing - (spread / 2) * (Math.PI / 180);
    for (let i = 0; i < shots; i++) {
      const angle = shots === 1 ? this.facing : startAngle + i * this.spreadDeg * (Math.PI / 180);
      bullets.push(new Bullet({
        x: this.x + Math.cos(angle) * (this.radius + 6),
        y: this.y + Math.sin(angle) * (this.radius + 6),
        vx: Math.cos(angle) * this.bulletSpeed,
        vy: Math.sin(angle) * this.bulletSpeed,
        radius: this.bulletRadius,
        damage: this.damage,
        pierce: this.pierce,
        owner: "player",
        color: COLORS.playerBullet,
      }));
    }
  }

  draw(ctx) {
    ctx.save();
    const flashing = this.iframeTimer > 0 && Math.floor(this.iframeTimer * 20) % 2 === 0;
    ctx.globalAlpha = flashing ? 0.4 : 1;

    // Aim indicator
    ctx.strokeStyle = "rgba(125, 211, 255, 0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.x + Math.cos(this.facing) * this.radius, this.y + Math.sin(this.facing) * this.radius);
    ctx.lineTo(this.x + Math.cos(this.facing) * (this.radius + 18), this.y + Math.sin(this.facing) * (this.radius + 18));
    ctx.stroke();

    ctx.fillStyle = this.isDashing ? COLORS.playerDash : COLORS.player;
    ctx.shadowColor = COLORS.player;
    ctx.shadowBlur = this.isDashing ? 25 : 12;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
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
    if (this.x < -40 || this.x > CANVAS_W + 40 || this.y < -40 || this.y > CANVAS_H + 40) {
      this.dead = true;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
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
  boss: {
    hp: 900, radius: 34, speed: 55, color: COLORS.enemyBoss,
    contactDamage: 18, score: 500, behavior: "boss",
    preferredRange: 260, fireInterval: 0.9, pattern: "bossPattern",
  },
};

let enemyIdCounter = 1;

class Enemy {
  constructor(type, x, y, waveScale) {
    const def = ENEMY_DEFS[type];
    this.id = enemyIdCounter++;
    this.type = type;
    this.def = def;
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
  }

  takeDamage(amount) {
    this.hp -= amount;
    this.hitFlash = 0.08;
    if (this.hp <= 0) this.alive = false;
    return !this.alive;
  }

  update(dt, player, bullets) {
    if (!this.alive) return;
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

    this.x = clamp(this.x, this.radius, CANVAS_W - this.radius);
    this.y = clamp(this.y, this.radius, CANVAS_H - this.radius);
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = this.hitFlash > 0 ? "#ffffff" : this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = this.type === "boss" ? 24 : 10;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // HP bar for tougher enemies
    if (this.type === "boss" || this.maxHp > 30) {
      const w = this.radius * 2;
      const pct = clamp(this.hp / this.maxHp, 0, 1);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(this.x - w / 2, this.y - this.radius - 10, w, 4);
      ctx.fillStyle = "#ff4d7e";
      ctx.fillRect(this.x - w / 2, this.y - this.radius - 10, w * pct, 4);
    }
    ctx.restore();
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
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= 0.92;
    this.vy *= 0.92;
    this.life -= dt;
  }

  get dead() { return this.life <= 0; }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = clamp(this.life / this.maxLife, 0, 1);
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
