// Top-level orchestrator: owns state, entities, the update/draw loop, and
// wires results into the DOM overlays (start/upgrade/game-over screens + HUD).

const STATE = { START: "start", PLAYING: "playing", UPGRADE: "upgrade", GAMEOVER: "gameover" };

class Game {
  constructor(ctx) {
    this.ctx = ctx;
    this.state = STATE.START;
    this.reset();
    this.cacheDom();
    this.bindUi();
  }

  cacheDom() {
    this.dom = {
      hpBar: document.getElementById("hpBar"),
      dashBar: document.getElementById("dashBar"),
      waveLabel: document.getElementById("waveLabel"),
      scoreLabel: document.getElementById("scoreLabel"),
      startScreen: document.getElementById("startScreen"),
      upgradeScreen: document.getElementById("upgradeScreen"),
      upgradeCards: document.getElementById("upgradeCards"),
      gameOverScreen: document.getElementById("gameOverScreen"),
      finalStats: document.getElementById("finalStats"),
      startBtn: document.getElementById("startBtn"),
      restartBtn: document.getElementById("restartBtn"),
    };
  }

  bindUi() {
    this.dom.startBtn.addEventListener("click", () => this.startRun());
    this.dom.restartBtn.addEventListener("click", () => this.startRun());
  }

  reset() {
    this.player = new Player();
    this.enemies = [];
    this.bullets = [];
    this.particles = [];
    this.spawner = new Spawner();
    this.wave = 1;
    this.score = 0;
    this.waveTransitionTimer = 0;
  }

  startRun() {
    this.reset();
    this.state = STATE.PLAYING;
    this.spawner.startWave(this.wave);
    this.dom.startScreen.classList.add("hidden");
    this.dom.upgradeScreen.classList.add("hidden");
    this.dom.gameOverScreen.classList.add("hidden");
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  update(dt, input) {
    if (this.state !== STATE.PLAYING) return;

    this.player.update(dt, input);
    if (input.mouseDown) this.player.tryShoot(this.bullets);

    this.spawner.update(dt, this.enemies, this.wave);

    for (const e of this.enemies) e.update(dt, this.player, this.bullets);
    for (const b of this.bullets) b.update(dt);
    for (const p of this.particles) p.update(dt);

    this.handleCollisions();

    this.enemies = this.enemies.filter((e) => e.alive);
    this.bullets = this.bullets.filter((b) => !b.dead);
    this.particles = this.particles.filter((p) => !p.dead);

    if (!this.player.alive) {
      this.onGameOver();
      return;
    }

    const waveDone = this.spawner.pendingCount === 0 && this.enemies.length === 0 && this.spawner.waveActive;
    if (waveDone) {
      this.spawner.waveActive = false;
      this.onWaveCleared();
    }

    this.syncHud();
  }

  handleCollisions() {
    // Player bullets vs enemies
    for (const b of this.bullets) {
      if (b.owner !== "player" || b.dead) continue;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (circleHit(b.x, b.y, b.radius, e.x, e.y, e.radius)) {
          const killed = e.takeDamage(b.damage);
          this.spawnHitParticles(b.x, b.y, e.color, 4);
          if (killed) this.onEnemyKilled(e);
          if (b.pierce > 0) { b.pierce -= 1; } else { b.dead = true; break; }
        }
      }
    }

    // Enemy bullets vs player
    for (const b of this.bullets) {
      if (b.owner !== "enemy" || b.dead) continue;
      if (circleHit(b.x, b.y, b.radius, this.player.x, this.player.y, this.player.radius)) {
        const hit = this.player.takeDamage(b.damage);
        if (hit) {
          this.spawnHitParticles(this.player.x, this.player.y, COLORS.player, 6);
          b.dead = true;
        } else if (this.player.isInvulnerable) {
          b.dead = true; // dashing through bullets destroys them harmlessly
        }
      }
    }

    // Enemy contact damage vs player
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (circleHit(this.player.x, this.player.y, this.player.radius, e.x, e.y, e.radius)) {
        this.player.takeDamage(e.contactDamage);
      }
    }
  }

  onEnemyKilled(e) {
    this.score += e.score;
    this.spawnHitParticles(e.x, e.y, e.color, e.type === "boss" ? 40 : 10);
  }

  onWaveCleared() {
    this.state = STATE.UPGRADE;
    this.showUpgradeScreen();
  }

  onGameOver() {
    this.state = STATE.GAMEOVER;
    this.dom.finalStats.textContent = `Wave ${this.wave} — Score ${this.score}`;
    this.dom.gameOverScreen.classList.remove("hidden");
  }

  // -------------------------------------------------------------------------
  // Upgrade screen
  // -------------------------------------------------------------------------

  showUpgradeScreen() {
    const picks = rollUpgrades(3);
    this.dom.upgradeCards.innerHTML = "";
    for (const u of picks) {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="icon">${u.icon}</div>
        <div class="name">${u.name}</div>
        <div class="desc">${u.desc}</div>
        <div class="rarity rarity-${u.rarity}">${u.rarity}</div>
      `;
      card.addEventListener("click", () => this.chooseUpgrade(u));
      this.dom.upgradeCards.appendChild(card);
    }
    this.dom.upgradeScreen.classList.remove("hidden");
  }

  chooseUpgrade(u) {
    u.apply(this.player);
    this.dom.upgradeScreen.classList.add("hidden");
    this.wave += 1;
    this.spawner.startWave(this.wave);
    this.state = STATE.PLAYING;
  }

  // -------------------------------------------------------------------------
  // FX helpers
  // -------------------------------------------------------------------------

  spawnHitParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) this.particles.push(new Particle(x, y, color));
  }

  // -------------------------------------------------------------------------
  // HUD
  // -------------------------------------------------------------------------

  syncHud() {
    const hpPct = clamp((this.player.hp / this.player.maxHp) * 100, 0, 100);
    this.dom.hpBar.style.width = hpPct + "%";
    const dashPct = this.player.dashReady
      ? 100
      : clamp(100 - (this.player.dashCooldownTimer / this.player.dashCooldown) * 100, 0, 100);
    this.dom.dashBar.style.width = dashPct + "%";
    this.dom.waveLabel.textContent = "Wave " + this.wave;
    this.dom.scoreLabel.textContent = "Score " + this.score;
  }

  // -------------------------------------------------------------------------
  // Draw
  // -------------------------------------------------------------------------

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // subtle background grid
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    for (let x = 0; x < CANVAS_W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke();
    }
    for (let y = 0; y < CANVAS_H; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke();
    }
    ctx.restore();

    if (this.state === STATE.START) return;

    for (const p of this.particles) p.draw(ctx);
    for (const e of this.enemies) e.draw(ctx);
    for (const b of this.bullets) b.draw(ctx);
    if (this.player.alive) this.player.draw(ctx);
  }
}
