// Pixel-art HUD drawn on the 2D overlay canvas. Everything snaps to a 3px
// grid and uses the island palette (UI in constants.js) so it reads like
// part of the same low-res world.

const PX = 3;
// Radar sits in the top-right corner of whatever size the screen currently is.
const RADAR = { r: 66, range: 700, get x() { return CANVAS_W - 84; }, get y() { return VIEW_TOP + 84; } };

function hudText(ctx, text, x, y, size, color, align = "left") {
  ctx.font = `${size}px ${UI.font}`;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  const o = size >= 16 ? PX : 2;
  ctx.fillStyle = UI.ink;
  ctx.fillText(text, x + o, y + o);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// Ink outline, maroon fill, a lighter inner rim — a chunky pixel frame.
function hudPanel(ctx, x, y, w, h, alpha = 0.85) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = UI.ink;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = UI.panelLight;
  ctx.fillRect(x + PX, y + PX, w - PX * 2, h - PX * 2);
  ctx.fillStyle = UI.panel;
  ctx.fillRect(x + PX * 2, y + PX * 2, w - PX * 4, h - PX * 4);
  ctx.globalAlpha = 1;
}

// Segmented bar: ink border, dark trough, fill with a highlight row on top
// and a shade row underneath, plus notches every `seg` pixels.
function hudBar(ctx, x, y, w, h, pct, pal, seg = 15) {
  ctx.fillStyle = UI.ink;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = pal.dark;
  ctx.globalAlpha = 0.45;
  ctx.fillRect(x + PX, y + PX, w - PX * 2, h - PX * 2);
  ctx.globalAlpha = 1;
  const inner = w - PX * 2;
  const fw = Math.round((inner * clamp(pct, 0, 1)) / PX) * PX;
  if (fw > 0) {
    ctx.fillStyle = pal.fill;
    ctx.fillRect(x + PX, y + PX, fw, h - PX * 2);
    ctx.fillStyle = pal.light;
    ctx.fillRect(x + PX, y + PX, fw, PX);
    ctx.fillStyle = pal.dark;
    ctx.fillRect(x + PX, y + h - PX * 2, fw, PX);
  }
  ctx.fillStyle = UI.ink;
  ctx.globalAlpha = 0.5;
  for (let sx = x + PX + seg; sx < x + w - PX; sx += seg) ctx.fillRect(sx, y + PX, PX / 3 * 1, h - PX * 2);
  ctx.globalAlpha = 1;
}

// Accent colour for each stage's title text.
const ELEMENT_BY_BIOME = { sunset: "#ffb050", night: "#9ab4f0", cave: "#7ae0ff", hell: "#ff5a2a" };

function fmtClock(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

class Hud {
  constructor(ctx) {
    this.ctx = ctx;
    this.messages = [];
  }

  toast(text, color) {
    this.messages.push({ text, color, t: 3 });
    if (this.messages.length > 5) this.messages.shift();
  }

  draw(game, dt) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.imageSmoothingEnabled = false;
    if (game.state === STATE.MENU) return;

    if (game.damageFlash > 0) this.drawDamage(ctx, game.damageFlash);
    this.drawVitals(ctx, game);
    this.drawClock(ctx, game);
    this.drawBoss(ctx, game);
    this.drawRadar(ctx, game);
    this.drawXp(ctx, game);
    this.drawHints(ctx, game);
    this.drawMessages(ctx, dt);
    this.drawPopups(ctx, game);
    if (game.state === STATE.PLAYING) this.drawLock(ctx, game);
    this.drawBanner(ctx, game);
    if (game.transition) this.drawTransition(ctx, game.transition);
  }

  // Fade to black, show the new stage's title, fade back in.
  drawTransition(ctx, tr) {
    const { t, dur, swapAt } = tr;
    const a = t < swapAt ? t / swapAt : clamp((dur - t) / (dur - swapAt - 0.6), 0, 1);
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    if (t > swapAt * 0.6) {
      const stage = STAGES[tr.to];
      hudText(ctx, `STAGE ${tr.to + 1}`, CANVAS_W / 2, CANVAS_H / 2 - 40, 8, UI.muted, "center");
      hudText(ctx, stage.name, CANVAS_W / 2, CANVAS_H / 2 - 18, 24, ELEMENT_BY_BIOME[stage.biome], "center");
    }
    ctx.globalAlpha = 1;
  }

  drawVitals(ctx, game) {
    const p = game.player;
    const x = 12, y = VIEW_TOP + 9;
    hudPanel(ctx, x, y, 318, 66);
    const lowHp = p.hp / p.maxHp < 0.25 && Math.floor(performance.now() / 250) % 2 === 0;
    hudText(ctx, "HP", x + 12, y + 14, 8, lowHp ? "#ffffff" : UI.hp.light);
    hudBar(ctx, x + 42, y + 9, 264, 21, p.hp / p.maxHp, lowHp ? UI.boss : UI.hp);
    hudText(ctx, `${Math.ceil(p.hp)}/${p.maxHp}`, x + 296, y + 16, 8, UI.cream, "right");

    // Stamina: sprint drains it, rolls cost a chunk. Winded = flashes red.
    const winded = p.winded && Math.floor(performance.now() / 200) % 2 === 0;
    hudText(ctx, "EN", x + 12, y + 41, 8, winded ? UI.hp.light : UI.energy.light);
    hudBar(ctx, x + 42, y + 36, 264, 15, p.stamina / p.maxStamina, winded ? UI.hp : UI.energy, 12);
    // Notch showing how much one roll costs.
    const notch = x + 42 + 3 + Math.round((264 - 6) * (PLAYER.rollCost / p.maxStamina));
    ctx.fillStyle = UI.ink;
    ctx.fillRect(notch, y + 33, 2, 21);
    if (p.winded) hudText(ctx, "WINDED", x + 296, y + 40, 8, UI.cream, "right");

    // Weapon chips: one row per slot, in the weapon's element colour, with
    // a star per mutation.
    let wy = y + 72;
    p.weaponSlots.forEach((item, i) => {
      if (!item) return;
      const el = elementOf(item.element);
      const label = `${i + 1} ${WEAPON_BASES[item.base].name.toUpperCase()}${"*".repeat(item.mutations.length)}`;
      const cw = label.length * 8 + 18;
      ctx.fillStyle = UI.ink;
      ctx.fillRect(x, wy, cw, 18);
      ctx.fillStyle = el.color;
      ctx.fillRect(x + PX, wy + PX, PX, 12);
      hudText(ctx, label, x + 12, wy + 5, 8, item.mutations.length ? el.light : el.color);
      wy += 21;
    });
    if (game.autoFire) {
      ctx.fillStyle = UI.gold;
      ctx.fillRect(x, wy, 66, 18);
      hudText(ctx, "AUTO", x + 33, wy + 5, 8, UI.ink, "center");
      wy += 21;
    }
    this.drawAffinity(ctx, p, x, wy + 3);
  }

  // Element affinity tiles: colour, item count, and one pip per unlocked tier.
  drawAffinity(ctx, p, x, y) {
    let cx = x;
    for (const id of ELEMENT_IDS) {
      const n = p.affinity[id];
      if (!n) continue;
      const el = ELEMENTS[id];
      ctx.fillStyle = UI.ink;
      ctx.fillRect(cx, y, 30, 27);
      ctx.fillStyle = el.dark;
      ctx.fillRect(cx + 2, y + 2, 26, 23);
      hudText(ctx, String(n), cx + 15, y + 5, 8, el.light, "center");
      const tier = affinityTier(n);
      for (let t = 0; t < 3; t++) {
        ctx.fillStyle = t < tier ? el.color : UI.ink;
        ctx.fillRect(cx + 5 + t * 7, y + 17, 5, 5);
      }
      cx += 33;
    }
  }

  // Reaction names pop above the enemy they happened on.
  drawPopups(ctx, game) {
    for (const pop of game.popups) {
      const at = game.renderer.projectPoint(pop.x, pop.y, pop.h + pop.t * 1.5);
      if (!at) continue;
      ctx.globalAlpha = clamp((pop.dur - pop.t) / 0.3, 0, 1);
      hudText(ctx, pop.text, at.x, at.y, 8, pop.color, "center");
      ctx.globalAlpha = 1;
    }
    // Damage numbers: pop up, drift, fade. Big hits get the large font.
    for (const n of game.dmgNumbers) {
      const at = game.renderer.projectPoint(n.x, n.y, n.h + n.t * 1.8);
      if (!at) continue;
      const pop = n.t < 0.08 ? 1.3 : 1; // brief scale-pop on spawn
      ctx.globalAlpha = clamp((n.dur - n.t) / 0.25, 0, 1);
      hudText(ctx, n.text, at.x, at.y, Math.round((n.big ? 16 : 8) * pop), n.color, "center");
      ctx.globalAlpha = 1;
    }
  }

  drawClock(ctx, game) {
    const t = game.director ? game.director.time : 0;
    const w = 150, x = CANVAS_W / 2 - w / 2, y = VIEW_TOP + 9;
    hudPanel(ctx, x, y, w, 66);
    hudText(ctx, fmtClock(t), CANVAS_W / 2, y + 10, 16, UI.gold, "center");
    const threat = game.director ? game.director.threat : 1;
    const heat = ["#8fe04a", "#ffcf5c", "#f07a1e", "#d83a22", "#ff4a8a"][Math.min(4, Math.floor((threat - 1) / 2))];
    hudText(ctx, `THREAT ${threat}`, CANVAS_W / 2, y + 32, 8, heat, "center");
    const stage = STAGES[game.stageIndex || 0];
    hudText(ctx, stage.name, CANVAS_W / 2, y + 54, 8, ELEMENT_BY_BIOME[stage.biome], "center");
  }

  drawBoss(ctx, game) {
    const boss = game.activeBoss;
    if (!boss) return;
    const w = 420, x = CANVAS_W / 2 - w / 2, y = VIEW_TOP + 80;
    hudText(ctx, boss.name.toUpperCase(), CANVAS_W / 2, y, 8, "#ffb0c0", "center");
    hudBar(ctx, x, y + 12, w, 15, boss.hp / boss.maxHp, UI.boss, 21);
  }

  drawXp(ctx, game) {
    const p = game.player;
    const need = XP.toNext(p.level);
    const y = VIEW_TOP + VIEW_H - 27, x = 12, w = CANVAS_W - 24;
    // Level badge
    ctx.fillStyle = UI.ink;
    ctx.fillRect(x, y - 6, 69, 27);
    ctx.fillStyle = UI.xp.dark;
    ctx.fillRect(x + PX, y - 3, 63, 21);
    hudText(ctx, `LV${p.level}`, x + 35, y + 2, 8, UI.xp.light, "center");
    hudBar(ctx, x + 72, y, w - 72, 15, p.xp / need, UI.xp, 24);
    hudText(ctx, `${p.xp} / ${need} XP`, x + 72 + (w - 72) / 2, y + 4, 8, UI.cream, "center");
  }

  drawHints(ctx, game) {
    const p = game.player;
    const bag = `${p.backpack.length}/${p.backpackSlots}`;
    const text = `Q POTION ${p.potions}/${PLAYER.maxPotions}   TAB GEAR   BAG ${bag}`;
    const w = text.length * 8 + 24;
    const x = CANVAS_W - 12 - w, y = VIEW_TOP + VIEW_H - 60;
    hudPanel(ctx, x, y, w, 27, 0.75);
    hudText(ctx, text, x + 12, y + 10, 8, p.backpackFull ? UI.hp.light : UI.cream);
  }

  drawMessages(ctx, dt) {
    let y = VIEW_TOP + VIEW_H - 66;
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i];
      m.t -= dt;
      if (m.t <= 0) { this.messages.splice(i, 1); continue; }
      ctx.globalAlpha = clamp(m.t / 0.6, 0, 1);
      hudText(ctx, m.text, 18, y, 8, m.color);
      ctx.globalAlpha = 1;
      y -= 15;
    }
  }

  // Pixel corner brackets around the locked-on enemy. They snap in from
  // wide to tight when a new target is acquired, like a PS1 lock-on.
  drawLock(ctx, game) {
    const e = game.aimTarget;
    if (!e || !e.alive) return;
    const box = game.renderer.projectEnemy(e);
    if (!box) return;
    const snap = 1 + Math.max(0, 1 - game.lockTime / 0.15) * 0.7;
    const w = Math.round(box.w * snap) + 4;
    const h = Math.round(box.h * snap) + 4;
    const arm = Math.max(6, Math.round(Math.min(w, h) * 0.45));
    const rect = (x, y, rw, rh, col) => {
      ctx.fillStyle = col;
      ctx.fillRect(Math.min(x, x + rw), Math.min(y, y + rh), Math.abs(rw), Math.abs(rh));
    };
    const corner = (cx, cy, sx, sy) => {
      rect(cx - sx, cy - sy, sx * (arm + 2), sy * 5, UI.ink);
      rect(cx - sx, cy - sy, sx * 5, sy * (arm + 2), UI.ink);
      rect(cx, cy, sx * arm, sy * 3, UI.gold);
      rect(cx, cy, sx * 3, sy * arm, UI.gold);
    };
    corner(box.x - w, box.y - h, 1, 1);
    corner(box.x + w, box.y - h, -1, 1);
    corner(box.x - w, box.y + h, 1, -1);
    corner(box.x + w, box.y + h, -1, -1);

    // Mini HP bar over regular enemies (bosses have the big one up top).
    if (!e.isBoss) {
      const bw = Math.max(24, w * 2 - 6);
      const bx = box.x - Math.floor(bw / 2), by = box.y - h - 12;
      ctx.fillStyle = UI.ink;
      ctx.fillRect(bx - 2, by - 2, bw + 4, 8);
      ctx.fillStyle = UI.hp.dark;
      ctx.fillRect(bx, by, bw, 4);
      ctx.fillStyle = UI.hp.light;
      ctx.fillRect(bx, by, Math.round(bw * clamp(e.hp / e.maxHp, 0, 1)), 4);
    }
  }

  // Player-relative radar, forward = up — the way to see threats behind you.
  drawRadar(ctx, game) {
    const { x: cx, y: cy, r, range } = RADAR;
    const p = game.player;
    const cos = Math.cos(game.yaw), sin = Math.sin(game.yaw);
    const k = r / range;
    const toRadar = (wx, wy) => {
      const dx = wx - p.x, dy = wy - p.y;
      return [Math.round(cx + (-dx * sin + dy * cos) * k), Math.round(cy - (dx * cos + dy * sin) * k)];
    };
    const dot = (x, y, s, col) => {
      ctx.fillStyle = col;
      ctx.fillRect(x - Math.floor(s / 2), y - Math.floor(s / 2), s, s);
    };

    ctx.save();
    ctx.fillStyle = UI.ink;
    ctx.beginPath(); ctx.arc(cx, cy, r + PX * 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = UI.panelLight;
    ctx.beginPath(); ctx.arc(cx, cy, r + PX, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(20, 30, 20, 0.92)";
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.clip();

    // Coastline ring
    const [ex, ey] = toRadar(0, 0);
    ctx.strokeStyle = "rgba(111, 174, 58, 0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(ex, ey, ARENA_RADIUS * k, 0, Math.PI * 2); ctx.stroke();

    for (const o of OBSTACLES) {
      if (Math.abs(o.x - p.x) > range || Math.abs(o.y - p.y) > range) continue;
      const [ox, oy] = toRadar(o.x, o.y);
      dot(ox, oy, 3, "rgba(90, 110, 70, 0.8)");
    }
    for (const l of game.loot) {
      const [lx, ly] = toRadar(l.x, l.y);
      dot(lx, ly, 4, itemColor(l.item));
    }
    for (const b of game.bullets) {
      if (b.owner !== "enemy") continue;
      const [bx, by] = toRadar(b.x, b.y);
      dot(bx, by, 2, b.color);
    }
    for (const e of game.enemies) {
      const [ex2, ey2] = toRadar(e.x, e.y);
      dot(ex2, ey2, e.isBoss ? 8 : 4, e.color);
    }
    ctx.restore();
    // Player marker
    ctx.fillStyle = UI.cream;
    ctx.fillRect(cx - 1, cy - 5, 3, 3);
    ctx.fillRect(cx - 3, cy - 2, 7, 3);
    ctx.fillRect(cx - 4, cy + 1, 9, 3);
  }

  drawDamage(ctx, flash) {
    const a = clamp(flash / 0.35, 0, 1);
    ctx.fillStyle = UI.hp.fill;
    for (let i = 0; i < 4; i++) {
      ctx.globalAlpha = a * (0.45 - i * 0.1);
      const m = i * 9;
      ctx.fillRect(m, VIEW_TOP + m, CANVAS_W - m * 2, 9);
      ctx.fillRect(m, VIEW_TOP + VIEW_H - m - 9, CANVAS_W - m * 2, 9);
      ctx.fillRect(m, VIEW_TOP + m + 9, 9, VIEW_H - m * 2 - 18);
      ctx.fillRect(CANVAS_W - m - 9, VIEW_TOP + m + 9, 9, VIEW_H - m * 2 - 18);
    }
    ctx.globalAlpha = 1;
  }

  drawBanner(ctx, game) {
    if (game.bannerTimer <= 0 || !game.bannerText) return;
    const total = game.bannerDuration;
    const fadeIn = clamp((total - game.bannerTimer) / 0.3, 0, 1);
    const fadeOut = clamp(game.bannerTimer / 0.5, 0, 1);
    ctx.globalAlpha = Math.min(fadeIn, fadeOut);
    hudText(ctx, game.bannerText, CANVAS_W / 2, CANVAS_H / 2 - 90, 16, game.bannerColor, "center");
    ctx.globalAlpha = 1;
  }
}
