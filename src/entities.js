// Keep a circular body inside the island and out of trees/rocks.
function confineToArena(ent) {
  const d = Math.hypot(ent.x, ent.y);
  const max = ARENA_RADIUS - ent.radius;
  if (d > max) {
    ent.x *= max / d;
    ent.y *= max / d;
  }
  for (const o of obstaclesNear(ent.x, ent.y)) {
    const push = obstaclePush(o, ent.x, ent.y, ent.radius);
    if (push) {
      ent.x = push.x;
      ent.y = push.y;
    }
  }
}

// Ground movement for enemies that walks around cover instead of grinding
// into it ("bug" pathing): when the way ahead is blocked, sweep further and
// further off the target direction in one committed rotation until a probe
// is clear. Committing stops them dithering at a wall's midpoint; the
// rotation is forgotten after a stretch of open ground, and reversed after a
// very long detour so dead-end pockets can't trap them.
const STEER_OFFSETS = [0.45, 0.9, 1.35, 1.8, 2.25, 2.7];

function steerMove(ent, angle, step) {
  if (step <= 0) return;
  const probe = ent.radius + 24;
  const clear = (a) => !blockedAt(ent.x + Math.cos(a) * probe, ent.y + Math.sin(a) * probe, ent.radius * 0.8);
  let a = angle;
  if (!clear(angle)) {
    if (!ent.steerSide) {
      // Pick the rotation that frees up first.
      ent.steerSide = 1;
      for (const off of STEER_OFFSETS) {
        if (clear(angle + off)) break;
        if (clear(angle - off)) { ent.steerSide = -1; break; }
      }
    }
    let found = null;
    for (const off of STEER_OFFSETS) {
      if (clear(angle + off * ent.steerSide)) { found = angle + off * ent.steerSide; break; }
    }
    if (found === null) { ent.steerSide = -ent.steerSide; found = angle + Math.PI * 0.75 * ent.steerSide; }
    a = found;
    ent.steerFree = 0;
    ent.steerDist = (ent.steerDist || 0) + step;
    if (ent.steerDist > 800) { ent.steerSide = -ent.steerSide; ent.steerDist = 0; }
  } else if (ent.steerSide) {
    ent.steerFree = (ent.steerFree || 0) + step;
    if (ent.steerFree > 120) { ent.steerSide = 0; ent.steerDist = 0; }
  }
  ent.x += Math.cos(a) * step;
  ent.y += Math.sin(a) * step;
}

// Global difficulty multipliers, driven by the Director's clock.
const INTENSITY = { hp: 1, damage: 1 };

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

const EQUIP_SLOTS = ["head", "chest", "legs", "feet", "ring", "charm"];

class Player {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.radius = PLAYER.radius;

    // Upgrades (level-ups) change `base`; gear adds on top via getters below.
    this.base = {
      speed: PLAYER.baseSpeed,
      maxHp: PLAYER.baseHp,
      fireRate: PLAYER.baseFireRate,
      damage: PLAYER.baseDamage,
      bulletSpeed: PLAYER.baseBulletSpeed,
      staminaRegen: PLAYER.staminaRegen,
      regenPerSec: PLAYER.regenPerSec,
      pickupRadius: PLAYER.pickupRadius,
    };
    this.gear = {};
    this.hp = this.base.maxHp;

    this.bulletRadius = PLAYER.baseBulletRadius;
    this.pierce = PLAYER.pierce;
    this.multishot = PLAYER.multishot;
    this.spreadDeg = PLAYER.spreadDeg;
    this.rollDuration = PLAYER.rollDuration;
    this.vx = 0;
    this.vy = 0;
    this.h = 0;   // jump height (world units)
    this.vh = 0;
    this.sprinting = false;
    this.justRolled = false;
    this.justJumped = false;
    this.justLanded = false;

    // Weapons: slot 0 in hand, 1-3 floating. Starts with a plain pistol.
    this.weaponSlots = new Array(WEAPON_SLOTS).fill(null);
    this.weaponSlots[0] = makeWeapon({ base: "service", element: "none", rarity: "common" });
    this.weaponCd = new Array(WEAPON_SLOTS).fill(0);
    this.weaponFx = Array.from({ length: WEAPON_SLOTS }, () => ({ kick: 0, swing: 0, element: null }));
    this.attackQueue = []; // queued follow-ups: burst shots, echoes, twin swings

    this.backpackSlots = PLAYER.backpackSlots;
    this.backpack = [];
    this.potions = 0;
    this.hitPulse = 0; // > 0 right after taking damage: the model pulses red
    this.equipped = Object.fromEntries(EQUIP_SLOTS.map((s) => [s, null]));
    this.affinity = Object.fromEntries(ELEMENT_IDS.map((e) => [e, 0]));

    this.level = 1;
    this.xp = 0;
    this.kills = 0;

    this.rollTimer = 0;
    this.rollCooldownTimer = 0;
    this.maxStamina = PLAYER.maxStamina;
    this.stamina = this.maxStamina;
    this.staminaDelayT = 0;
    this.winded = false;
    this.xpMul = 1;
    // Zany level-up mods (upgrades.js): id -> stacks, read by Game hooks.
    this.mods = {};
    this.sizeMul = 1;   // Mega Mushroom / Shrink Ray
    this.shotSize = 1;  // projectile radius multiplier
    this.jumpMul = 1;   // Moon Boots
    this.justRevived = false;
    this.rollDirX = 0;
    this.rollDirY = 0;
    this.iframeTimer = 0;
    this.regenAccum = 0;

    this.alive = true;
    this.facing = 0;
    this.aimAngle = 0;
    this.moving = false;
    this.recalcGear(); // sets affinity + gearVersion for the starting loadout
  }

  g(key) { return this.gear[key] || 0; }
  get speed() { return this.base.speed * (1 + this.g("moveSpeedPct") / 100); }
  get maxHp() { return Math.round(this.base.maxHp + this.g("maxHp")); }
  get fireRate() { return this.base.fireRate * (1 + this.g("fireRatePct") / 100); }
  get damage() { return this.base.damage * (1 + this.g("damagePct") / 100); }
  get bulletSpeed() { return this.base.bulletSpeed * (1 + this.g("bulletSpeedPct") / 100); }
  // `rollCdPct` gear rolls are stamina-regen bonuses now.
  get staminaRegen() { return this.base.staminaRegen * (1 + this.g("rollCdPct") / 100); }
  get regenPerSec() { return this.base.regenPerSec + this.g("regen"); }
  get pickupRadius() { return this.base.pickupRadius * (1 + this.g("pickupPct") / 100); }
  get armor() { return this.g("armor"); }

  get isRolling() { return this.rollTimer > 0; }
  get isInvulnerable() { return this.iframeTimer > 0; }
  get rollReady() { return this.rollCooldownTimer <= 0 && this.stamina >= PLAYER.rollCost; }

  spendStamina(amount) {
    this.stamina = Math.max(0, this.stamina - amount);
    this.staminaDelayT = PLAYER.staminaDelay;
    if (this.stamina === 0) this.winded = true;
  }

  updateStamina(dt) {
    if (this.staminaDelayT > 0) {
      this.staminaDelayT -= dt;
    } else {
      this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegen * dt);
    }
    if (this.winded && this.stamina >= PLAYER.winded) this.winded = false;
  }
  get backpackFull() { return this.backpack.length >= this.backpackSlots; }

  // Recompute stat totals and element affinity from everything equipped.
  recalcGear() {
    const totals = {};
    const aff = Object.fromEntries(ELEMENT_IDS.map((e) => [e, 0]));
    for (const item of [...Object.values(this.equipped), ...this.weaponSlots]) {
      if (!item) continue;
      for (const [k, v] of Object.entries(item.stats)) totals[k] = (totals[k] || 0) + v;
      if (item.element && item.element !== "none") aff[item.element] += 1;
    }
    this.gear = totals;
    this.affinity = aff;
    this.hp = Math.min(this.hp, this.maxHp);
    this.gearVersion = (this.gearVersion || 0) + 1; // lets the renderer rebuild visuals
  }

  tier(el) { return affinityTier(this.affinity[el] || 0); }
  potency(el) { return 1 + 0.15 * (this.affinity[el] || 0); }

  // Armor gives diminishing damage reduction: 50 armor = 1/3 less damage.
  takeDamage(amount) {
    if (this.isInvulnerable || !this.alive) return false;
    this.hp -= amount * (100 / (100 + this.armor));
    this.iframeTimer = PLAYER.hitIframes;
    this.hitPulse = PLAYER.hitIframes;
    if (this.hp <= 0 && this.mods.lazarus > 0) {
      // Second Heart: spend a stack and come back at half health.
      this.mods.lazarus -= 1;
      this.hp = this.maxHp * 0.5;
      this.iframeTimer = 2;
      this.justRevived = true;
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
    return true;
  }

  // ---- Weapons -----------------------------------------------------------

  // A new weapon goes straight into a free slot, else into the backpack.
  addWeaponItem(item) {
    const free = this.weaponSlots.indexOf(null);
    if (free >= 0) {
      this.weaponSlots[free] = item;
      this.weaponCd[free] = 0;
      this.recalcGear();
      return "equipped";
    }
    return this.addToBackpack(item) ? "backpack" : false;
  }

  unequipWeapon(slot) {
    const item = this.weaponSlots[slot];
    const armed = this.weaponSlots.filter(Boolean).length;
    if (!item || armed <= 1 || this.backpackFull) return false;
    this.weaponSlots[slot] = null;
    this.backpack.push(item);
    this.recalcGear();
    return true;
  }

  queueAttack(slot, delay, opts) {
    this.attackQueue.push({ slot, t: delay, opts });
  }

  // Cooldowns, firing and queued follow-up attacks for every equipped weapon.
  updateWeapons(dt, game, firing) {
    for (let s = 0; s < WEAPON_SLOTS; s++) {
      const fx = this.weaponFx[s];
      fx.kick = Math.max(0, fx.kick - dt * 8);
      fx.swing = Math.max(0, fx.swing - dt * 5);
      const item = this.weaponSlots[s];
      if (!item) continue;
      if (this.weaponCd[s] > 0) this.weaponCd[s] -= dt;
      if (firing && this.weaponCd[s] <= 0) {
        this.weaponCd[s] += 1 / weaponRate(item, this);
        if (this.weaponCd[s] < 0) this.weaponCd[s] = 0;
        fireWeapon(game, this, s);
      }
    }
    for (let i = this.attackQueue.length - 1; i >= 0; i--) {
      const q = this.attackQueue[i];
      q.t -= dt;
      if (q.t <= 0) {
        this.attackQueue.splice(i, 1);
        fireWeapon(game, this, q.slot, q.opts);
      }
    }
  }

  // ---- Inventory -------------------------------------------------------

  addToBackpack(item) {
    if (this.backpackFull) return false;
    this.backpack.push(item);
    return true;
  }

  equipFromBackpack(index) {
    const item = this.backpack[index];
    if (!item) return "none";
    if (item.kind === "weapon") {
      const free = this.weaponSlots.indexOf(null);
      if (free < 0) return "slots-full";
      this.weaponSlots[free] = item;
      this.weaponCd[free] = 0;
      this.backpack.splice(index, 1);
      this.recalcGear();
      return "equipped";
    }
    if (item.kind !== "gear") return "none";
    const current = this.equipped[item.slot];
    this.equipped[item.slot] = item;
    this.backpack.splice(index, 1);
    if (current) this.backpack.splice(index, 0, current);
    this.recalcGear();
    return "equipped";
  }

  unequip(slot) {
    const item = this.equipped[slot];
    if (!item || this.backpackFull) return false;
    this.equipped[slot] = null;
    this.backpack.push(item);
    this.recalcGear();
    return true;
  }

  discard(index) {
    this.backpack.splice(index, 1);
  }

  // Potions sit on a separate belt (max PLAYER.maxPotions), not in the backpack.
  addPotion() {
    if (this.potions >= PLAYER.maxPotions) return false;
    this.potions += 1;
    return true;
  }

  drinkPotion() {
    if (this.potions <= 0 || this.hp >= this.maxHp) return false;
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp * POTION_HEAL);
    this.potions -= 1;
    return true;
  }

  // ---- Movement ----------------------------------------------------------

  startRoll(dirX, dirY) {
    if (!this.rollReady) return;
    const len = Math.hypot(dirX, dirY) || 1;
    this.rollDirX = dirX / len;
    this.rollDirY = dirY / len;
    this.rollTimer = this.rollDuration;
    this.rollCooldownTimer = PLAYER.rollMinGap;
    this.spendStamina(PLAYER.rollCost);
    this.iframeTimer = Math.max(this.iframeTimer, PLAYER.rollIframes);
    this.justRolled = true;
  }

  // 0 at the start of a roll, 1 at the end.
  get rollProgress() {
    return this.isRolling ? 1 - this.rollTimer / this.rollDuration : 0;
  }

  update(dt, input) {
    if (!this.alive) return;

    if (this.iframeTimer > 0) this.iframeTimer -= dt;
    if (this.hitPulse > 0) this.hitPulse -= dt;
    if (this.rollCooldownTimer > 0) this.rollCooldownTimer -= dt;
    this.updateStamina(dt);

    if (this.regenPerSec > 0 && this.hp < this.maxHp) {
      this.regenAccum += this.regenPerSec * dt;
      if (this.regenAccum >= 1) {
        const whole = Math.floor(this.regenAccum);
        this.hp = clamp(this.hp + whole, 0, this.maxHp);
        this.regenAccum -= whole;
      }
    }

    this.facing = input.yaw;
    this.aimAngle = this.facing; // Game may bend this toward a locked-on target

    // WASD is relative to where the camera is looking.
    const f = (input.up ? 1 : 0) - (input.down ? 1 : 0);
    const s = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const cy = Math.cos(input.yaw), sy = Math.sin(input.yaw);
    let mx = cy * f - sy * s;
    let my = sy * f + cy * s;
    const wantsMove = f !== 0 || s !== 0;
    if (wantsMove) {
      const len = Math.hypot(mx, my);
      mx /= len; my /= len;
    }

    if (this.rollTimer > 0) {
      // Burst out fast and ease to a stop: speed ~ (1-u)^2, which integrates
      // to exactly rollDistance over rollDuration.
      const u = this.rollProgress;
      const burst = (3 * PLAYER.rollDistance / this.rollDuration) * (1 - u) * (1 - u);
      // Blend into walking pace toward the end so the roll flows straight
      // into running instead of stalling for a frame.
      const carry = (wantsMove ? this.speed : this.speed * 0.4) * u;
      const speed = Math.max(burst, carry);
      this.vx = this.rollDirX * speed;
      this.vy = this.rollDirY * speed;
      this.rollTimer -= dt;
    } else {
      // Short acceleration ramp: responsive, but no instant start/stop.
      this.sprinting = !!input.sprint && wantsMove && !this.winded && this.stamina > 0;
      if (this.sprinting) this.spendStamina(PLAYER.sprintDrain * dt);
      const top = this.speed * (this.sprinting ? PLAYER.sprintMul : 1);
      const k = 1 - Math.exp(-PLAYER.accel * dt);
      this.vx = lerp(this.vx, wantsMove ? mx * top : 0, k);
      this.vy = lerp(this.vy, wantsMove ? my * top : 0, k);
      if (input.rollPressed && this.rollReady && this.h === 0) {
        const dx = wantsMove ? mx : Math.cos(this.facing);
        const dy = wantsMove ? my : Math.sin(this.facing);
        this.startRoll(dx, dy);
      } else if (input.jumpPressed && this.h === 0) {
        this.vh = JUMP.velocity * this.jumpMul;
        this.justJumped = true;
      }
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.moving = Math.hypot(this.vx, this.vy) > this.speed * 0.15;
    this.updateJump(dt);

    confineToArena(this);
  }

  // Height above the ground (world units). Up near the apex you're over the
  // bullets — see JUMP.clear.
  updateJump(dt) {
    if (this.h <= 0 && this.vh <= 0) return;
    this.vh -= JUMP.gravity * dt;
    this.h += this.vh * dt;
    if (this.h <= 0) {
      this.h = 0;
      this.vh = 0;
      this.justLanded = true;
    }
  }

  get overBullets() { return this.h > JUMP.clear; }
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
    this.maxLife = this.life;
    this.age = 0;
    this.dead = false;
    this.expired = false;
    this.homing = opts.homing || 0; // turn rate, radians/sec, 0 = off
    this.target = opts.target || null;
    // Player-weapon extras (see weapons.js / Game.handleCollisions)
    this.shape = opts.shape || "orb";
    this.element = opts.element || null;
    this.bounce = opts.bounce || 0;
    this.split = opts.split || 0;
    this.blast = opts.blast || 0;
    this.boomerang = !!opts.boomerang;
    this.lob = !!opts.lob;
    this.vampiric = !!opts.vampiric;
    this.shard = !!opts.shard;
    this.wallBounce = opts.wallBounce || 0;
    this.hitIds = this.owner === "player" ? new Set() : null; // never hit the same enemy twice per pass
    this.returning = false;
    this.player = opts.player || null;
  }

  update(dt) {
    this.age += dt;
    // Boomerangs fly out, then curve back to the thrower (and can hit again).
    if (this.boomerang && this.player) {
      if (!this.returning && this.age > this.maxLife * 0.45) {
        this.returning = true;
        this.hitIds.clear();
      }
      if (this.returning) {
        const a = angleTo(this.x, this.y, this.player.x, this.player.y);
        const sp = Math.hypot(this.vx, this.vy);
        this.vx = lerp(this.vx, Math.cos(a) * sp, Math.min(1, dt * 6));
        this.vy = lerp(this.vy, Math.sin(a) * sp, Math.min(1, dt * 6));
        if (dist(this.x, this.y, this.player.x, this.player.y) < 20) this.dead = true;
      }
    }
    if (this.homing && this.target && this.target.alive !== false) {
      const desired = angleTo(this.x, this.y, this.target.x, this.target.y);
      const current = Math.atan2(this.vy, this.vx);
      let diff = desired - current;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const turn = clamp(diff, -this.homing * dt, this.homing * dt);
      const speed = Math.hypot(this.vx, this.vy);
      this.vx = Math.cos(current + turn) * speed;
      this.vy = Math.sin(current + turn) * speed;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0 && !this.boomerang) this.expired = true;
    if (this.expired || Math.hypot(this.x, this.y) > ARENA_RADIUS + 200) this.dead = true;
    if (this.boomerang && this.age > this.maxLife * 2.5) this.dead = true;
    // Trees and rocks are cover — they stop bullets (lobbed grenades sail over).
    if (this.lob) return;
    for (const o of obstaclesNear(this.x, this.y)) {
      if (!obstacleHit(o, this.x, this.y, this.radius)) continue;
      // Rubber Rounds: bounce off cover instead of breaking.
      if (this.wallBounce > 0) {
        const push = obstaclePush(o, this.x, this.y, this.radius + 0.5);
        if (push) {
          this.wallBounce -= 1;
          const dot = this.vx * push.nx + this.vy * push.ny;
          if (dot < 0) { this.vx -= 2 * dot * push.nx; this.vy -= 2 * dot * push.ny; }
          this.x = push.x; this.y = push.y;
          if (this.hitIds) this.hitIds.clear();
          this.life = Math.max(this.life, 0.6);
          break;
        }
      }
      this.dead = true;
      this.expired = true; // rockets still detonate on cover
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Enemy
// ---------------------------------------------------------------------------

const ENEMY_DEFS = {
  grunt: {
    hp: 22, radius: 13, speed: 95, color: COLORS.enemyGrunt,
    contactDamage: 10, score: 10, xp: 1, behavior: "chase",
  },
  shooter: {
    hp: 30, radius: 14, speed: 60, color: COLORS.enemyShooter,
    contactDamage: 8, score: 18, xp: 2, behavior: "keepDistance",
    preferredRange: 220, fireInterval: 1.4, pattern: "aimedBurst",
  },
  sniper: {
    hp: 26, radius: 12, speed: 45, color: COLORS.enemySniper,
    contactDamage: 8, score: 22, xp: 2, behavior: "keepDistance",
    preferredRange: 320, fireInterval: 2.2, pattern: "sniperShot",
  },
  orbiter: {
    hp: 40, radius: 15, speed: 70, color: COLORS.enemyOrbiter,
    contactDamage: 10, score: 28, xp: 3, behavior: "orbit",
    preferredRange: 180, fireInterval: 1.8, pattern: "radialBurst",
  },
  boss_oni: {
    hp: 850, radius: 30, speed: 60, color: COLORS.enemyBoss,
    contactDamage: 20, score: 500, xp: 40, behavior: "boss",
    preferredRange: 240, fireInterval: 0.9, pattern: "oniPattern",
    name: "Oni Brute",
  },
  boss_kitsune: {
    hp: 1100, radius: 28, speed: 85, color: "#ff9bd6",
    contactDamage: 16, score: 650, xp: 50, behavior: "boss",
    preferredRange: 260, fireInterval: 0.8, pattern: "kitsunePattern",
    name: "Kitsune Spirit",
  },
  boss_dragon: {
    hp: 1400, radius: 32, speed: 70, color: "#2fe6c8",
    contactDamage: 22, score: 800, xp: 60, behavior: "boss",
    preferredRange: 250, fireInterval: 0.75, pattern: "dragonPattern",
    name: "Ryujin Dragon",
  },
  boss_demon: {
    hp: 1700, radius: 34, speed: 72, color: "#ff3a2a",
    contactDamage: 24, score: 1000, xp: 70, behavior: "boss",
    preferredRange: 260, fireInterval: 0.8, pattern: "demonPattern",
    name: "Akuma, Demon Lord",
  },

  // ---- Stage-specific enemies ----
  // Nightfall
  bat: {
    hp: 14, radius: 11, speed: 150, color: "#e04a6a",
    contactDamage: 8, score: 14, xp: 1, behavior: "swoop",
  },
  wisp: {
    hp: 26, radius: 12, speed: 70, color: "#ff6ac8",
    contactDamage: 8, score: 22, xp: 2, behavior: "blink",
    preferredRange: 260, fireInterval: 2.0, pattern: "wispOrbs",
  },
  // The Depths
  slime: {
    hp: 42, radius: 16, speed: 80, color: "#e03a9a",
    contactDamage: 10, score: 20, xp: 2, behavior: "hop", splits: "slime_small",
  },
  slime_small: {
    hp: 14, radius: 10, speed: 95, color: "#ff7ac8",
    contactDamage: 6, score: 6, xp: 1, behavior: "hop",
  },
  golem: {
    hp: 130, radius: 20, speed: 38, color: "#ff8a4a",
    contactDamage: 16, score: 45, xp: 5, behavior: "keepDistance",
    preferredRange: 240, fireInterval: 2.2, pattern: "shardFan",
  },
  // Inferno
  imp: {
    hp: 24, radius: 12, speed: 115, color: "#ff5a3a",
    contactDamage: 8, score: 22, xp: 2, behavior: "strafe",
    preferredRange: 230, fireInterval: 1.5, pattern: "fireball",
  },
  elemental: {
    hp: 64, radius: 16, speed: 55, color: "#ffa02a",
    contactDamage: 12, score: 36, xp: 4, behavior: "keepDistance",
    preferredRange: 260, fireInterval: 0.35, pattern: "flameSpin", deathRing: true,
  },
};

// One boss per stage (Sunset, Night, Cave, Hell); in Inferno they all
// return in rotation, tougher each loop.
const STAGE_BOSSES = ["boss_oni", "boss_kitsune", "boss_dragon", "boss_demon"];

let enemyIdCounter = 1;

class Enemy {
  constructor(type, x, y, hpScale) {
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
    this.hp = Math.round(def.hp * hpScale);
    this.maxHp = this.hp;
    this.speed = def.speed;
    this.contactDamage = def.contactDamage;
    this.score = def.score;
    this.xp = def.xp;
    this.alive = true;
    this.fireTimer = rand(0.2, def.fireInterval || 1);
    this.orbitAngle = rand(0, Math.PI * 2);
    this.hitFlash = 0;
    // Elemental state (see elements.js)
    this.status = newStatus();
    this.burnDps = 0;
    this.chill = 0;
    this.frozenT = 0;
    this.vulnT = 0;
    this.curse = 0;
    this.slowMul = 1;
    this.tint = null;
    // Jumping: height/velocity in world units, like the player.
    this.h = 0;
    this.vh = 0;
    this.airBoost = 1; // ground-speed multiplier while airborne (pounces)
    this.jumpCd = rand(1.5, 3.5);
    this.pouncer = Math.random() < 0.3;
    this.dodgeScan = rand(0, 0.25);
    this.slamming = false;
  }

  // Elite: a tougher, bigger, gold-rimmed variant with better rewards.
  makeElite() {
    this.elite = true;
    this.hp = this.maxHp = Math.round(this.hp * 3);
    this.radius *= 1.2;
    this.speed *= 1.12;
    this.contactDamage *= 1.4;
    this.xp *= 4;
    this.score *= 3;
    this.color = "#ffd23b";
  }

  jump(velocity, boost = 1) {
    if (this.h > 0 || this.frozenT > 0) return;
    this.vh = velocity;
    this.airBoost = boost;
  }

  get overBullets() { return this.h > JUMP.clear; }

  // Shooters/snipers sometimes hop over a player shot that's about to hit.
  tryDodge(dt, bullets) {
    this.dodgeScan -= dt;
    if (this.dodgeScan > 0 || this.jumpCd > 0) return;
    this.dodgeScan = 0.25;
    for (const b of bullets) {
      if (b.owner !== "player" || b.dead) continue;
      const dx = this.x - b.x, dy = this.y - b.y;
      const d = Math.hypot(dx, dy);
      if (d > 110 || d < 1) continue;
      const sp = Math.hypot(b.vx, b.vy) || 1;
      if ((b.vx * dx + b.vy * dy) / (sp * d) < 0.9) continue; // not heading at us
      this.jumpCd = rand(2, 4);
      if (Math.random() < 0.35) this.jump(JUMP.velocity);
      return;
    }
  }

  fire(player, bullets, dt) {
    if (this.frozenT > 0) return;
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = this.def.fireInterval;
      firePattern(this.def.pattern, this, player, bullets);
    }
  }

  update(dt, player, bullets) {
    if (!this.alive) return;
    if (this.hitFlash > 0) this.hitFlash -= dt;

    const d = dist(this.x, this.y, player.x, player.y);
    const toPlayer = angleTo(this.x, this.y, player.x, player.y);
    if (this.jumpCd > 0) this.jumpCd -= dt;
    // chill/slime slow, freeze stops; pounces carry extra ground speed
    const spd = this.speed * this.slowMul * (this.h > 0 ? this.airBoost : 1);

    switch (this.def.behavior) {
      case "chase": {
        // Only some grunts pounce, now and then, from mid range (not when
        // already on top of you).
        if (this.pouncer && d < 170 && d > 80 && this.jumpCd <= 0) {
          this.jumpCd = rand(5, 8);
          if (Math.random() < 0.5) this.jump(6.5, 1.7);
        }
        steerMove(this, toPlayer, spd * dt);
        break;
      }
      case "keepDistance": {
        this.tryDodge(dt, bullets);
        const range = this.def.preferredRange;
        let move = toPlayer;
        if (d < range - 20) move += Math.PI;
        else if (d < range + 20) move = null;
        if (move !== null) steerMove(this, move, spd * dt);
        if (d < 700) this.fire(player, bullets, dt);
        break;
      }
      case "orbit": {
        this.orbitAngle += dt * 0.8 * this.slowMul;
        const tx = player.x + Math.cos(this.orbitAngle) * this.def.preferredRange;
        const ty = player.y + Math.sin(this.orbitAngle) * this.def.preferredRange;
        // Close in at normal speed when far; orbit smoothly once near.
        if (d > 400) {
          steerMove(this, toPlayer, spd * 1.5 * dt);
        } else {
          this.x = lerp(this.x, tx, clamp(dt * 2 * this.slowMul, 0, 1));
          this.y = lerp(this.y, ty, clamp(dt * 2 * this.slowMul, 0, 1));
          this.fire(player, bullets, dt);
        }
        break;
      }
      case "swoop": {
        // Bats weave side to side as they dive at you.
        this.swoopT = (this.swoopT || rand(0, 10)) + dt;
        const weave = Math.sin(this.swoopT * 4) * (d > 120 ? 0.9 : 0.3);
        steerMove(this, toPlayer + weave, spd * dt);
        break;
      }
      case "blink": {
        // Wisps hold range and teleport around you every few seconds.
        this.blinkT = (this.blinkT === undefined ? rand(2, 4) : this.blinkT) - dt;
        if (this.blinkT <= 0 && this.frozenT <= 0) {
          this.blinkT = rand(3, 4.5);
          const a = rand(0, Math.PI * 2), r = rand(220, 300);
          this.x = player.x + Math.cos(a) * r;
          this.y = player.y + Math.sin(a) * r;
          this.hitFlash = 0.15; // flash on arrival
        }
        const range = this.def.preferredRange;
        if (Math.abs(d - range) > 30) {
          steerMove(this, d > range ? toPlayer : toPlayer + Math.PI, spd * dt);
        }
        if (d < 700) this.fire(player, bullets, dt);
        break;
      }
      case "hop": {
        // Slimes only move while airborne: a string of hops toward you.
        if (this.h === 0 && this.jumpCd <= 0) {
          this.jumpCd = rand(0.5, 0.9);
          this.jump(6.5, 1);
          this.hopDir = toPlayer + rand(-0.3, 0.3);
        }
        if (this.h > 0) steerMove(this, this.hopDir, spd * 1.8 * dt);
        break;
      }
      case "strafe": {
        // Imps circle at range, changing direction now and then.
        if (!this.strafeDir || Math.random() < dt * 0.3) this.strafeDir = Math.random() < 0.5 ? 1 : -1;
        const range = this.def.preferredRange;
        const radial = d > range + 30 ? 1 : d < range - 30 ? -1 : 0; // close in / back off
        const tangent = toPlayer + (Math.PI / 2) * this.strafeDir;
        const mx = Math.cos(tangent) * 0.8 + Math.cos(toPlayer) * 0.6 * radial;
        const my = Math.sin(tangent) * 0.8 + Math.sin(toPlayer) * 0.6 * radial;
        steerMove(this, Math.atan2(my, mx), spd * dt);
        if (d < 700) this.fire(player, bullets, dt);
        break;
      }
      case "boss": {
        // Oni Brute (and Akuma, when hurt) leap at you and slam down —
        // a jumpable shockwave on landing.
        const leaps = this.type === "boss_oni" || (this.type === "boss_demon" && this.hp < this.maxHp * 0.6);
        if (leaps && this.jumpCd <= 0 && d < 600) {
          this.jumpCd = this.type === "boss_demon" ? 5 : 6;
          this.jump(10, 2.6);
          this.slamming = true;
        }
        const range = this.def.preferredRange;
        let move = toPlayer + Math.PI / 2; // strafe
        if (d > range + 40 || this.slamming) move = toPlayer;
        else if (d < range - 40) move = toPlayer + Math.PI;
        steerMove(this, move, (d > 700 ? spd * 2.5 : spd) * dt);
        if (d < 800) this.fire(player, bullets, dt);
        break;
      }
    }

    // Vertical motion.
    if (this.h > 0 || this.vh > 0) {
      this.vh -= JUMP.gravity * dt;
      this.h += this.vh * dt;
      if (this.h <= 0) {
        this.h = 0;
        this.vh = 0;
        if (this.slamming) {
          this.slamming = false;
          firePattern("oniSlam", this, player, bullets);
        }
      }
    }

    confineToArena(this);
  }
}

// ---------------------------------------------------------------------------
// Pickups — XP gems and dropped loot
// ---------------------------------------------------------------------------

class XpGem {
  constructor(x, y, value) {
    this.x = x + rand(-14, 14);
    this.y = y + rand(-14, 14);
    this.value = value;
    this.tier = XP.gemTiers.find((t) => value >= t.min);
    this.speed = 150;
    this.attracted = false;
    this.collected = false;
    this.spin = rand(0, Math.PI * 2);
  }

  update(dt, player) {
    this.spin += dt * 3;
    const d = dist(this.x, this.y, player.x, player.y);
    if (d < player.pickupRadius) this.attracted = true;
    if (this.attracted) {
      // Accelerates toward the player so it can't be outrun forever.
      this.speed = Math.min(950, this.speed + 1400 * dt);
      const a = angleTo(this.x, this.y, player.x, player.y);
      this.x += Math.cos(a) * this.speed * dt;
      this.y += Math.sin(a) * this.speed * dt;
    }
    if (d < player.radius + 10) this.collected = true;
  }
}

class Loot {
  constructor(x, y, item) {
    this.x = x + rand(-20, 20);
    this.y = y + rand(-20, 20);
    this.item = item;
    this.taken = false;
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
    this.vh = opts.vh !== undefined ? opts.vh : rand(1, 4.5);
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
