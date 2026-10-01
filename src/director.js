// The run's internal clock. Instead of discrete waves, the director spawns
// enemies continuously around the player and ramps everything with time:
// spawn rate, how many can be alive, enemy HP/damage, and which types
// appear. Swarms and bosses punctuate the ramp.

const MELEE_BEHAVIORS = new Set(["chase", "swoop", "hop"]);

class Director {
  constructor(game) {
    this.game = game;
    this.time = 0;
    this.spawnAcc = 0;
    this.nextSwarm = DIRECTOR.firstSwarm;
    this.stageBossDone = new Set(); // stage indices whose boss has appeared
    this.nextEncore = Infinity;     // Inferno: bosses keep returning
    this.encoreIndex = 0;
    INTENSITY.hp = DIRECTOR.hpBase;
    INTENSITY.damage = DIRECTOR.dmgBase;
    this.basePower = 0;  // player's damage rating at the start of the run
    this.catchUp = 1;    // adaptive HP multiplier (see DIRECTOR.catchUpExp)
    this.powerT = 0;
  }

  // Rough offensive rating: summed weapon DPS, nudged up by wild mods.
  powerRating() {
    const p = this.game.player;
    let dps = 0;
    for (const w of p.weaponSlots) if (w) dps += weaponDps(w, p);
    let stacks = 0;
    for (const k in p.mods) stacks += p.mods[k];
    return dps * (1 + 0.05 * stacks);
  }

  // Enemy HP multiplier: a time curve that steepens as the run goes on,
  // times a catch-up factor when the player is out-scaling it.
  updateScaling(dt) {
    const t = this.time;
    const curve = 1 + t / DIRECTOR.hpLinear + (t / DIRECTOR.hpQuad) ** 2;
    this.powerT -= dt;
    if (this.powerT <= 0) {
      this.powerT = 1;
      const rating = this.powerRating();
      if (!this.basePower) this.basePower = rating || 1;
      const expected = 1 + t / DIRECTOR.powerLinear + (t / DIRECTOR.powerQuad) ** 2;
      const lead = rating / this.basePower / expected;
      this.catchUpTarget = clamp(Math.pow(Math.max(lead, 1), DIRECTOR.catchUpExp), 1, DIRECTOR.catchUpMax);
    }
    // Ease toward the target slowly: a big upgrade feels great for a while
    // before the run adapts to it.
    this.catchUp = lerp(this.catchUp, this.catchUpTarget || 1, 1 - Math.exp(-0.06 * dt)); // ~30s to settle
    INTENSITY.hp = DIRECTOR.hpBase * curve * this.catchUp;
  }

  // Shown on the HUD as THREAT level.
  get threat() {
    return 1 + Math.floor(this.time / 60);
  }

  update(dt) {
    const g = this.game;
    this.time += dt;
    this.updateScaling(dt);
    INTENSITY.damage = DIRECTOR.dmgBase + this.time * DIRECTOR.dmgPerSec;

    const bossAlive = g.enemies.some((e) => e.isBoss);
    let rate = DIRECTOR.baseSpawnRate + DIRECTOR.spawnRateGrowth * this.time;
    if (bossAlive) rate *= 0.35;
    const cap = Math.min(DIRECTOR.maxCap, DIRECTOR.baseCap + this.time * DIRECTOR.capGrowth);

    this.spawnAcc += rate * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (g.enemies.length < cap) {
        const p = this.spawnPoint(DIRECTOR.spawnMin, DIRECTOR.spawnMax);
        this.spawn(this.pickType(), p.x, p.y);
      }
    }

    if (this.time >= this.nextSwarm) {
      this.nextSwarm += DIRECTOR.swarmEvery;
      this.swarm();
    }
    this.updateBosses();
    this.leash();
  }

  // Each stage's own boss arrives 2:30 into the stage. Once in the last
  // stage, every boss returns in rotation every 3 minutes, tougher each loop.
  updateBosses() {
    const st = this.game.stageIndex;
    const stage = STAGES[st];
    if (!this.stageBossDone.has(st) && this.time >= stage.start + DIRECTOR.stageBossAt) {
      this.stageBossDone.add(st);
      this.spawnBoss(STAGE_BOSSES[st], 0);
      if (st === STAGES.length - 1) this.nextEncore = this.time + DIRECTOR.bossEvery;
    }
    if (this.time >= this.nextEncore) {
      this.nextEncore += DIRECTOR.bossEvery;
      const type = STAGE_BOSSES[this.encoreIndex % STAGE_BOSSES.length];
      this.spawnBoss(type, 1 + Math.floor(this.encoreIndex / STAGE_BOSSES.length));
      this.encoreIndex++;
    }
  }

  // Base enemies throughout, plus each stage's own creatures.
  pickType() {
    const t = this.time;
    const st = this.game.stageIndex;
    const base = st === 0 ? 1 : 0.55;
    // The spawn rate is high, so ranged types are weighted down: more
    // bodies to cut through, without the screen drowning in bullets.
    const pool = [
      { type: "grunt", weight: 13 * base },
      { type: "shooter", weight: t > 30 ? (3 + t / 100) * base : 0 },
      { type: "sniper", weight: t > 90 ? (1.4 + t / 160) * base : 0 },
      { type: "orbiter", weight: t > 150 ? (1.4 + t / 200) * base : 0 },
    ];
    const extras = {
      1: [["bat", 11], ["wisp", 3.5]],
      2: [["slime", 10], ["golem", 3], ["bat", 4]],
      3: [["imp", 6], ["elemental", 3], ["slime", 4], ["bat", 3]],
    }[st] || [];
    for (const [type, weight] of extras) pool.push({ type, weight });
    return weightedPick(pool).type;
  }

  // A point in a ring around the player that's still on the island.
  spawnPoint(minD, maxD) {
    const p = this.game.player;
    for (let tries = 0; tries < 12; tries++) {
      const a = rand(0, Math.PI * 2);
      const d = rand(minD, maxD);
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      if (Math.hypot(x, y) < ARENA_RADIUS - 30) return { x, y };
    }
    // Player is hugging the coast: spawn inland of them.
    const a = Math.atan2(-p.y, -p.x);
    return { x: p.x + Math.cos(a) * minD, y: p.y + Math.sin(a) * minD };
  }

  spawn(type, x, y, hpScale = INTENSITY.hp) {
    const e = new Enemy(type, x, y, hpScale);
    if (!e.isBoss && Math.random() < this.eliteChance()) e.makeElite();
    this.game.enemies.push(e);
    return e;
  }

  eliteChance() {
    const t = this.time - DIRECTOR.eliteFrom;
    if (t < 0) return 0;
    const [lo, hi] = DIRECTOR.eliteChance;
    return Math.min(hi, lo + (hi - lo) * t / 600);
  }

  swarm() {
    const p = this.game.player;
    const count = 10 + Math.floor(this.time / 32);
    const offset = rand(0, Math.PI * 2);
    const type = ["grunt", "bat", "slime", "imp"][this.game.stageIndex] || "grunt";
    for (let i = 0; i < count; i++) {
      const a = offset + (i / count) * Math.PI * 2;
      const x = p.x + Math.cos(a) * 430, y = p.y + Math.sin(a) * 430;
      if (Math.hypot(x, y) < ARENA_RADIUS - 30) this.spawn(type, x, y);
    }
    this.game.showBanner("SWARM INCOMING", 2, "#ff9a3a");
  }

  spawnBoss(type, loop) {
    const p = this.spawnPoint(450, 560);
    this.spawn(type, p.x, p.y, INTENSITY.hp * 0.7 * (1 + loop * 0.6));
  }

  // Stragglers that fall too far behind are recycled back into the fight,
  // and so are melee enemies wedged in cover (no progress for ~5s).
  leash() {
    const p = this.game.player;
    for (const e of this.game.enemies) {
      if (e.isBoss) continue;
      const d = dist(e.x, e.y, p.x, p.y);
      let recycle = d > DIRECTOR.leashDistance;
      if (MELEE_BEHAVIORS.has(e.def.behavior)) {
        // Stuck = busy steering around cover without getting any closer.
        if (e.ckT === undefined) { e.ckT = this.time; e.ckD = d; e.stuck = 0; }
        if (this.time - e.ckT > 2.5) {
          e.stuck = e.steerSide && d > 60 && d > e.ckD - 40 ? e.stuck + 1 : 0;
          e.ckT = this.time; e.ckD = d;
          if (e.stuck >= 2) { recycle = true; e.stuck = 0; }
        }
      }
      if (recycle) {
        const s = this.spawnPoint(DIRECTOR.spawnMin, DIRECTOR.spawnMax);
        e.x = s.x;
        e.y = s.y;
        e.steerSide = 0;
      }
    }
  }
}
