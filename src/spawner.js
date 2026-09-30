// Decides what spawns each wave and drips enemies in over time rather than
// dumping them all at once.

class Spawner {
  constructor(player) {
    this.player = player;
    this.queue = [];
    this.spawnTimer = 0;
    this.spawnInterval = WAVE.baseSpawnInterval;
    this.waveActive = false;
  }

  startWave(waveNum) {
    this.queue = buildWaveQueue(waveNum);
    this.spawnInterval = Math.max(
      WAVE.spawnIntervalFloor,
      WAVE.baseSpawnInterval - waveNum * 0.04
    );
    this.spawnTimer = 0.4;
    this.waveActive = true;
  }

  get pendingCount() { return this.queue.length; }

  update(dt, enemies, waveNum) {
    if (!this.waveActive) return;
    if (this.queue.length === 0) return;

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = this.spawnInterval;
      const type = this.queue.shift();
      const { x, y } = randomEdgeSpawn(this.player);
      const waveScale = 1 + (waveNum - 1) * 0.12;
      enemies.push(new Enemy(type, x, y, waveScale));
    }
  }
}

// Enemies walk in from the island's edge, never right on top of the player.
function randomEdgeSpawn(player) {
  const r = ARENA_RADIUS - 20;
  for (let tries = 0; tries < 8; tries++) {
    const a = rand(0, Math.PI * 2);
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (!player || dist(x, y, player.x, player.y) > 320) return { x, y };
  }
  const a = Math.atan2(-player.y, -player.x); // far side from the player
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

function buildWaveQueue(waveNum) {
  if (waveNum % WAVE.bossEvery === 0) {
    // Boss wave: the boss plus a small escort. Bosses cycle through the
    // three archetypes so wave 5/10/15 don't all look the same.
    const cycleIndex = Math.floor(waveNum / WAVE.bossEvery) - 1;
    const bossType = BOSS_CYCLE[cycleIndex % BOSS_CYCLE.length];
    const escort = Math.min(4, 1 + Math.floor(waveNum / WAVE.bossEvery));
    const queue = new Array(escort).fill("grunt");
    queue.push(bossType);
    return queue;
  }

  const total = Math.round(WAVE.baseEnemyCount + (waveNum - 1) * WAVE.enemyCountGrowth);
  const pool = [
    { type: "grunt", weight: 10 },
    { type: "shooter", weight: waveNum >= 2 ? 7 : 3 },
    { type: "sniper", weight: waveNum >= 3 ? 5 : 0 },
    { type: "orbiter", weight: waveNum >= 4 ? 4 : 0 },
  ];

  const queue = [];
  for (let i = 0; i < total; i++) {
    queue.push(weightedPick(pool).type);
  }
  // Front-load a couple of grunts so the player isn't shot at from frame one.
  queue.sort((a, b) => (a === "grunt" ? -1 : 0) - (b === "grunt" ? -1 : 0));
  return queue;
}
