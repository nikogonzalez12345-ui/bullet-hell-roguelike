// Top-level orchestrator: owns state, entities and the update loop, hands
// rendering to Renderer3D, and draws the 2D overlay (crosshair, radar, boss
// bar, banners) on top.

const STATE = { START: "start", PLAYING: "playing", PAUSED: "paused", UPGRADE: "upgrade", GAMEOVER: "gameover" };

const RADAR = { x: CANVAS_W - 82, y: VIEW_TOP + 82, r: 64, range: 560 };

class Game {
  constructor(renderer, overlayCtx) {
    this.renderer = renderer;
    this.ctx = overlayCtx;
    this.state = STATE.START;
    this.lockPointer = () => {};
    this.unlockPointer = () => {};
    this.reset();
    this.cacheDom();
    this.bindUi();
  }

  cacheDom() {
    const $ = (id) => document.getElementById(id);
    this.dom = {
      hpBar: $("hpBar"),
      dashBar: $("dashBar"),
      waveLabel: $("waveLabel"),
      scoreLabel: $("scoreLabel"),
      weaponRow: $("weaponRow"),
      startScreen: $("startScreen"),
      pauseScreen: $("pauseScreen"),
      upgradeScreen: $("upgradeScreen"),
      upgradeCards: $("upgradeCards"),
      gameOverScreen: $("gameOverScreen"),
      finalStats: $("finalStats"),
      startBtn: $("startBtn"),
      restartBtn: $("restartBtn"),
    };
  }

  bindUi() {
    this.dom.startBtn.addEventListener("click", () => this.startRun());
    this.dom.restartBtn.addEventListener("click", () => this.startRun());
    this.dom.pauseScreen.addEventListener("click", () => this.resume());
  }

  reset() {
    this.player = new Player();
    this.enemies = [];
    this.bullets = [];
    this.particles = [];
    this.spawner = new Spawner(this.player);
    this.wave = 1;
    this.score = 0;
    this.seenBossIds = new Set();
    this.bannerText = null;
    this.bannerTimer = 0;
    this.activeBoss = null;
    this.damageFlash = 0;
    this.yaw = -Math.PI / 2; // facing the sunset
    this.pitch = 0.32;
  }

  startRun() {
    this.reset();
    this.state = STATE.PLAYING;
    this.spawner.startWave(this.wave);
    this.dom.startScreen.classList.add("hidden");
    this.dom.upgradeScreen.classList.add("hidden");
    this.dom.gameOverScreen.classList.add("hidden");
    this.dom.pauseScreen.classList.add("hidden");
    this.lockPointer();
  }

  pause() {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.PAUSED;
    this.dom.pauseScreen.classList.remove("hidden");
  }

  resume() {
    if (this.state !== STATE.PAUSED) return;
    this.state = STATE.PLAYING;
    this.dom.pauseScreen.classList.add("hidden");
    this.lockPointer();
  }

  look(dx, dy) {
    if (this.state !== STATE.PLAYING) return;
    this.yaw += dx * 0.0026;
    this.pitch = clamp(this.pitch + dy * 0.002, -0.15, 0.95);
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  update(dt, input) {
    if (this.damageFlash > 0) this.damageFlash -= dt;
    if (this.state !== STATE.PLAYING) return;

    this.player.update(dt, { ...input, yaw: this.yaw });
    if (input.mouseDown) this.player.tryShoot(this.bullets, this.enemies);

    this.spawner.update(dt, this.enemies, this.wave);

    for (const e of this.enemies) e.update(dt, this.player, this.bullets);
    for (const b of this.bullets) b.update(dt);
    for (const p of this.particles) p.update(dt);

    this.handleCollisions();
    this.updateBossTracking();

    this.enemies = this.enemies.filter((e) => e.alive);
    this.bullets = this.bullets.filter((b) => !b.dead);
    this.particles = this.particles.filter((p) => !p.dead);

    if (this.bannerTimer > 0) this.bannerTimer -= dt;

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

  updateBossTracking() {
    const boss = this.enemies.find((e) => e.isBoss && e.alive);
    if (boss && !this.seenBossIds.has(boss.id)) {
      this.seenBossIds.add(boss.id);
      this.bannerText = `WAVE ${this.wave} — ${boss.name.toUpperCase()}`;
      this.bannerTimer = 3;
    }
    this.activeBoss = boss || null;
  }

  handleCollisions() {
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

    for (const b of this.bullets) {
      if (b.owner !== "enemy" || b.dead) continue;
      if (circleHit(b.x, b.y, b.radius, this.player.x, this.player.y, this.player.radius)) {
        if (this.player.takeDamage(b.damage)) {
          this.onPlayerHit();
          b.dead = true;
        } else if (this.player.isInvulnerable) {
          b.dead = true; // rolling through bullets destroys them harmlessly
        }
      }
    }

    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (circleHit(this.player.x, this.player.y, this.player.radius, e.x, e.y, e.radius)) {
        if (this.player.takeDamage(e.contactDamage)) this.onPlayerHit();
      }
    }
  }

  onPlayerHit() {
    this.damageFlash = 0.35;
    this.spawnHitParticles(this.player.x, this.player.y, "#ff4d4d", 8);
  }

  onEnemyKilled(e) {
    this.score += e.score;
    this.spawnHitParticles(e.x, e.y, e.color, e.isBoss ? 60 : 14);
  }

  onWaveCleared() {
    this.state = STATE.UPGRADE;
    this.unlockPointer();
    this.showUpgradeScreen();
  }

  onGameOver() {
    this.state = STATE.GAMEOVER;
    this.unlockPointer();
    this.dom.finalStats.textContent = `Wave ${this.wave} — Score ${this.score}`;
    this.dom.gameOverScreen.classList.remove("hidden");
  }

  // -------------------------------------------------------------------------
  // Upgrade screen
  // -------------------------------------------------------------------------

  showUpgradeScreen() {
    const picks = rollUpgrades(this.player, 3);
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
    this.lockPointer();
  }

  spawnHitParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) this.particles.push(new Particle(x, y, color));
  }

  // -------------------------------------------------------------------------
  // HUD (DOM)
  // -------------------------------------------------------------------------

  syncHud() {
    const hpPct = clamp((this.player.hp / this.player.maxHp) * 100, 0, 100);
    this.dom.hpBar.style.width = hpPct + "%";
    const rollPct = this.player.rollReady
      ? 100
      : clamp(100 - (this.player.rollCooldownTimer / this.player.rollCooldown) * 100, 0, 100);
    this.dom.dashBar.style.width = rollPct + "%";
    this.dom.waveLabel.textContent = "Wave " + this.wave;
    this.dom.scoreLabel.textContent = "Score " + this.score;

    const weaponKey = this.player.weapons.join(",");
    if (this.dom.weaponRow.dataset.key !== weaponKey) {
      this.dom.weaponRow.dataset.key = weaponKey;
      this.dom.weaponRow.innerHTML = this.player.weapons
        .map((id) => `<span class="weaponChip" style="--wc:${WEAPONS[id].color}">${WEAPONS[id].icon} ${WEAPONS[id].name}</span>`)
        .join("");
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  render(dt) {
    this.renderer.render(this, dt);

    const ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    if (this.state === STATE.START) return;

    if (this.damageFlash > 0) this.drawDamageVignette(ctx);
    if (this.state === STATE.PLAYING) this.drawCrosshair(ctx);
    this.drawRadar(ctx);
    this.drawBossUi(ctx);
    this.drawBanner(ctx);
  }

  drawCrosshair(ctx) {
    const { x, y } = this.renderer.projectAim(this);
    ctx.save();
    ctx.strokeStyle = "rgba(255, 240, 220, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 10, y); ctx.lineTo(x - 4, y);
    ctx.moveTo(x + 4, y); ctx.lineTo(x + 10, y);
    ctx.moveTo(x, y - 10); ctx.lineTo(x, y - 4);
    ctx.moveTo(x, y + 4); ctx.lineTo(x, y + 10);
    ctx.stroke();
    ctx.restore();
  }

  // Player-relative radar, forward = up. Essential in 3rd person: it's the
  // only way to see bullets coming from behind.
  drawRadar(ctx) {
    const { x: cx, y: cy, r, range } = RADAR;
    const p = this.player;
    const cos = Math.cos(this.yaw), sin = Math.sin(this.yaw);
    const k = r / range;
    const toRadar = (wx, wy) => {
      const dx = wx - p.x, dy = wy - p.y;
      const f = dx * cos + dy * sin;
      const s = -dx * sin + dy * cos;
      return [cx + s * k, cy - f * k];
    };

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(10, 6, 12, 0.6)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 170, 110, 0.5)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.clip();

    // Island edge
    const [ex, ey] = toRadar(0, 0);
    ctx.beginPath();
    ctx.arc(ex, ey, ARENA_RADIUS * k, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(120, 200, 120, 0.35)";
    ctx.stroke();

    ctx.fillStyle = "rgba(160, 150, 140, 0.5)";
    for (const o of OBSTACLES) {
      const [ox, oy] = toRadar(o.x, o.y);
      ctx.fillRect(ox - 2, oy - 2, 4, 4);
    }
    for (const b of this.bullets) {
      if (b.owner !== "enemy") continue;
      const [bx, by] = toRadar(b.x, b.y);
      ctx.fillStyle = b.color;
      ctx.fillRect(bx - 1, by - 1, 2, 2);
    }
    for (const e of this.enemies) {
      const [x, y] = toRadar(e.x, e.y);
      const s = e.isBoss ? 7 : 4;
      ctx.fillStyle = e.color;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(cx, cy - 5);
    ctx.lineTo(cx - 4, cy + 4);
    ctx.lineTo(cx + 4, cy + 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawDamageVignette(ctx) {
    const a = clamp(this.damageFlash / 0.35, 0, 1) * 0.55;
    const g = ctx.createRadialGradient(CANVAS_W / 2, CANVAS_H / 2, 180, CANVAS_W / 2, CANVAS_H / 2, 560);
    g.addColorStop(0, "rgba(255,0,0,0)");
    g.addColorStop(1, `rgba(255,20,20,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, VIEW_TOP, CANVAS_W, VIEW_H);
  }

  drawBossUi(ctx) {
    if (!this.activeBoss) return;
    const boss = this.activeBoss;
    const w = 440, x = (CANVAS_W - w) / 2, y = VIEW_TOP + 10;
    const pct = clamp(boss.hp / boss.maxHp, 0, 1);

    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "bold 13px 'Segoe UI', sans-serif";
    ctx.fillStyle = "#ffd23b";
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 4;
    ctx.fillText(boss.name.toUpperCase(), CANVAS_W / 2, y + 12);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x, y + 18, w, 10);
    ctx.fillStyle = "#ff2b4d";
    ctx.fillRect(x, y + 18, w * pct, 10);
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.strokeRect(x, y + 18, w, 10);
    ctx.restore();
  }

  drawBanner(ctx) {
    if (this.bannerTimer <= 0 || !this.bannerText) return;
    const fadeIn = this.bannerTimer > 2.5 ? (3 - this.bannerTimer) / 0.5 : 1;
    const fadeOut = clamp(this.bannerTimer / 0.6, 0, 1);
    ctx.save();
    ctx.globalAlpha = clamp(Math.min(fadeIn, fadeOut), 0, 1);
    ctx.textAlign = "center";
    ctx.font = "bold 30px 'Segoe UI', sans-serif";
    ctx.fillStyle = "#ffcf6b";
    ctx.shadowColor = "#ff2b4d";
    ctx.shadowBlur = 18;
    ctx.fillText(this.bannerText, CANVAS_W / 2, CANVAS_H / 2 - 60);
    ctx.restore();
  }
}
