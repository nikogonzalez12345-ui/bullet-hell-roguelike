// Top-level orchestrator: state machine, the simulation step, XP/levels,
// loot, and hand-off to Renderer3D (3D) + Hud (overlay) + GameUI (DOM).

const STATE = {
  MENU: "menu", PLAYING: "playing", PAUSED: "paused",
  LEVELUP: "levelup", INVENTORY: "inventory", GAMEOVER: "gameover",
};

const newSeed = () => Math.floor(Math.random() * 1e6);

class Game {
  constructor(renderer, overlayCtx) {
    this.renderer = renderer;
    this.hud = new Hud(overlayCtx);
    this.ui = new GameUI(this);
    this.lockPointer = () => {};
    this.unlockPointer = () => {};

    this.seed = newSeed();
    this.renderer.newWorld(this.seed);
    this.resetRun();
    this.state = STATE.MENU;
    this.ui.show("mainMenu");
  }

  resetRun() {
    this.player = new Player();
    this.enemies = [];
    this.bullets = [];
    this.particles = [];
    this.gems = [];
    this.loot = [];
    this.director = new Director(this);
    this.score = 0;
    this.pendingLevels = 0;
    this.seenBossIds = new Set();
    this.activeBoss = null;
    this.bannerText = null;
    this.bannerTimer = 0;
    this.bannerDuration = 1;
    this.bannerColor = UI.gold;
    this.damageFlash = 0;
    this.fullWarnCooldown = 0;
    this.yaw = -Math.PI / 2; // facing the sunset
  }

  // ---- Screens / states ------------------------------------------------------

  newGame() {
    this.seed = newSeed();
    this.renderer.newWorld(this.seed);
    this.resetRun();
    this.state = STATE.PLAYING;
    this.ui.show(null);
    this.showBanner("SURVIVE", 2, UI.gold);
    this.lockPointer();
  }

  toMainMenu() {
    this.resetRun();
    this.state = STATE.MENU;
    this.unlockPointer();
    this.ui.show("mainMenu");
  }

  pause() {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.PAUSED;
    this.unlockPointer();
    this.ui.showPause(this);
  }

  resume() {
    if (this.state !== STATE.PAUSED) return;
    this.state = STATE.PLAYING;
    this.ui.show(null);
    this.lockPointer();
  }

  openInventory() {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.INVENTORY;
    this.unlockPointer();
    this.ui.renderInventory();
    this.ui.show("inventory");
  }

  // `relock` is false when closed with Esc — browsers won't grant pointer
  // lock from an Esc press, so we fall back to the click-to-resume screen.
  closeInventory(relock) {
    if (this.state !== STATE.INVENTORY) return;
    if (relock) {
      this.state = STATE.PLAYING;
      this.ui.show(null);
      this.lockPointer();
    } else {
      this.state = STATE.PLAYING;
      this.pause();
    }
  }

  look(dx) {
    if (this.state === STATE.PLAYING) this.yaw += dx * 0.0026;
  }

  usePotion() {
    if (this.state !== STATE.PLAYING) return;
    if (this.player.drinkPotion()) {
      this.hud.toast("DRANK HEALTH POTION", "#ff8a8a");
      this.spawnParticles(this.player.x, this.player.y, "#ff6a6a", 12);
    } else if (this.player.potionCount === 0) {
      this.hud.toast("NO POTIONS", UI.muted);
    }
  }

  showBanner(text, duration, color) {
    this.bannerText = text;
    this.bannerTimer = this.bannerDuration = duration;
    this.bannerColor = color;
  }

  // ---- Simulation --------------------------------------------------------------

  update(dt, input) {
    if (this.damageFlash > 0) this.damageFlash -= dt;
    if (this.state !== STATE.PLAYING) return;
    if (this.bannerTimer > 0) this.bannerTimer -= dt;
    if (this.fullWarnCooldown > 0) this.fullWarnCooldown -= dt;

    const p = this.player;
    p.update(dt, { ...input, yaw: this.yaw });
    if (input.mouseDown) p.tryShoot(this.bullets, this.enemies);

    this.director.update(dt);
    for (const e of this.enemies) e.update(dt, p, this.bullets);
    for (const b of this.bullets) b.update(dt);
    for (const pt of this.particles) pt.update(dt);
    for (const gem of this.gems) gem.update(dt, p);

    this.handleCollisions();
    this.collectPickups();
    this.updateBossTracking();

    this.enemies = this.enemies.filter((e) => e.alive);
    this.bullets = this.bullets.filter((b) => !b.dead);
    this.particles = this.particles.filter((pt) => !pt.dead);

    if (!p.alive) return this.onGameOver();
    if (this.pendingLevels > 0) this.openLevelUp();
  }

  handleCollisions() {
    const p = this.player;
    for (const b of this.bullets) {
      if (b.owner !== "player" || b.dead) continue;
      for (const e of this.enemies) {
        if (!e.alive || !circleHit(b.x, b.y, b.radius, e.x, e.y, e.radius)) continue;
        const killed = e.takeDamage(b.damage);
        this.spawnParticles(b.x, b.y, e.color, 3);
        if (killed) this.onEnemyKilled(e);
        if (b.pierce > 0) { b.pierce -= 1; } else { b.dead = true; break; }
      }
    }

    for (const b of this.bullets) {
      if (b.owner !== "enemy" || b.dead) continue;
      if (!circleHit(b.x, b.y, b.radius, p.x, p.y, p.radius)) continue;
      if (p.takeDamage(b.damage)) this.onPlayerHit();
      b.dead = true; // a roll's i-frames still eat the bullet harmlessly
    }

    for (const e of this.enemies) {
      if (e.alive && circleHit(p.x, p.y, p.radius, e.x, e.y, e.radius)) {
        if (p.takeDamage(e.contactDamage * INTENSITY.damage)) this.onPlayerHit();
      }
    }
  }

  collectPickups() {
    const p = this.player;
    for (const gem of this.gems) if (gem.collected) this.addXp(gem.value);
    this.gems = this.gems.filter((g) => !g.collected);

    for (const l of this.loot) {
      if (dist(l.x, l.y, p.x, p.y) > LOOT.pickupRange) continue;
      if (p.addToBackpack(l.item)) {
        l.taken = true;
        this.hud.toast(`+ ${l.item.name.toUpperCase()}`, itemColor(l.item));
      } else if (this.fullWarnCooldown <= 0) {
        this.fullWarnCooldown = 2.5;
        this.hud.toast("BACKPACK FULL - PRESS TAB", UI.hp.light);
      }
    }
    this.loot = this.loot.filter((l) => !l.taken);
  }

  addXp(value) {
    const p = this.player;
    p.xp += value;
    while (p.xp >= XP.toNext(p.level)) {
      p.xp -= XP.toNext(p.level);
      p.level += 1;
      this.pendingLevels += 1;
    }
  }

  openLevelUp() {
    this.state = STATE.LEVELUP;
    this.unlockPointer();
    const level = this.player.level - this.pendingLevels + 1;
    this.ui.showLevelUp(rollUpgrades(this.player, 3), level, this.pendingLevels);
  }

  chooseUpgrade(u) {
    u.apply(this.player);
    this.pendingLevels -= 1;
    if (this.pendingLevels > 0) {
      this.openLevelUp();
    } else {
      this.state = STATE.PLAYING;
      this.ui.show(null);
      this.lockPointer();
    }
  }

  updateBossTracking() {
    const boss = this.enemies.find((e) => e.isBoss && e.alive);
    if (boss && !this.seenBossIds.has(boss.id)) {
      this.seenBossIds.add(boss.id);
      this.showBanner(`${boss.name.toUpperCase()} APPEARS`, 3, "#ff6a8a");
    }
    this.activeBoss = boss || null;
  }

  onPlayerHit() {
    this.damageFlash = 0.35;
    this.spawnParticles(this.player.x, this.player.y, "#ff4d4d", 8);
  }

  onEnemyKilled(e) {
    this.score += e.score;
    this.player.kills += 1;
    this.spawnParticles(e.x, e.y, e.color, e.isBoss ? 60 : 12);

    // XP: bosses burst into many gems; the gem cap keeps huge fights cheap.
    const chunks = e.isBoss ? 8 : 1;
    for (let i = 0; i < chunks; i++) {
      const v = Math.max(1, Math.round(e.xp / chunks));
      if (this.gems.length < MAX_GEMS) this.gems.push(new XpGem(e.x, e.y, v));
      else this.addXp(v);
    }

    const level = Math.floor(this.director.time / 60);
    if (e.isBoss) {
      for (let i = 0; i < LOOT.bossItemDrops; i++) this.dropLoot(e, makeGear({ level, minRarity: 2 }));
      this.dropLoot(e, makePotion());
      this.showBanner(`${e.name.toUpperCase()} DEFEATED`, 3, UI.gold);
    } else {
      if (Math.random() < LOOT.itemDropChance) this.dropLoot(e, makeGear({ level }));
      if (Math.random() < LOOT.potionDropChance) this.dropLoot(e, makePotion());
    }
  }

  dropLoot(e, item) {
    this.loot.push(new Loot(e.x, e.y, item));
    // Don't let an ignored floor of commons pile up forever.
    if (this.loot.length > 60) {
      const i = this.loot.findIndex((l) => l.item.rarity === "common");
      this.loot.splice(i >= 0 ? i : 0, 1);
    }
  }

  onGameOver() {
    this.state = STATE.GAMEOVER;
    this.unlockPointer();
    this.ui.showGameOver(this);
  }

  spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) this.particles.push(new Particle(x, y, color));
  }

  // ---- Render ----------------------------------------------------------------

  render(dt) {
    this.renderer.render(this, dt);
    this.hud.draw(this, dt);
  }
}
