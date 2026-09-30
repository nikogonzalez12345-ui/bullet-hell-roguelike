// Decides what spawns each wave and drips enemies in over time rather than
// dumping them all at once.

class Spawner {
  constructor() {
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
      const { x, y } = randomEdgeSpawn();
      const waveScale = 1 + (waveNum - 1) * 0.12;
      enemies.push(new Enemy(type, x, y, waveScale));
    }
  }
}

function randomEdgeSpawn() {
  const margin = 40;
  const side = randInt(0, 3);
  switch (side) {
    case 0: return { x: rand(margin, CANVAS_W - margin), y: -margin }; // top
    case 1: return { x: CANVAS_W + margin, y: rand(margin, CANVAS_H - margin) }; // right
    case 2: return { x: rand(margin, CANVAS_W - margin), y: CANVAS_H + margin }; // bottom
    default: return { x: -margin, y: rand(margin, CANVAS_H - margin) }; // left
  }
}

function buildWaveQueue(waveNum) {
  if (waveNum % WAVE.bossEvery === 0) {
    // Boss wave: the boss plus a small escort.
    const escort = Math.min(4, 1 + Math.floor(waveNum / WAVE.bossEvery));
    const queue = new Array(escort).fill("grunt");
    queue.push("boss");
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
