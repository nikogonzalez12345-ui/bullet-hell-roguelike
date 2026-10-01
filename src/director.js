// The run's internal clock. Instead of discrete waves, the director spawns
// enemies continuously around the player and ramps everything with time:
// spawn rate, how many can be alive, enemy HP/damage, and which types
// appear. Swarms and bosses punctuate the ramp.

class Director {
  constructor(game) {
    this.game = game;
    this.time = 0;
    this.spawnAcc = 0;
    this.nextBoss = DIRECTOR.bossEvery;
    this.nextSwarm = DIRECTOR.firstSwarm;
    this.bossIndex = 0;
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
    if (this.time >= this.nextBoss) {
      this.nextBoss += DIRECTOR.bossEvery;
      this.spawnBoss();
    }
    this.leash();
  }

  pickType() {
    const t = this.time;
    return weightedPick([
      { type: "grunt", weight: 10 },
      { type: "shooter", weight: t > 30 ? 4 + t / 60 : 0 },
      { type: "sniper", weight: t > 90 ? 2 + t / 90 : 0 },
      { type: "orbiter", weight: t > 150 ? 2 + t / 120 : 0 },
    ]).type;
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
    for (let i = 0; i < count; i++) {
      const a = offset + (i / count) * Math.PI * 2;
      const x = p.x + Math.cos(a) * 430, y = p.y + Math.sin(a) * 430;
      if (Math.hypot(x, y) < ARENA_RADIUS - 30) this.spawn("grunt", x, y);
    }
    this.game.showBanner("SWARM INCOMING", 2, "#ff9a3a");
  }

  spawnBoss() {
    const type = BOSS_CYCLE[this.bossIndex % BOSS_CYCLE.length];
    // Each time the boss cycle repeats, bosses come back tougher.
    const loop = Math.floor(this.bossIndex / BOSS_CYCLE.length);
    this.bossIndex++;
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
