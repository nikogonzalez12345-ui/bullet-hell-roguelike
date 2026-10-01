// The run's internal clock. Instead of discrete waves, the director spawns
// enemies continuously around the player and ramps everything with time:
// spawn rate, how many can be alive, enemy HP/damage, and which types
// appear. Swarms and bosses punctuate the ramp.

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
  }

  // Shown on the HUD as THREAT level.
  get threat() {
    return 1 + Math.floor(this.time / 60);
  }

  update(dt) {
    const g = this.game;
    this.time += dt;
    INTENSITY.hp = DIRECTOR.hpBase + this.time * DIRECTOR.hpPerSec;
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
    const pool = [
      { type: "grunt", weight: 10 * base },
      { type: "shooter", weight: t > 30 ? (4 + t / 60) * base : 0 },
      { type: "sniper", weight: t > 90 ? (2 + t / 90) * base : 0 },
      { type: "orbiter", weight: t > 150 ? (2 + t / 120) * base : 0 },
    ];
    const extras = {
      1: [["bat", 9], ["wisp", 5]],
      2: [["slime", 8], ["golem", 3], ["bat", 3]],
      3: [["imp", 8], ["elemental", 4], ["slime", 2]],
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
    this.game.enemies.push(new Enemy(type, x, y, hpScale));
  }

  swarm() {
    const p = this.game.player;
    const count = 8 + Math.floor(this.time / 40);
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

  // Stragglers that fall too far behind are recycled back into the fight.
  leash() {
    const p = this.game.player;
    for (const e of this.game.enemies) {
      if (e.isBoss) continue;
      if (dist(e.x, e.y, p.x, p.y) > DIRECTOR.leashDistance) {
        const s = this.spawnPoint(DIRECTOR.spawnMin, DIRECTOR.spawnMax);
        e.x = s.x;
        e.y = s.y;
      }
    }
  }
}
