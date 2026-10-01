// Top-level orchestrator: state machine, the simulation step, XP/levels,
// loot, and hand-off to Renderer3D (3D) + Hud (overlay) + GameUI (DOM).

const STATE = {
  MENU: "menu", PLAYING: "playing", PAUSED: "paused",
  LEVELUP: "levelup", INVENTORY: "inventory", GAMEOVER: "gameover",
  TRANSITION: "transition",
};

const newSeed = () => Math.floor(Math.random() * 1e6);

class Game {
  constructor(renderer, overlayCtx) {
    this.renderer = renderer;
    this.hud = new Hud(overlayCtx);
    this.ui = new GameUI(this);
    this.lockPointer = () => {};
    this.unlockPointer = () => {};
    try { this.autoFire = localStorage.getItem("voidrunner.autofire") === "1"; } catch (_) { this.autoFire = false; }

    this.enterFullscreen = () => {};
    this.seed = newSeed();
    this.renderer.newWorld(this.seed, "sunset");
    this.resetRun();
    this.state = STATE.MENU;
    SOUND.music.play("menu"); // starts on the first click/key (autoplay rules)
    this.ui.showMainMenu();
  }

  resetRun() {
    this.player = new Player();
    this.enemies = [];
    this.bullets = [];
    this.particles = [];
    this.gems = [];
    this.loot = [];
    // Short-lived effect entities (rendered by Renderer3D)
    this.swings = [];
    this.blasts = [];
    this.bolts = [];
    this.puddles = [];
    this.popups = [];
    this.dmgNumbers = [];
    this.orbitals = [];
    this.moons = [];        // Moon Shield orbiters
    this.bulletTimeT = 0;   // Bullet Time: enemy shots crawl while > 0
    this.modTimers = { ring: 5 };
    this.staticKills = 0;
    this.corpseBudget = 10;
    this.shakeAmt = 0;  // camera shake strength (world units), decays
    this.hitStop = 0;   // seconds of frozen simulation for impact
    this.gemCombo = 0;
    this.gemComboT = 0;
    this.fxTimers = { nova: 6, trail: 0 };
    this.reactionBudget = 40;
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
    this.aimTarget = null;
    this.lockTime = 0;
    this.stageIndex = 0;
    this.transition = null;
    this.bossGateWarned = false;
    this.yaw = -Math.PI / 2; // facing the sunset
    this.camPitch = this.camPitch === undefined ? CAM.pitch : this.camPitch; // camera tilt/zoom carry over between runs
    this.camDist = this.camDist === undefined ? CAM.dist : this.camDist;
  }

  // ---- Screens / states ------------------------------------------------------

  newGame() {
    this.seed = newSeed();
    this.renderer.newWorld(this.seed, STAGES[0].biome);
    this.resetRun();
    applyPerks(this.player); // Armory upgrades
    this.state = STATE.PLAYING;
    this.ui.show(null);
    this.showBanner("SURVIVE", 2, UI.gold);
    SOUND.duck(false);
    SOUND.music.play(STAGES[0].biome);
    if (SAVE.settings.autoFullscreen) this.enterFullscreen();
    this.lockPointer();
  }

  toMainMenu() {
    if (this.stageIndex !== 0) this.renderer.newWorld(this.seed, "sunset");
    this.resetRun();
    this.state = STATE.MENU;
    this.unlockPointer();
    SOUND.duck(false);
    SOUND.music.play("menu");
    this.ui.showMainMenu();
  }

  // ---- Juice -----------------------------------------------------------------

  shake(amount) {
    if (SAVE.settings.shake) this.shakeAmt = Math.max(this.shakeAmt, amount);
  }

  // Small freezes are rationed so frequent reactions punch instead of
  // stutter; big moments (boss kills, slams) always land.
  freeze(seconds) {
    const now = performance.now();
    if (seconds < 0.1 && now - (this.lastFreeze || 0) < 600) return;
    this.lastFreeze = now;
    this.hitStop = Math.max(this.hitStop, seconds);
  }

  // ---- Stages ----------------------------------------------------------------

  // Move to the next biome once the clock passes its start. A living boss
  // holds the gate for up to 45s ("defeat the boss to advance"); after that
  // the stage changes anyway and the boss follows you through.
  updateStage() {
    const next = STAGES[this.stageIndex + 1];
    if (!next || this.director.time < next.start) return;
    if (this.enemies.some((e) => e.isBoss) && this.director.time < next.start + 45) {
      if (!this.bossGateWarned) {
        this.bossGateWarned = true;
        this.showBanner("DEFEAT THE BOSS TO ADVANCE", 3, "#ff6a8a");
      }
      return;
    }
    this.bossGateWarned = false;
    this.state = STATE.TRANSITION;
    this.transition = { t: 0, dur: 3, swapAt: 0.9, to: this.stageIndex + 1, swapped: false };
    SOUND.play("stage");
    SOUND.music.stop();
  }

  updateTransition(dt) {
    const tr = this.transition;
    tr.t += dt;
    if (!tr.swapped && tr.t >= tr.swapAt) {
      tr.swapped = true;
      this.swapStage(tr.to);
    }
    if (tr.t >= tr.dur) {
      this.transition = null;
      this.state = STATE.PLAYING;
      const stage = STAGES[this.stageIndex];
      this.showBanner(stage.name, 2.5, ELEMENT_BY_BIOME[stage.biome]);
    }
  }

  // Behind the black screen: bank everything on the ground, clear the field
  // and generate the next biome. Nightfall reuses the first island's seed so
  // it's literally the same map after dark.
  swapStage(index) {
    const p = this.player;
    for (const g of this.gems) this.addXp(g.value);
    for (const l of this.loot) this.takeLoot(l.item);
    const bosses = this.enemies.filter((e) => e.isBoss && e.alive);
    this.gems = [];
    this.loot = [];
    this.enemies = bosses;
    this.bullets = [];
    this.swings = [];
    this.blasts = [];
    this.bolts = [];
    this.puddles = [];
    this.popups = [];
    this.particles = [];
    this.aimTarget = null;
    this.stageIndex = index;
    const biome = STAGES[index].biome;
    this.renderer.newWorld(biome === "night" ? this.seed : this.seed + index * 7919, biome);
    p.x = 0;
    p.y = 0;
    p.vx = p.vy = 0;
    p.iframeTimer = Math.max(p.iframeTimer, 1.5); // a moment to get your bearings
    for (const b of bosses) {
      const s = this.director.spawnPoint(450, 560);
      b.x = s.x;
      b.y = s.y;
    }
    SOUND.music.play(biome);
  }

  pause() {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.PAUSED;
    this.unlockPointer();
    SOUND.duck(true);
    this.ui.showPause(this);
  }

  resume() {
    if (this.state !== STATE.PAUSED) return;
    this.state = STATE.PLAYING;
    this.ui.show(null);
    SOUND.duck(false);
    this.lockPointer();
  }

  openInventory() {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.INVENTORY;
    this.unlockPointer();
    SOUND.duck(true);
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
      SOUND.duck(false);
      this.lockPointer();
    } else {
      this.state = STATE.PLAYING;
      this.pause();
    }
  }

  look(dx, dy = 0) {
    if (this.state !== STATE.PLAYING) return;
    const k = 0.0026 * SAVE.settings.sensitivity;
    this.yaw += dx * k;
    this.camPitch = clamp(this.camPitch + dy * k * 0.8 * (SAVE.settings.invertY ? -1 : 1), CAM.minPitch, CAM.maxPitch);
  }

  zoom(deltaY) {
    if (this.state !== STATE.PLAYING) return;
    this.camDist = clamp(this.camDist * Math.exp(deltaY * 0.0012), CAM.minDist, CAM.maxDist);
  }

  usePotion() {
    if (this.state !== STATE.PLAYING) return;
    if (this.player.drinkPotion()) {
      this.hud.toast("DRANK HEALTH POTION", "#ff8a8a");
      this.spawnParticles(this.player.x, this.player.y, "#ff6a6a", 12);
      SOUND.play("potion");
    } else if (this.player.potions === 0) {
      this.hud.toast("NO POTIONS", UI.muted);
      SOUND.play("denied");
    }
  }

  toggleAutoFire() {
    if (this.state !== STATE.PLAYING) return;
    this.autoFire = !this.autoFire;
    try { localStorage.setItem("voidrunner.autofire", this.autoFire ? "1" : "0"); } catch (_) { /* private mode */ }
    this.hud.toast(this.autoFire ? "AUTO-FIRE ON" : "AUTO-FIRE OFF", UI.gold);
  }

  showBanner(text, duration, color) {
    this.bannerText = text;
    this.bannerTimer = this.bannerDuration = duration;
    this.bannerColor = color;
  }

  // ---- Simulation --------------------------------------------------------------

  update(dt, input) {
    if (this.damageFlash > 0) this.damageFlash -= dt;
    this.shakeAmt *= Math.exp(-9 * dt);
    if (this.state === STATE.TRANSITION) return this.updateTransition(dt);
    if (this.state !== STATE.PLAYING) return;
    if (this.bannerTimer > 0) this.bannerTimer -= dt;
    if (this.fullWarnCooldown > 0) this.fullWarnCooldown -= dt;

    const p = this.player;
    p.update(dt, { ...input, yaw: this.yaw });
    if (p.justRolled) {
      p.justRolled = false;
      this.dust(p.x, p.y, 10, Math.atan2(-p.rollDirY, -p.rollDirX), 0.9);
      SOUND.play("roll");
      this.onRoll();
    }
    if (p.justLanded && p.mods.moonBoots) this.stomp();
    if (p.justJumped || p.justLanded) {
      this.dust(p.x, p.y, p.justLanded ? 12 : 6, 0, Math.PI);
      SOUND.play(p.justLanded ? "land" : "jump");
      p.justJumped = p.justLanded = false;
    }
    if (p.justRevived) {
      p.justRevived = false;
      this.showBanner("SECOND HEART!", 2, "#ff8aa8");
      this.clearEnemyBullets(p.x, p.y, 400);
      this.explode(p.x, p.y, 220, 60 * (p.damage / PLAYER.baseDamage), "light");
      this.shake(0.8);
      this.freeze(0.15);
    }
    this.updateAim(dt);
    this.reactionBudget = 40; // caps reaction chains per frame
    p.updateWeapons(dt, this, input.mouseDown);

    this.director.update(dt);
    for (const e of this.enemies) {
      updateEnemyStatus(this, e, dt);
      e.update(dt, p, this.bullets);
      // Hooks raised by enemy patterns.
      if (e.slammed) {
        e.slammed = false;
        this.shake(0.9);
        this.freeze(0.06);
      }
      if (e.wantsSummon) {
        e.wantsSummon = false;
        for (let i = 0; i < 2; i++) this.director.spawn("imp", e.x + rand(-60, 60), e.y + rand(-60, 60));
        this.popup(e, "RISE, MY IMPS", "#ff7a4a");
      }
    }
    if (this.bulletTimeT > 0) this.bulletTimeT -= dt;
    const slow = this.bulletTimeT > 0 ? 0.3 : 1;
    for (const b of this.bullets) b.update(b.owner === "enemy" ? dt * slow : dt);
    for (const pt of this.particles) pt.update(dt);
    for (const gem of this.gems) gem.update(dt, p);

    this.handleCollisions();
    this.updateEffects(dt);
    this.updateAffinityBonuses(dt);
    this.updateMods(dt);
    this.corpseBudget = 10;
    this.collectPickups();
    this.updateBossTracking();

    this.enemies = this.enemies.filter((e) => e.alive);
    this.bullets = this.bullets.filter((b) => !b.dead);
    this.particles = this.particles.filter((pt) => !pt.dead);
    if (this.particles.length > 1400) this.particles.splice(0, this.particles.length - 1400);

    if (!p.alive) return this.onGameOver();
    if (this.pendingLevels > 0) return this.openLevelUp();
    this.updateStage();
  }

  // Soft lock-on. Hills put enemies above/below the fixed crosshair, so
  // instead of relying on the camera's view angle we pick the enemy nearest
  // the aim line (on the ground plane) that we have a clear shot at, and
  // bend shots onto it. The HUD draws lock brackets around it.
  updateAim(dt) {
    const p = this.player;
    const prev = this.aimTarget;
    let best = null, bestScore = Infinity;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = dist(p.x, p.y, e.x, e.y);
      if (d > AIM.range || d < 1) continue;
      const diff = Math.abs(wrapAngle(angleTo(p.x, p.y, e.x, e.y) - p.facing));
      const cone = AIM.cone + Math.atan(e.radius / d) + (e.isBoss ? 0.05 : 0);
      if (diff > cone) continue;
      // Prefer whatever is closest to the crosshair; stick with the current lock.
      let score = diff / cone + (d / AIM.range) * 0.5;
      if (e === prev) score *= 0.6;
      if (score < bestScore && this.clearShot(p.x, p.y, e.x, e.y)) {
        best = e;
        bestScore = score;
      }
    }
    if (best !== prev) this.lockTime = 0;
    this.lockTime += dt;
    this.aimTarget = best;
    if (best) p.aimAngle = angleTo(p.x, p.y, best.x, best.y);
  }

  // True if no tree/rock sits on the straight line between two points.
  clearShot(x1, y1, x2, y2) {
    const len = dist(x1, y1, x2, y2);
    if (len < 1) return true;
    const checked = new Set();
    for (let s = 0; ; s += OB_CELL / 2) {
      const t = Math.min(1, s / len);
      for (const o of obstaclesNear(lerp(x1, x2, t), lerp(y1, y2, t))) {
        if (checked.has(o)) continue;
        checked.add(o);
        if (segmentHitsObstacle(o, x1, y1, x2, y2, 3)) return false;
      }
      if (t >= 1) return true;
    }
  }

  handleCollisions() {
    const p = this.player;
    for (const b of this.bullets) {
      if (b.owner !== "player") continue;
      // Rockets/grenades that run out of range (or hit cover) still detonate.
      if (b.dead) {
        if (b.expired && b.blast && !b.detonated) {
          b.detonated = true;
          this.explode(b.x, b.y, b.blast, b.damage, b.element, b);
        }
        continue;
      }
      if (b.lob && b.age < b.maxLife * 0.75) continue; // still airborne
      for (const e of this.enemies) {
        if (!e.alive || e.overBullets || b.hitIds.has(e.id) || !circleHit(b.x, b.y, b.radius, e.x, e.y, e.radius)) continue;
        b.hitIds.add(e.id);
        this.damageEnemy(e, b.damage, b.element, b);
        this.spawnParticles(b.x, b.y, b.color, 3);
        if (p.mods.kinetic && e.alive) {
          // Kinetic Rounds: shove the target along the shot.
          const sp = Math.hypot(b.vx, b.vy) || 1;
          const k = 16 * p.mods.kinetic * (e.isBoss ? 0.2 : 1);
          e.x += (b.vx / sp) * k;
          e.y += (b.vy / sp) * k;
        }
        if (b.blast && !b.detonated) {
          b.detonated = true;
          this.explode(b.x, b.y, b.blast, b.damage * 0.8, b.element, b);
          b.dead = true;
          break;
        }
        if (b.split && !b.shard) this.splitBullet(b);
        if (b.bounce > 0) {
          const next = findNearestEnemy(b.x, b.y, this.enemies, b.hitIds);
          if (next && dist(next.x, next.y, b.x, b.y) < 320) {
            b.bounce -= 1;
            const a = angleTo(b.x, b.y, next.x, next.y);
            const sp = Math.hypot(b.vx, b.vy);
            b.vx = Math.cos(a) * sp;
            b.vy = Math.sin(a) * sp;
            b.life = Math.max(b.life, 0.8);
            break;
          }
        }
        if (b.boomerang) continue; // boomerangs cut through everything
        if (b.pierce > 0) { b.pierce -= 1; } else { b.dead = true; break; }
      }
    }

    // Jumping clears bullets: they fly underneath you near the apex.
    if (!p.overBullets) {
      for (const b of this.bullets) {
        if (b.owner !== "enemy" || b.dead) continue;
        if (!circleHit(b.x, b.y, b.radius, p.x, p.y, p.radius)) continue;
        if (p.takeDamage(b.damage)) this.onPlayerHit();
        b.dead = true; // a roll's i-frames still eat the bullet harmlessly
      }
    }

    for (const e of this.enemies) {
      if (!e.alive || p.overBullets || e.overBullets) continue;
      if (circleHit(p.x, p.y, p.radius, e.x, e.y, e.radius)) {
        if (p.takeDamage(e.contactDamage * INTENSITY.damage)) this.onPlayerHit();
      }
    }
  }

  collectPickups() {
    const p = this.player;
    // Gem pickups chime, rising in pitch as you vacuum up a streak.
    this.gemComboT -= 1 / 60;
    if (this.gemComboT <= 0) this.gemCombo = 0;
    for (const gem of this.gems) {
      if (!gem.collected) continue;
      this.addXp(gem.value);
      this.gemCombo++;
      this.gemComboT = 0.6;
      SOUND.play("gem", this.gemCombo);
    }
    this.gems = this.gems.filter((g) => !g.collected);

    for (const l of this.loot) {
      if (dist(l.x, l.y, p.x, p.y) > LOOT.pickupRange) continue;
      if (this.takeLoot(l.item)) {
        l.taken = true;
      } else if (this.fullWarnCooldown <= 0) {
        this.fullWarnCooldown = 2.5;
        const msg = l.item.kind === "potion" ? `POTION BELT FULL (${PLAYER.maxPotions}/${PLAYER.maxPotions})` : "BACKPACK FULL - PRESS TAB";
        this.hud.toast(msg, UI.hp.light);
        SOUND.play("denied");
      }
    }
    this.loot = this.loot.filter((l) => !l.taken);
  }

  // Pick up an item: anything already outclassed by gear of the same class
  // is salvaged for XP on the spot instead of taking a slot.
  takeLoot(item) {
    const p = this.player;
    if (item.kind === "potion") {
      if (!p.addPotion()) return false;
      this.hud.toast(`+ HEALTH POTION (${p.potions}/${PLAYER.maxPotions})`, itemColor(item));
      SOUND.play("loot", 0);
      return true;
    }
    if (isOutclassed(item, p)) {
      this.salvage(item);
      return true;
    }
    const result = item.kind === "weapon" ? p.addWeaponItem(item) : p.addToBackpack(item);
    if (!result) return false;
    this.hud.toast(`+ ${item.name.toUpperCase()}${result === "equipped" ? " (EQUIPPED)" : ""}`, itemColor(item));
    SOUND.play("loot", itemTier(item));
    this.autoSalvage();
    return true;
  }

  // Salvage backpack items outclassed by something you own (equipped items
  // are never touched). Called after any pickup or loadout change.
  autoSalvage() {
    const p = this.player;
    for (let i = p.backpack.length - 1; i >= 0; i--) {
      const item = p.backpack[i];
      if (isOutclassed(item, p)) {
        p.backpack.splice(i, 1);
        this.salvage(item);
      }
    }
  }

  salvage(item) {
    const xp = 2 + itemTier(item) * 3 + Math.floor(item.level / 2);
    this.addXp(xp);
    this.hud.toast(`SALVAGED ${item.name.toUpperCase()} +${xp} XP`, UI.muted);
    SOUND.play("salvage");
  }

  // ---- Damage + effects ---------------------------------------------------

  // Every source of player damage funnels through here, so statuses,
  // reactions, lifesteal and kill effects apply consistently.
  damageEnemy(e, amount, element, src, isDot) {
    if (!e.alive) return;
    // Loaded Dice: direct hits can crit for 3x.
    const dice = this.player.mods.dice;
    if (dice && !isDot && Math.random() < 0.1 * dice) {
      amount *= 3;
      e.dmgCrit = true;
    }
    const dealt = amount * enemyDamageMult(this, e);
    e.hp -= dealt;
    if (!isDot) {
      e.hitFlash = 0.08;
      SOUND.play("hit");
    }
    // Damage numbers: hits on one enemy within a short window are summed
    // into a single number so rapid-fire doesn't spray digits everywhere.
    e.dmgAcc = (e.dmgAcc || 0) + dealt;
    if (!e.dmgAccT) e.dmgAccT = 0.12;
    if (element) e.dmgEl = element;

    let steal = 0;
    if (element === "dark" && this.player.tier("dark") >= 1) steal += 0.04;
    if (src && src.vampiric) steal += 0.03;
    if (steal) this.healPlayer(Math.min(dealt * steal, 6));

    if (element) applyElement(this, e, element, amount, src);
    if (e.alive && e.hp <= 0) {
      e.alive = false;
      this.onEnemyKilled(e, element, src);
    }
  }

  healPlayer(amount) {
    const p = this.player;
    if (p.alive) p.hp = Math.min(p.maxHp, p.hp + amount);
  }

  explode(x, y, radius, damage, element, src) {
    this.blasts.push({ x, y, r: radius, t: 0, dur: 0.35, color: elementOf(element).color });
    this.spawnParticles(x, y, elementOf(element).light, 8);
    SOUND.play("explode");
    const near = dist(x, y, this.player.x, this.player.y);
    if (near < 450) this.shake(0.25 * (1 - near / 450));
    for (const e of this.enemies) {
      if (e.alive && dist(e.x, e.y, x, y) < radius + e.radius) this.damageEnemy(e, damage, element, src);
    }
  }

  bolt(x1, y1, x2, y2, color) {
    this.bolts.push({ x1, y1, x2, y2, color, t: 0, dur: 0.14, seed: Math.random() * 1000 });
    SOUND.play("zap");
  }

  // Chain lightning: hop between nearby enemies not yet struck.
  chain(from, jumps, range, damage, element) {
    const hit = new Set([from.id]);
    let cur = from;
    for (let i = 0; i < jumps; i++) {
      let next = null, best = range;
      for (const e of this.enemies) {
        if (!e.alive || hit.has(e.id)) continue;
        const d = dist(e.x, e.y, cur.x, cur.y);
        if (d < best) { best = d; next = e; }
      }
      if (!next) break;
      hit.add(next.id);
      this.bolt(cur.x, cur.y, next.x, next.y, ELEMENTS.energy.color);
      // Chains apply damage without re-rolling more chains (no element).
      this.damageEnemy(next, damage, element === "energy" ? null : element);
      cur = next;
    }
  }

  // Melee: hits every enemy inside the arc at once, and cuts enemy bullets
  // out of the air — the melee answer to bullet hell.
  swing(s) {
    this.swings.push({ ...s, t: 0, dur: 0.2, color: elementOf(s.element).color });
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = dist(e.x, e.y, s.x, s.y);
      if (d > s.range + e.radius) continue;
      if (Math.abs(wrapAngle(angleTo(s.x, s.y, e.x, e.y) - s.angle)) > s.arc / 2 + 0.15) continue;
      const wasAlive = e.alive;
      this.damageEnemy(e, s.damage, s.element, s.item ? { vampiric: s.item.mutations.includes("vampiric") } : null);
      if (wasAlive && !e.alive && s.reap) this.healPlayer(s.reap);
      this.spawnParticles(e.x, e.y, elementOf(s.element).light, 4);
      if (s.item && s.item.mutations.includes("volatile")) this.explode(e.x, e.y, 55, s.damage * 0.6, s.element);
    }
    for (const b of this.bullets) {
      if (b.owner !== "enemy" || b.dead) continue;
      const d = dist(b.x, b.y, s.x, s.y);
      if (d < s.range && Math.abs(wrapAngle(angleTo(s.x, s.y, b.x, b.y) - s.angle)) < s.arc / 2) {
        b.dead = true;
        this.spawnParticles(b.x, b.y, "#ffffff", 1);
      }
    }
    if (s.shock) {
      const sx = s.x + Math.cos(s.angle) * s.range * 0.7, sy = s.y + Math.sin(s.angle) * s.range * 0.7;
      this.explode(sx, sy, s.shock, s.damage * 0.5, s.element);
    }
  }

  splitBullet(b) {
    const base = Math.atan2(b.vy, b.vx);
    for (let i = 0; i < b.split; i++) {
      const a = base + (i - (b.split - 1) / 2) * 0.5;
      const sp = Math.hypot(b.vx, b.vy) * 0.8;
      const shard = new Bullet({
        x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        radius: b.radius * 0.6, damage: b.damage * 0.4, owner: "player", color: b.color,
        element: b.element, shape: "pellet", life: 0.5, shard: true,
      });
      for (const id of b.hitIds) shard.hitIds.add(id);
      this.bullets.push(shard);
    }
  }

  popup(e, text, color) {
    this.popups.push({ x: e.x, y: e.y, h: 2.4, text, color, t: 0, dur: 0.9 });
    if (this.popups.length > 12) this.popups.shift();
  }

  // Emit the summed-up damage for one enemy as a floating number.
  flushDamage(e) {
    const v = Math.round(e.dmgAcc || 0);
    e.dmgAcc = 0;
    e.dmgAccT = 0;
    if (v <= 0 || !SAVE.settings.damageNumbers) return;
    const crit = !!e.dmgCrit;
    const big = v >= 60 || crit;
    this.dmgNumbers.push({
      x: e.x + rand(-10, 10), y: e.y + rand(-10, 10), h: 2.2 * (e.isBoss ? 2.2 : 1),
      text: crit ? v + "!" : String(v), color: crit ? UI.gold : e.dmgEl ? elementOf(e.dmgEl).light : UI.cream,
      big, t: 0, dur: crit ? 0.95 : 0.75,
    });
    e.dmgEl = null;
    e.dmgCrit = false;
    if (this.dmgNumbers.length > 40) this.dmgNumbers.shift();
  }

  spawnPuddle(x, y, r, dps, dur) {
    const big = this.player.tier("slime") >= 1 ? 1.4 : 1;
    this.puddles.push({ x, y, r: r * big, dps, t: 0, dur: dur * big, tick: 0 });
    if (this.puddles.length > 40) this.puddles.shift();
  }

  updateEffects(dt) {
    const age = (list) => {
      for (const f of list) f.t += dt;
      return list.filter((f) => f.t < f.dur);
    };
    this.swings = age(this.swings);
    this.blasts = age(this.blasts);
    this.bolts = age(this.bolts);
    this.popups = age(this.popups);
    this.puddles = age(this.puddles);
    this.dmgNumbers = age(this.dmgNumbers);
    for (const e of this.enemies) {
      if (e.dmgAccT > 0 && (e.dmgAccT -= dt) <= 0) this.flushDamage(e);
    }
    for (const pd of this.puddles) {
      pd.tick -= dt;
      if (pd.tick > 0) continue;
      pd.tick = 0.3;
      for (const e of this.enemies) {
        if (e.alive && dist(e.x, e.y, pd.x, pd.y) < pd.r + e.radius) this.damageEnemy(e, pd.dps * 0.3, "slime", null, true);
      }
    }
  }

  // Tier-3 set bonuses that run on timers, plus holy orbs.
  updateAffinityBonuses(dt) {
    const p = this.player;
    const dmgMul = p.damage / PLAYER.baseDamage;

    if (p.tier("frost") >= 3) {
      this.fxTimers.nova -= dt;
      if (this.fxTimers.nova <= 0) {
        this.fxTimers.nova = 6;
        this.explode(p.x, p.y, 170, 10 * dmgMul, "frost");
        for (const e of this.enemies) if (e.alive && dist(e.x, e.y, p.x, p.y) < 170) applyElement(this, e, "frost", 10);
      }
    }
    if (p.tier("slime") >= 3 && p.moving) {
      this.fxTimers.trail -= dt;
      if (this.fxTimers.trail <= 0) {
        this.fxTimers.trail = 0.3;
        this.spawnPuddle(p.x, p.y, 38, 12 * dmgMul, 2.5);
      }
    }

    const wantOrbs = p.tier("light") >= 3 ? 2 : 0;
    while (this.orbitals.length < wantOrbs) this.orbitals.push({ a: this.orbitals.length * Math.PI, cooldowns: new Map() });
    this.orbitals.length = wantOrbs;
    for (const o of this.orbitals) {
      o.a += dt * 3.2;
      o.x = p.x + Math.cos(o.a) * 75;
      o.y = p.y + Math.sin(o.a) * 75;
      for (const e of this.enemies) {
        if (!e.alive || dist(e.x, e.y, o.x, o.y) > 16 + e.radius) continue;
        const cd = o.cooldowns.get(e.id) || 0;
        if (performance.now() - cd < 400) continue;
        if (o.cooldowns.size > 200) o.cooldowns.clear();
        o.cooldowns.set(e.id, performance.now());
        this.damageEnemy(e, 14 * dmgMul, "light");
      }
    }
  }

  // ---- Zany mods (see upgrades.js) -------------------------------------------

  updateMods(dt) {
    const p = this.player;
    const dmgMul = p.damage / PLAYER.baseDamage;

    // Ring of Fire: a burst of fire bolts every few seconds.
    if (p.mods.ringOfFire) {
      this.modTimers.ring -= dt;
      if (this.modTimers.ring <= 0) {
        this.modTimers.ring = Math.max(2, 5 - p.mods.ringOfFire * 0.75);
        this.nova(p.x, p.y, 12 + 4 * p.mods.ringOfFire, 12 * dmgMul, "fire", 460);
        SOUND.play("explode");
      }
    }

    // Moon Shield: moons orbit, block shots and bonk enemies.
    const want = p.mods.moon || 0;
    while (this.moons.length < want) this.moons.push({ a: 0, cooldowns: new Map() });
    this.moons.forEach((m, i) => {
      m.a += dt * 2.4;
      const a = m.a + (i / this.moons.length) * Math.PI * 2;
      m.x = p.x + Math.cos(a) * 62;
      m.y = p.y + Math.sin(a) * 62;
      for (const b of this.bullets) {
        if (b.owner === "enemy" && !b.dead && dist(b.x, b.y, m.x, m.y) < 14 + b.radius) {
          b.dead = true;
          this.spawnParticles(b.x, b.y, "#d8e0ff", 2);
        }
      }
      for (const e of this.enemies) {
        if (!e.alive || dist(e.x, e.y, m.x, m.y) > 14 + e.radius) continue;
        const now = this.director.time;
        if (now - (m.cooldowns.get(e.id) || -9) < 0.5) continue;
        if (m.cooldowns.size > 200) m.cooldowns.clear();
        m.cooldowns.set(e.id, now);
        this.damageEnemy(e, 18 * dmgMul, null);
      }
    });
  }

  // Radial burst of player bullets.
  nova(x, y, count, damage, element, speed = 420) {
    const off = rand(0, Math.PI * 2);
    for (let i = 0; i < count; i++) {
      const a = off + (i / count) * Math.PI * 2;
      this.bullets.push(new Bullet({
        x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, radius: 4, damage,
        owner: "player", color: elementOf(element).color, element, shape: "orb", life: 1.1,
        wallBounce: (this.player.mods.rubber || 0) * 2,
      }));
    }
  }

  clearEnemyBullets(x, y, radius) {
    for (const b of this.bullets) {
      if (b.owner === "enemy" && !b.dead && dist(b.x, b.y, x, y) < radius) {
        b.dead = true;
        this.spawnParticles(b.x, b.y, "#e8f0ff", 1);
      }
    }
  }

  onRoll() {
    const p = this.player;
    if (p.mods.blankRoll) {
      const r = 110 + 50 * p.mods.blankRoll;
      this.clearEnemyBullets(p.x, p.y, r);
      this.blasts.push({ x: p.x, y: p.y, r, t: 0, dur: 0.3, color: "#e8f0ff" });
      SOUND.play("zap");
    }
    if (p.mods.bulletTime) this.bulletTimeT = 2;
  }

  // Moon Boots: landing slams the ground around you.
  stomp() {
    const p = this.player;
    const r = 80 + 30 * p.mods.moonBoots;
    this.explode(p.x, p.y, r, 20 * p.mods.moonBoots * (p.damage / PLAYER.baseDamage), null);
    for (const e of this.enemies) {
      const d = dist(e.x, e.y, p.x, p.y);
      if (!e.alive || e.isBoss || d > r + e.radius || d < 1) continue;
      e.x += ((e.x - p.x) / d) * 40;
      e.y += ((e.y - p.y) / d) * 40;
    }
    this.shake(0.35);
  }

  addXp(value) {
    const p = this.player;
    p.xp += value * p.xpMul;
    while (p.xp >= XP.toNext(p.level)) {
      p.xp -= XP.toNext(p.level);
      p.level += 1;
      this.pendingLevels += 1;
    }
  }

  openLevelUp() {
    if (this.state !== STATE.LEVELUP) SOUND.play("levelup");
    this.state = STATE.LEVELUP;
    this.unlockPointer();
    SOUND.duck(true);
    const level = this.player.level - this.pendingLevels + 1;
    const threat = this.director.threat;
    const itemLevel = Math.floor(this.director.time / 60);
    this.ui.showLevelUp(rollUpgrades(this.player, 3, threat, itemLevel), level, this.pendingLevels);
  }

  chooseUpgrade(u) {
    u.apply(this.player);
    this.autoSalvage();
    this.pendingLevels -= 1;
    if (this.pendingLevels > 0) {
      this.openLevelUp();
    } else {
      this.state = STATE.PLAYING;
      this.ui.show(null);
      SOUND.duck(false);
      this.lockPointer();
    }
  }

  updateBossTracking() {
    const boss = this.enemies.find((e) => e.isBoss && e.alive);
    if (boss && !this.seenBossIds.has(boss.id)) {
      this.seenBossIds.add(boss.id);
      this.showBanner(`${boss.name.toUpperCase()} APPEARS`, 3, "#ff6a8a");
      SOUND.play("boss");
      this.shake(0.4);
    }
    this.activeBoss = boss || null;
    SOUND.music.intensity = boss ? 1 : 0;
  }

  onPlayerHit() {
    const p = this.player;
    if (p.mods.spite) {
      // Spite: getting hit lashes out.
      this.nova(p.x, p.y, 8 + 8 * p.mods.spite, 16 * (p.damage / PLAYER.baseDamage), "dark", 480);
    }
    this.damageFlash = 0.35;
    this.spawnParticles(this.player.x, this.player.y, "#ff4d4d", 8);
    SOUND.play("hurt");
    this.shake(0.3);
    this.freeze(0.05);
  }

  onEnemyKilled(e) {
    const p = this.player;
    this.score += e.score;
    p.kills += 1;
    this.flushDamage(e);
    this.spawnParticles(e.x, e.y, e.color, e.isBoss ? 60 : 12);
    SOUND.play("kill");
    if (e.isBoss) {
      SOUND.play("explode");
      this.shake(1.2);
      this.freeze(0.22);
    }
    const dmgMul = p.damage / PLAYER.baseDamage;

    // Creature death effects.
    if (e.def.splits) {
      for (let i = 0; i < 2; i++) this.director.spawn(e.def.splits, e.x + rand(-25, 25), e.y + rand(-25, 25));
    }
    if (e.def.deathRing) firePattern("deathRing", e, p, this.bullets);

    // Zany mods that trigger on kills.
    if (p.mods.corpse && this.corpseBudget > 0 && Math.random() < 0.2 * p.mods.corpse) {
      this.corpseBudget--;
      this.explode(e.x, e.y, 60 + e.radius, 10 * dmgMul + e.maxHp * 0.08, "fire");
    }
    if (p.mods.static && ++this.staticKills % 3 === 0) {
      this.chain(e, 1 + 2 * p.mods.static, 280, 18 * dmgMul, "energy");
    }

    // Elemental death effects — the set bonuses that make kills chain.
    if (e.status.slime > 0) this.spawnPuddle(e.x, e.y, 55, 10 * dmgMul * p.potency("slime"), 3);
    if (e.status.fire > 0 && p.tier("fire") >= 2) this.explode(e.x, e.y, 75, 20 * dmgMul * p.potency("fire"), "fire");
    if (e.status.light > 0 && p.tier("light") >= 2) this.healPlayer(3);
    if (p.tier("dark") >= 3) {
      this.bullets.push(new Bullet({
        x: e.x, y: e.y, vx: rand(-80, 80), vy: rand(-80, 80), radius: 4, damage: 12 * dmgMul,
        owner: "player", color: ELEMENTS.dark.color, element: "dark", shape: "orb", life: 3,
        homing: 6, target: findNearestEnemy(e.x, e.y, this.enemies, new Set([e.id])),
      }));
    }

    // XP: bosses burst into many gems; the gem cap keeps huge fights cheap.
    const chunks = e.isBoss ? 8 : 1;
    for (let i = 0; i < chunks; i++) {
      const v = Math.max(1, Math.round(e.xp / chunks));
      if (this.gems.length < MAX_GEMS) this.gems.push(new XpGem(e.x, e.y, v));
      else this.addXp(v);
    }

    const level = Math.floor(this.director.time / 60);
    const threat = this.director.threat;
    if (e.isBoss) {
      for (let i = 0; i < LOOT.bossItemDrops; i++) this.dropLoot(e, makeGear({ level, minRarity: 2 }));
      this.dropLoot(e, makeWeapon({ level, minRarity: 2, threat: threat + 1 }));
      this.dropLoot(e, makePotion());
      this.showBanner(`${e.name.toUpperCase()} DEFEATED`, 3, UI.gold);
    } else {
      if (Math.random() < LOOT.itemDropChance) this.dropLoot(e, makeGear({ level }));
      if (Math.random() < LOOT.weaponDropChance) this.dropLoot(e, makeWeapon({ level, threat }));
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
    SOUND.music.stop();
    SOUND.play("hurt");
    const result = recordRun(this); // saves records + awards shards
    this.ui.showGameOver(this, result);
  }

  // Puff of ground dust in a cone around `angle` (spread = half-angle).
  dust(x, y, count, angle, spread) {
    for (let i = 0; i < count; i++) {
      this.particles.push(new Particle(x, y, i % 2 ? "#b8a07a" : "#8a7a5a", {
        angle: angle + rand(-spread, spread), speed: rand(40, 110), h: 0.15, vh: rand(0.5, 1.6),
        life: rand(0.3, 0.55), size: rand(2, 3.5),
      }));
    }
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
