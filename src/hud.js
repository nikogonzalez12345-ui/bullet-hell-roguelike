// Angelic HUD drawn on the 2D overlay canvas: ivory and gold on deep
// celestial glass, Cinzel lettering, glowing pill-shaped bars with gold
// rims, halo medallions and little four-point stars. Palette in UI
// (constants.js).

const PX = 3;
// Radar sits in the top-right corner of whatever size the screen currently is.
const RADAR = { r: 66, range: 700, get x() { return CANVAS_W - 86; }, get y() { return VIEW_TOP + 86; } };

// Sizes are given in the old pixel-font units (8 = small label); Cinzel
// needs to be drawn larger to read the same.
const fontPx = (size) => Math.round(size <= 8 ? size * 1.6 : size * 1.38);

function hudFont(ctx, size, weight = 700) {
  ctx.font = `${weight} ${fontPx(size)}px ${UI.font}`;
}

// Text with a soft dark halo (readable over any scene) and an optional glow.
function hudText(ctx, text, x, y, size, color, align = "left", glow = null) {
  hudFont(ctx, size);
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  const px = fontPx(size);
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, px * 0.26);
  ctx.strokeStyle = UI.shadow;
  ctx.strokeText(text, x, y);
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = px * 0.7; }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
}

function textWidth(ctx, text, size) {
  hudFont(ctx, size);
  return ctx.measureText(text).width;
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Four-point sparkle.
function hudStar(ctx, x, y, r, color, glow = true) {
  ctx.save();
  if (glow) { ctx.shadowColor = color; ctx.shadowBlur = r * 2; }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
  ctx.restore();
}

function hudHeart(ctx, x, y, s, color) {
  ctx.save();
  ctx.shadowColor = color; ctx.shadowBlur = 8;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.2, y + s * 0.1, x - s * 0.8, y - s * 0.8, x, y - s * 0.25);
  ctx.bezierCurveTo(x + s * 0.8, y - s * 0.8, x + s * 1.2, y + s * 0.1, x, y + s * 0.9);
  ctx.fill();
  ctx.restore();
}

// Celestial glass panel: deep blue gradient, gold rim with a soft glow, a
// faint inner line, and stars in the corners.
function hudPanel(ctx, x, y, w, h, alpha = 1, stars = true) {
  ctx.save();
  ctx.globalAlpha = alpha;
  roundRect(ctx, x, y, w, h, 10);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, "rgba(46, 54, 108, 0.78)");
  g.addColorStop(1, "rgba(14, 16, 42, 0.82)");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowColor = "rgba(255, 220, 140, 0.5)";
  ctx.shadowBlur = 10;
  ctx.strokeStyle = UI.gold;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.shadowBlur = 0;
  roundRect(ctx, x + 4, y + 4, w - 8, h - 8, 7);
  ctx.strokeStyle = "rgba(255, 236, 190, 0.28)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
  if (stars) {
    for (const [sx, sy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) hudStar(ctx, sx, sy, 4, UI.goldLight, false);
  }
}

// Glowing pill bar: dark trough, gradient fill with a glossy top, a bright
// leading edge, and a thin gold rim.
function hudBar(ctx, x, y, w, h, pct, pal, seg = 0) {
  const r = h / 2;
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = "rgba(6, 8, 24, 0.82)";
  ctx.fill();
  const inner = w - 4;
  const fw = inner * clamp(pct, 0, 1);
  if (fw > 0.5) {
    ctx.save();
    roundRect(ctx, x + 2, y + 2, inner, h - 4, r - 2);
    ctx.clip();
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, pal.dark);
    g.addColorStop(0.55, pal.fill);
    g.addColorStop(1, pal.light);
    ctx.shadowColor = pal.fill;
    ctx.shadowBlur = 10;
    ctx.fillStyle = g;
    ctx.fillRect(x + 2, y + 2, fw, h - 4);
    ctx.shadowBlur = 0;
    const gl = ctx.createLinearGradient(0, y, 0, y + h);
    gl.addColorStop(0, "rgba(255, 255, 255, 0.55)");
    gl.addColorStop(0.45, "rgba(255, 255, 255, 0.06)");
    gl.addColorStop(1, "rgba(0, 0, 0, 0.18)");
    ctx.fillStyle = gl;
    ctx.fillRect(x + 2, y + 2, fw, h - 4);
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.fillRect(x + 2 + fw - 2, y + 2, 2, h - 4);
    if (seg) {
      ctx.fillStyle = "rgba(8, 10, 30, 0.25)";
      for (let sx = x + seg; sx < x + 2 + fw; sx += seg) ctx.fillRect(sx, y + 2, 1, h - 4);
    }
    ctx.restore();
  }
  roundRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = UI.gold;
  ctx.lineWidth = 1.25;
  ctx.stroke();
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
    if (game.state === STATE.MENU) return;

    if (game.damageFlash > 0) this.drawDamage(ctx, game.damageFlash);
    else if (game.bulletTimeT > 0) this.drawDamage(ctx, Math.min(0.35, game.bulletTimeT * 0.35), "#5ab8ff");
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
    const x = 12, y = VIEW_TOP + 10;
    hudPanel(ctx, x, y, 322, 66);
    const lowHp = p.hp / p.maxHp < 0.25 && Math.floor(performance.now() / 250) % 2 === 0;
    hudHeart(ctx, x + 20, y + 21, 8, lowHp ? "#ffffff" : UI.hp.fill);
    hudBar(ctx, x + 36, y + 11, 272, 20, p.hp / p.maxHp, lowHp ? UI.boss : UI.hp, 24);
    hudText(ctx, `${Math.ceil(p.hp)} / ${p.maxHp}`, x + 36 + 136, y + 14, 7, UI.cream, "center");

    // Stamina: sprint drains it, rolls cost a chunk. Winded = flashes.
    const winded = p.winded && Math.floor(performance.now() / 200) % 2 === 0;
    hudStar(ctx, x + 20, y + 46, 7, winded ? UI.hp.light : UI.energy.light);
    hudBar(ctx, x + 36, y + 39, 272, 14, p.stamina / p.maxStamina, winded ? UI.hp : UI.energy, 20);
    // Notch showing how much one roll costs.
    const notch = x + 38 + Math.round((272 - 4) * (PLAYER.rollCost / p.maxStamina));
    ctx.fillStyle = UI.goldLight;
    ctx.fillRect(notch, y + 36, 1.5, 20);
    if (p.winded) hudText(ctx, "WINDED", x + 36 + 136, y + 39, 6, UI.cream, "center");

    // Weapon chips: one glass pill per slot with a star in the weapon's
    // element colour, plus a sparkle per mutation.
    let wy = y + 74;
    p.weaponSlots.forEach((item, i) => {
      if (!item) return;
      const el = elementOf(item.element);
      const label = WEAPON_BASES[item.base].name + " ✦".repeat(item.mutations.length);
      const cw = textWidth(ctx, label, 7) + 36;
      roundRect(ctx, x, wy, cw, 20, 10);
      ctx.fillStyle = "rgba(14, 18, 46, 0.72)";
      ctx.fill();
      ctx.strokeStyle = "rgba(240, 207, 126, 0.55)";
      ctx.lineWidth = 1;
      ctx.stroke();
      hudText(ctx, String(i + 1), x + 9, wy + 4, 6, UI.muted);
      hudStar(ctx, x + 22, wy + 10, 5, el.color);
      hudText(ctx, label, x + 30, wy + 3, 7, item.mutations.length ? el.light : UI.cream);
      wy += 23;
    });
    if (game.autoFire) {
      roundRect(ctx, x, wy, 70, 20, 10);
      ctx.fillStyle = UI.gold;
      ctx.fill();
      ctx.fillStyle = UI.ink;
      hudFont(ctx, 7);
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("AUTO", x + 35, wy + 3);
      wy += 23;
    }
    this.drawAffinity(ctx, p, x, wy + 3);
  }

  // Element affinity tiles: colour, item count, and one star per unlocked tier.
  drawAffinity(ctx, p, x, y) {
    let cx = x;
    for (const id of ELEMENT_IDS) {
      const n = p.affinity[id];
      if (!n) continue;
      const el = ELEMENTS[id];
      roundRect(ctx, cx, y, 32, 32, 8);
      ctx.fillStyle = "rgba(14, 18, 46, 0.78)";
      ctx.fill();
      ctx.shadowColor = el.color;
      ctx.shadowBlur = 6;
      ctx.strokeStyle = el.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.shadowBlur = 0;
      hudText(ctx, String(n), cx + 16, y + 3, 7, el.light, "center");
      const tier = affinityTier(n);
      for (let t = 0; t < 3; t++) {
        if (t < tier) hudStar(ctx, cx + 8 + t * 8, y + 25, 3.2, el.light);
        else { ctx.fillStyle = "rgba(184, 180, 208, 0.3)"; ctx.fillRect(cx + 7 + t * 8, y + 24, 2, 2); }
      }
      cx += 36;
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
      hudText(ctx, n.text, at.x, at.y, Math.round((n.big ? 15 : 8) * pop), n.color, "center", n.big ? n.color : null);
      ctx.globalAlpha = 1;
    }
  }

  drawClock(ctx, game) {
    const t = game.director ? game.director.time : 0;
    const w = 168, x = CANVAS_W / 2 - w / 2, y = VIEW_TOP + 10;
    hudPanel(ctx, x, y, w, 72);
    hudText(ctx, fmtClock(t), CANVAS_W / 2, y + 7, 17, UI.goldLight, "center", "rgba(255, 210, 120, 0.9)");
    const threat = game.director ? game.director.threat : 1;
    const heat = ["#b8f0c0", "#fff0a0", "#ffc070", "#ff8a8a", "#ff6ac0"][Math.min(4, Math.floor((threat - 1) / 2))];
    hudText(ctx, `THREAT ${threat}`, CANVAS_W / 2, y + 35, 6, heat, "center");
    const stage = STAGES[game.stageIndex || 0];
    hudText(ctx, stage.name, CANVAS_W / 2, y + 51, 7, ELEMENT_BY_BIOME[stage.biome], "center");
  }

  drawBoss(ctx, game) {
    const boss = game.activeBoss;
    if (!boss) return;
    const w = 420, x = CANVAS_W / 2 - w / 2, y = VIEW_TOP + 90;
    hudText(ctx, boss.name.toUpperCase(), CANVAS_W / 2, y, 8, "#ffc0cc", "center", "rgba(255, 60, 90, 0.8)");
    hudBar(ctx, x, y + 17, w, 14, boss.hp / boss.maxHp, UI.boss, 21);
  }

  drawXp(ctx, game) {
    const p = game.player;
    const need = XP.toNext(p.level);
    const y = VIEW_TOP + VIEW_H - 26, x = 12, w = CANVAS_W - 24;
    hudBar(ctx, x + 44, y, w - 44, 13, p.xp / need, UI.xp, 0);
    hudText(ctx, `${Math.floor(p.xp)} / ${need}`, x + 44 + (w - 44) / 2, y - 1, 6, UI.cream, "center");
    // Level medallion with a halo above it.
    const mx = x + 22, my = y + 6;
    ctx.save();
    ctx.beginPath();
    ctx.arc(mx, my, 20, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(mx, my - 6, 2, mx, my, 20);
    g.addColorStop(0, "#fffaf0");
    g.addColorStop(0.7, "#f2e2b8");
    g.addColorStop(1, "#c89a48");
    ctx.fillStyle = g;
    ctx.shadowColor = "rgba(255, 220, 140, 0.8)";
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#b88a3a";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(mx, my - 25, 12, 3.5, 0, 0, Math.PI * 2);
    ctx.strokeStyle = UI.goldLight;
    ctx.lineWidth = 2;
    ctx.shadowColor = UI.gold;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#2a2240";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    hudFont(ctx, 5);
    ctx.fillText("LV", mx, my - 14);
    hudFont(ctx, p.level >= 100 ? 7 : 9);
    ctx.fillText(String(p.level), mx, my - 5);
  }

  drawHints(ctx, game) {
    const p = game.player;
    const bag = `${p.backpack.length}/${p.backpackSlots}`;
    const text = `Q  POTION ${p.potions}/${PLAYER.maxPotions}    TAB  GEAR    BAG ${bag}`;
    const w = textWidth(ctx, text, 6) + 30;
    const x = CANVAS_W - 12 - w, y = VIEW_TOP + VIEW_H - 64;
    hudPanel(ctx, x, y, w, 28, 0.9, false);
    hudText(ctx, text, x + 15, y + 7, 6, p.backpackFull ? UI.hp.light : UI.cream);
  }

  drawMessages(ctx, dt) {
    let y = VIEW_TOP + VIEW_H - 72;
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i];
      m.t -= dt;
      if (m.t <= 0) { this.messages.splice(i, 1); continue; }
      ctx.globalAlpha = clamp(m.t / 0.6, 0, 1);
      hudText(ctx, m.text, 18, y, 7, m.color);
      ctx.globalAlpha = 1;
      y -= 18;
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
    // Glowing gold corner brackets with a star above the target.
    ctx.save();
    ctx.strokeStyle = UI.goldLight;
    ctx.lineWidth = 2;
    ctx.shadowColor = UI.gold;
    ctx.shadowBlur = 8;
    const corner = (cx, cy, sx, sy) => {
      ctx.beginPath();
      ctx.moveTo(cx + sx * arm, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + sy * arm);
      ctx.stroke();
    };
    corner(box.x - w, box.y - h, 1, 1);
    corner(box.x + w, box.y - h, -1, 1);
    corner(box.x - w, box.y + h, 1, -1);
    corner(box.x + w, box.y + h, -1, -1);
    ctx.restore();
    hudStar(ctx, box.x, box.y - h - (e.isBoss ? 6 : 22), 4, UI.goldLight);

    // Mini HP bar over regular enemies (bosses have the big one up top).
    if (!e.isBoss) {
      const bw = Math.max(24, w * 2 - 6);
      const bx = box.x - Math.floor(bw / 2), by = box.y - h - 12;
      hudBar(ctx, bx, by, bw, 7, e.hp / e.maxHp, e.elite ? UI.xp : UI.boss);
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
    // Celestial glass disc with a glowing gold rim.
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(6, 8, 24, 0.9)";
    ctx.shadowColor = "rgba(255, 220, 140, 0.6)";
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = UI.gold;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    const rg = ctx.createRadialGradient(cx, cy, 4, cx, cy, r);
    rg.addColorStop(0, "rgba(46, 56, 112, 0.92)");
    rg.addColorStop(1, "rgba(14, 16, 42, 0.95)");
    ctx.fillStyle = rg;
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 236, 190, 0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.clip();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 236, 190, 0.12)";
    ctx.stroke();

    // Coastline ring
    const [ex, ey] = toRadar(0, 0);
    ctx.strokeStyle = "rgba(142, 200, 255, 0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(ex, ey, ARENA_RADIUS * k, 0, Math.PI * 2); ctx.stroke();

    for (const o of OBSTACLES) {
      if (Math.abs(o.x - p.x) > range + o.r || Math.abs(o.y - p.y) > range + o.r) continue;
      if (o.hw) {
        // Walls and buildings: their real outline.
        ctx.fillStyle = "rgba(240, 225, 190, 0.6)";
        ctx.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const lx = sx * o.hw, ly = sy * o.hh;
          ctx.lineTo(...toRadar(o.x + lx * o.c - ly * o.s, o.y + lx * o.s + ly * o.c));
        }
        ctx.fill();
        continue;
      }
      const [ox, oy] = toRadar(o.x, o.y);
      if (o.r > 40) {
        ctx.fillStyle = "rgba(184, 180, 208, 0.35)";
        ctx.beginPath(); ctx.arc(ox, oy, o.r * k, 0, Math.PI * 2); ctx.fill();
      } else {
        dot(ox, oy, 2, "rgba(184, 200, 170, 0.45)");
      }
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
    // Player marker: a little star.
    hudStar(ctx, cx, cy, 6, UI.goldLight);
  }

  // Soft coloured vignette (red on a hit, blue during Bullet Time).
  drawDamage(ctx, flash, color = UI.hp.fill) {
    const a = clamp(flash / 0.35, 0, 1);
    const cx = CANVAS_W / 2, cy = VIEW_TOP + VIEW_H / 2;
    const g = ctx.createRadialGradient(cx, cy, Math.min(CANVAS_W, VIEW_H) * 0.35, cx, cy, Math.max(CANVAS_W, VIEW_H) * 0.72);
    g.addColorStop(0, "rgba(0, 0, 0, 0)");
    g.addColorStop(1, color);
    ctx.globalAlpha = a * 0.75;
    ctx.fillStyle = g;
    ctx.fillRect(0, VIEW_TOP, CANVAS_W, VIEW_H);
    ctx.globalAlpha = 1;
  }

  drawBanner(ctx, game) {
    if (game.bannerTimer <= 0 || !game.bannerText) return;
    const total = game.bannerDuration;
    const fadeIn = clamp((total - game.bannerTimer) / 0.3, 0, 1);
    const fadeOut = clamp(game.bannerTimer / 0.5, 0, 1);
    ctx.globalAlpha = Math.min(fadeIn, fadeOut);
    const y = CANVAS_H / 2 - 96;
    hudText(ctx, game.bannerText, CANVAS_W / 2, y, 18, game.bannerColor, "center", game.bannerColor);
    // Gilded flourish underneath: a line fading out to each side, a star in the middle.
    const half = Math.min(260, textWidth(ctx, game.bannerText, 18) / 2 + 40);
    const ly = y + fontPx(18) + 8;
    const lg = ctx.createLinearGradient(CANVAS_W / 2 - half, 0, CANVAS_W / 2 + half, 0);
    lg.addColorStop(0, "rgba(240, 207, 126, 0)");
    lg.addColorStop(0.5, UI.gold);
    lg.addColorStop(1, "rgba(240, 207, 126, 0)");
    ctx.fillStyle = lg;
    ctx.fillRect(CANVAS_W / 2 - half, ly, half * 2, 1.5);
    hudStar(ctx, CANVAS_W / 2, ly + 1, 5, UI.goldLight);
    ctx.globalAlpha = 1;
  }
}
