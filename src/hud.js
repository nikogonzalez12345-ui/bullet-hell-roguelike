// Pixel-art HUD in the "celestial reliquary" style (frames and ornaments
// from pixelart.js): ornate gilded bars with medallion caps, framed
// plaques, a jeweled radar ring, and Pixelify Sans / Jacquarda Bastarda
// lettering with crisp ink outlines. Art is drawn at 2x: one art pixel =
// PX overlay pixels.

const PX = 2;
// Radar sits in the top-right corner of whatever size the screen currently is.
const RADAR = { r: 62, range: 700, get x() { return CANVAS_W - 86; }, get y() { return VIEW_TOP + 88; } };

const HUD_FONT = "'Pixelify Sans', 'Trebuchet MS', sans-serif";
const HUD_TITLE = "'Jacquarda Bastarda 9', 'Times New Roman', serif";
// Sizes are given in the old pixel-font units; map them to crisp pixel sizes.
const fontPx = (size) => (size <= 5 ? 11 : size <= 6 ? 12 : size <= 7 ? 14 : size <= 9 ? 16 : size <= 15 ? 24 : size <= 17 ? 28 : 36);

function hudFont(ctx, size, weight = 600, family = HUD_FONT) {
  ctx.font = `${weight} ${fontPx(size)}px ${family}`;
}

// Text with a crisp ink outline and drop shadow (and an optional glow).
function hudText(ctx, text, x, y, size, color, align = "left", glow = null, family = HUD_FONT) {
  hudFont(ctx, size, family === HUD_TITLE ? 400 : 600, family);
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  x = Math.round(x); y = Math.round(y);
  const o = fontPx(size) >= 24 ? 2 : 1;
  ctx.fillStyle = PAL.ink;
  for (let dx = -o; dx <= o; dx++) {
    for (let dy = -o; dy <= o + 1; dy++) if (dx || dy) ctx.fillText(text, x + dx, y + dy);
  }
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 12; }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
}

function textWidth(ctx, text, size, family = HUD_FONT) {
  hudFont(ctx, size, 600, family);
  return ctx.measureText(text).width;
}

// ---- Cached art ---------------------------------------------------------------

const HUD_ART = {};
const hudArt = (key, make) => HUD_ART[key] || (HUD_ART[key] = make());

const HUD_ICONS = {
  heart: [".rr.rr.", "rRrrrrr", "rRrrrrr", ".rrrrr.", "..rrr..", "...r..."],
  feather: ["....bb", "..bbbB", ".bbbB.", "bbbb..", "bb....", "w....."],
  horns: ["r.......r", "rr.....rr", ".rr...rr.", "..rrrrr..", ".rr#r#rr.", ".rrrrrrr.", "..r.r.r.."],
  star: ["..y..", ".yYy.", "yYYYy", ".yyy.", "..y.."],
};
const hudIcon = (k) => hudArt("icon_" + k, () => pixelSprite("hud_" + k, HUD_ICONS[k], 0));

function drawSprite(ctx, img, cx, cy, scale = PX) {
  ctx.drawImage(img, Math.round(cx - (img.width * scale) / 2), Math.round(cy - (img.height * scale) / 2), img.width * scale, img.height * scale);
}

// Framed plaque (9-slice). Kept as hudPanel so other code can use it.
function hudPanel(ctx, x, y, w, h, alpha = 0.95) {
  ctx.globalAlpha = alpha;
  drawNine(ctx, hudArt("plaque", () => ornateFrame({ c: 8, curls: false, gem: GEMS.gold, fill: [PAL.night2, PAL.night1] })), x, y, w, h, PX);
  ctx.globalAlpha = 1;
}
function hudChip(ctx, x, y, w, h, gem = null) {
  const key = "chip" + (gem ? gem[1] : "");
  drawNine(ctx, hudArt(key, () => ornateFrame({ c: 6, curls: false, inner: false, gem, fill: [PAL.night2, PAL.night1] })), x, y, w, h, PX);
}

// An ornate bar in art pixels: a medallion on the left (holding an icon or
// a number), a gilded trough, filigree at the right end and over the joint.
function ornateBarArt(len, h, medalR, gem) {
  const W = medalR * 2 + len + 10, H = Math.max(medalR * 2 + 2, h + 12);
  const [c, ctx] = pxCanvas(W, H);
  const cy = Math.floor(H / 2);
  const bx = medalR * 2 - 3, by = cy - Math.floor(h / 2);
  // Trough with an ink line and a gold rim (light above, dark below).
  fillPx(ctx, bx, by - 2, len + 3, h + 4, PAL.ink);
  fillPx(ctx, bx, by - 1, len + 1, 1, PAL.gold3);
  fillPx(ctx, bx, by + h, len + 1, 1, PAL.gold1);
  fillPx(ctx, bx + len + 1, by - 1, 1, h + 2, PAL.gold2);
  fillPx(ctx, bx, by, len + 1, h, PAL.night0);
  // Filigree: curls above and below the right end, and a spear tip.
  const ex = bx + len + 2;
  arcPx(ctx, ex - 1, by - 4, 2, Math.PI * 0.6, Math.PI * 2.1, PAL.gold2);
  arcPx(ctx, ex - 1, by + h + 3, 2, -Math.PI * 0.1, Math.PI * 1.4, PAL.gold2);
  put(ctx, ex - 5, by - 3, PAL.gold3); put(ctx, ex - 5, by + h + 2, PAL.gold1);
  gemPx(ctx, ex + 3, cy, 2, RAMPS.g);
  // Small curls where the bar leaves the medallion.
  arcPx(ctx, bx + 6, by - 4, 2, Math.PI * 0.5, Math.PI * 1.6, PAL.gold2);
  arcPx(ctx, bx + 6, by + h + 3, 2, Math.PI * 0.4, Math.PI * 1.5, PAL.gold1);
  // Medallion: ink ring, bevelled gold ring, and a dark well tinted by the gem.
  const mx = medalR - 0.5, my = cy;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < medalR * 2; x++) {
      const dx = x - mx, dy = y - my, d = Math.hypot(dx, dy);
      if (d > medalR) continue;
      let col;
      if (d > medalR - 1) col = PAL.ink;
      else if (d > medalR - 3) col = dx + dy < -1 ? PAL.gold3 : dx + dy > 1 ? PAL.gold1 : PAL.gold2;
      else if (d > medalR - 4) col = PAL.ink;
      else col = lerpColor(lerpColor(gem[1], PAL.night1, 0.55), PAL.night0, d / (medalR - 4));
      put(ctx, x, y, col);
    }
  }
  return { canvas: c, trough: { x: bx, y: by, w: len, h }, medal: { x: medalR, y: cy, r: medalR } };
}

// Draw an ornate bar; returns the medallion centre (overlay pixels).
function drawOrnateBar(ctx, x, y, len, h, medalR, pct, pal, gem) {
  const art = hudArt(`bar_${len}_${h}_${medalR}_${gem[1]}`, () => ornateBarArt(len, h, medalR, gem));
  ctx.drawImage(art.canvas, x, y, art.canvas.width * PX, art.canvas.height * PX);
  const t = art.trough;
  const fw = Math.round(t.w * clamp(pct, 0, 1));
  if (fw > 0) {
    const fx = x + t.x * PX, fy = y + t.y * PX;
    ctx.fillStyle = pal.fill;
    ctx.fillRect(fx, fy, fw * PX, t.h * PX);
    ctx.fillStyle = pal.light;
    ctx.fillRect(fx, fy, fw * PX, PX);
    if (t.h > 3) {
      ctx.fillStyle = pal.dark;
      ctx.fillRect(fx, fy + (t.h - 1) * PX, fw * PX, PX);
    }
    // A glint that sweeps along the bar now and then.
    const g = Math.floor((performance.now() / 10) % (t.w + 160)) - 20;
    if (g >= 0 && g < fw - 1) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      ctx.fillRect(fx + g * PX, fy + PX, PX * 2, Math.max(1, t.h - 2) * PX);
    }
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.fillRect(fx + (fw - 1) * PX, fy, PX, t.h * PX);
  }
  return { mx: x + art.medal.x * PX, my: y + art.medal.y * PX, tx: x + t.x * PX, ty: y + t.y * PX, tw: t.w * PX, th: t.h * PX };
}

// Simple pixel bar (enemy health): ink frame, trough, bevelled fill.
function hudBar(ctx, x, y, w, h, pct, pal) {
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(x - PX, y - PX, w + PX * 2, h + PX * 2);
  ctx.fillStyle = PAL.night0;
  ctx.fillRect(x, y, w, h);
  const fw = Math.round((w * clamp(pct, 0, 1)) / PX) * PX;
  if (fw > 0) {
    ctx.fillStyle = pal.fill;
    ctx.fillRect(x, y, fw, h);
    ctx.fillStyle = pal.light;
    ctx.fillRect(x, y, fw, PX);
  }
}

// Little four-point sparkle (kept for other callers).
function hudStar(ctx, x, y, r, color) {
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(Math.round(x - 1 - PX), Math.round(y - r - PX), 2 + PX * 2, r * 2 + PX * 2);
  ctx.fillRect(Math.round(x - r - PX), Math.round(y - 1 - PX), r * 2 + PX * 2, 2 + PX * 2);
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x - 1), Math.round(y - r), 2, r * 2);
  ctx.fillRect(Math.round(x - r), Math.round(y - 1), r * 2, 2);
}

// Accent colour for each stage's title text.
const ELEMENT_BY_BIOME = { sunset: "#ffc070", night: "#a8c0ff", cave: "#8ae8ff", hell: "#ff7a50" };

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
    ctx.fillStyle = "#05060f";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    if (t > swapAt * 0.6) {
      const stage = STAGES[tr.to];
      hudText(ctx, `Stage ${tr.to + 1}`, CANVAS_W / 2, CANVAS_H / 2 - 54, 8, PAL.lilac, "center");
      hudText(ctx, stage.name, CANVAS_W / 2, CANVAS_H / 2 - 30, 18, ELEMENT_BY_BIOME[stage.biome], "center", null, HUD_TITLE);
      const div = hudArt("divider", divider);
      ctx.drawImage(div, Math.round(CANVAS_W / 2 - div.width), Math.round(CANVAS_H / 2 + 16), div.width * PX, div.height * PX);
    }
    ctx.globalAlpha = 1;
  }

  drawVitals(ctx, game) {
    const p = game.player;
    const x = 12, y = VIEW_TOP + 10;
    const lowHp = p.hp / p.maxHp < 0.25 && Math.floor(performance.now() / 250) % 2 === 0;
    const hp = drawOrnateBar(ctx, x, y, 128, 8, 11, p.hp / p.maxHp, lowHp ? UI.boss : UI.hp, GEMS.rose);
    drawSprite(ctx, hudIcon("heart"), hp.mx, hp.my);
    hudText(ctx, `${Math.ceil(p.hp)} / ${p.maxHp}`, hp.tx + hp.tw / 2, hp.ty, 6, lowHp ? "#ffffff" : PAL.ivory, "center");

    // Stamina: sprint drains it, rolls cost a chunk. Winded = flashes.
    const winded = p.winded && Math.floor(performance.now() / 200) % 2 === 0;
    const en = drawOrnateBar(ctx, x + 10, y + 42, 108, 4, 8, p.stamina / p.maxStamina, winded ? UI.hp : UI.energy, GEMS.rare);
    drawSprite(ctx, hudIcon("feather"), en.mx, en.my);
    // Notch showing how much one roll costs.
    ctx.fillStyle = PAL.gold3;
    ctx.fillRect(Math.round(en.tx + en.tw * (PLAYER.rollCost / p.maxStamina)), en.ty - PX, PX, en.th + PX * 2);
    if (p.winded) hudText(ctx, "WINDED", en.tx + en.tw / 2, en.ty - 4, 5, PAL.ivory, "center");

    // Weapon chips: a framed plaque per slot with the weapon's own icon.
    let wy = y + 74;
    p.weaponSlots.forEach((item, i) => {
      if (!item) return;
      const el = elementOf(item.element);
      const label = WEAPON_BASES[item.base].name;
      const cw = Math.round(textWidth(ctx, label, 6) + 52 + item.mutations.length * 10);
      hudChip(ctx, x, wy, cw, 26);
      hudText(ctx, String(i + 1), x + 10, wy + 6, 6, PAL.lilac);
      ctx.drawImage(itemIcon(item), x + 20, wy + 5, 16, 16);
      hudText(ctx, label, x + 40, wy + 6, 6, item.mutations.length ? el.light : PAL.ivory);
      for (let m = 0; m < item.mutations.length; m++) hudStar(ctx, x + cw - 10 - m * 9, wy + 13, 3, "#e8b8ff");
      wy += 28;
    });
    if (game.autoFire) {
      hudChip(ctx, x, wy, 70, 24, GEMS.gold);
      hudText(ctx, "AUTO", x + 35, wy + 5, 6, PAL.gold3, "center");
      wy += 28;
    }
    this.drawAffinity(ctx, p, x, wy + 2);
  }

  // Element affinity tiles: framed, element gems in the corners, the item
  // count, and a lit pip per unlocked tier.
  drawAffinity(ctx, p, x, y) {
    let cx = x;
    for (const id of ELEMENT_IDS) {
      const n = p.affinity[id];
      if (!n) continue;
      const el = ELEMENTS[id];
      hudChip(ctx, cx, y, 34, 34, [el.dark, el.color, el.light]);
      hudText(ctx, String(n), cx + 17, y + 6, 7, el.light, "center");
      const tier = affinityTier(n);
      for (let t = 0; t < 3; t++) {
        ctx.fillStyle = t < tier ? el.light : "rgba(167, 161, 200, 0.3)";
        ctx.fillRect(cx + 9 + t * 7, y + 24, 4, 4);
      }
      cx += 38;
    }
  }

  // Reaction names pop above the enemy they happened on.
  drawPopups(ctx, game) {
    for (const pop of game.popups) {
      const at = game.renderer.projectPoint(pop.x, pop.y, pop.h + pop.t * 1.5);
      if (!at) continue;
      ctx.globalAlpha = clamp((pop.dur - pop.t) / 0.3, 0, 1);
      hudText(ctx, pop.text, at.x, at.y, 7, pop.color, "center");
      ctx.globalAlpha = 1;
    }
    // Damage numbers: pop up, drift, fade. Big hits get the large size.
    for (const n of game.dmgNumbers) {
      const at = game.renderer.projectPoint(n.x, n.y, n.h + n.t * 1.8);
      if (!at) continue;
      ctx.globalAlpha = clamp((n.dur - n.t) / 0.25, 0, 1);
      const big = n.big || n.t < 0.08;
      hudText(ctx, n.text, at.x, at.y, n.big ? 15 : big ? 9 : 7, n.color, "center", n.big ? n.color : null);
      ctx.globalAlpha = 1;
    }
  }

  drawClock(ctx, game) {
    const t = game.director ? game.director.time : 0;
    const w = 172, x = Math.round(CANVAS_W / 2 - w / 2), y = VIEW_TOP + 10;
    hudPanel(ctx, x, y, w, 74);
    hudText(ctx, fmtClock(t), CANVAS_W / 2, y + 10, 15, PAL.gold3, "center", "rgba(255, 210, 120, 0.6)");
    const threat = game.director ? game.director.threat : 1;
    const heat = ["#9fe0b0", "#fff0a0", "#ffc070", "#ff8a8a", "#ff6ac0"][Math.min(4, Math.floor((threat - 1) / 2))];
    hudText(ctx, `THREAT ${threat}`, CANVAS_W / 2, y + 38, 5, heat, "center");
    const stage = STAGES[game.stageIndex || 0];
    hudText(ctx, stage.name, CANVAS_W / 2, y + 52, 6, ELEMENT_BY_BIOME[stage.biome], "center");
  }

  drawBoss(ctx, game) {
    const boss = game.activeBoss;
    if (!boss) return;
    const len = 210;
    const width = (len + 30) * PX;
    const x = Math.round(CANVAS_W / 2 - width / 2), y = VIEW_TOP + 116;
    hudText(ctx, boss.name, CANVAS_W / 2, y - 26, 15, "#ffc0cc", "center", "rgba(255, 60, 90, 0.7)", HUD_TITLE);
    const b = drawOrnateBar(ctx, x, y, len, 6, 10, boss.hp / boss.maxHp, UI.boss, ["#4a0614", "#c8203e", "#ff8a9e"]);
    drawSprite(ctx, hudIcon("horns"), b.mx, b.my);
  }

  drawXp(ctx, game) {
    const p = game.player;
    const need = XP.toNext(p.level);
    const medalR = 14;
    const len = Math.floor((CANVAS_W - 24) / PX) - medalR * 2 - 10;
    const x = 12, y = VIEW_TOP + VIEW_H - (medalR * 2 + 2) * PX - 4;
    const b = drawOrnateBar(ctx, x, y, len, 5, medalR, p.xp / need, UI.xp, GEMS.gold);
    hudText(ctx, `${Math.floor(p.xp)} / ${need}`, b.tx + b.tw / 2, b.ty - 3, 5, PAL.ivory, "center");
    // Level number in the medallion, a halo floating above it.
    const halo = hudArt("halo", () => pixelSprite("halo", HALO_MAP, 14));
    drawSprite(ctx, halo, b.mx, b.my - medalR * PX - 2 + Math.sin(performance.now() / 500) * 2);
    hudText(ctx, "LV", b.mx, b.my - 15, 5, PAL.gold3, "center");
    hudText(ctx, String(p.level), b.mx, b.my - 3, 7, PAL.ivory, "center");
  }

  drawHints(ctx, game) {
    const p = game.player;
    const bag = `${p.backpack.length}/${p.backpackSlots}`;
    const text = `Q  POTION ${p.potions}/${PLAYER.maxPotions}    TAB  GEAR    BAG ${bag}`;
    const w = Math.round(textWidth(ctx, text, 6) + 36);
    const x = CANVAS_W - 12 - w, y = VIEW_TOP + VIEW_H - 104;
    hudPanel(ctx, x, y, w, 32);
    hudText(ctx, text, x + 18, y + 9, 6, p.backpackFull ? UI.hp.light : PAL.ivory);
  }

  drawMessages(ctx, dt) {
    let y = VIEW_TOP + VIEW_H - 112;
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i];
      m.t -= dt;
      if (m.t <= 0) { this.messages.splice(i, 1); continue; }
      ctx.globalAlpha = clamp(m.t / 0.6, 0, 1);
      hudText(ctx, m.text, 18, y, 7, m.color);
      ctx.globalAlpha = 1;
      y -= 20;
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
    const arm = Math.max(8, Math.round(Math.min(w, h) * 0.45));
    const T = PX;
    const rect = (x, y, rw, rh, col) => {
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(Math.min(x, x + rw)), Math.round(Math.min(y, y + rh)), Math.abs(rw), Math.abs(rh));
    };
    const corner = (cx, cy, sx, sy) => {
      rect(cx - sx * T, cy - sy * T, sx * (arm + T * 2), sy * T * 3, PAL.ink);
      rect(cx - sx * T, cy - sy * T, sx * T * 3, sy * (arm + T * 2), PAL.ink);
      rect(cx, cy, sx * arm, sy * T, PAL.gold3);
      rect(cx, cy, sx * T, sy * arm, PAL.gold3);
    };
    corner(box.x - w, box.y - h, 1, 1);
    corner(box.x + w, box.y - h, -1, 1);
    corner(box.x - w, box.y + h, 1, -1);
    corner(box.x + w, box.y + h, -1, -1);
    drawSprite(ctx, hudIcon("star"), box.x, box.y - h - (e.isBoss ? 8 : 24));

    // Mini HP bar over regular enemies (bosses have the big one up top).
    if (!e.isBoss) {
      const bw = Math.max(24, w * 2 - 6);
      hudBar(ctx, box.x - Math.floor(bw / 2), box.y - h - 14, bw, 4, e.hp / e.maxHp, e.elite ? UI.xp : UI.boss);
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
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    const rg = ctx.createRadialGradient(cx, cy, 4, cx, cy, r);
    rg.addColorStop(0, "rgba(44, 52, 99, 0.94)");
    rg.addColorStop(1, "rgba(12, 14, 34, 0.96)");
    ctx.fillStyle = rg;
    ctx.fill();
    ctx.clip();
    ctx.strokeStyle = "rgba(240, 211, 138, 0.12)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke();

    // Coastline ring
    const [ex, ey] = toRadar(0, 0);
    ctx.strokeStyle = "rgba(142, 200, 255, 0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(ex, ey, ARENA_RADIUS * k, 0, Math.PI * 2); ctx.stroke();

    for (const o of OBSTACLES) {
      if (Math.abs(o.x - p.x) > range + o.r || Math.abs(o.y - p.y) > range + o.r) continue;
      if (o.hw) {
        // Walls and buildings: their real outline.
        ctx.fillStyle = "rgba(240, 225, 190, 0.55)";
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
        ctx.fillStyle = "rgba(167, 161, 200, 0.3)";
        ctx.beginPath(); ctx.arc(ox, oy, o.r * k, 0, Math.PI * 2); ctx.fill();
      } else {
        dot(ox, oy, 2, "rgba(184, 200, 170, 0.4)");
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
    // Jeweled gold ring over the edge, and the player as a star.
    const ring = hudArt("radarRing", () => radarRingArt(Math.round(r / PX) + 4));
    drawSprite(ctx, ring, cx, cy);
    drawSprite(ctx, hudIcon("star"), cx, cy);
  }

  // Soft coloured vignette (red on a hit, blue during Bullet Time).
  drawDamage(ctx, flash, color = UI.hp.fill) {
    const a = clamp(flash / 0.35, 0, 1);
    const cx = CANVAS_W / 2, cy = VIEW_TOP + VIEW_H / 2;
    const g = ctx.createRadialGradient(cx, cy, Math.min(CANVAS_W, VIEW_H) * 0.35, cx, cy, Math.max(CANVAS_W, VIEW_H) * 0.72);
    g.addColorStop(0, "rgba(0, 0, 0, 0)");
    g.addColorStop(1, color);
    ctx.globalAlpha = a * 0.7;
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
    const y = Math.round(CANVAS_H / 2 - 110);
    const text = game.bannerText.charAt(0) + game.bannerText.slice(1).toLowerCase();
    hudText(ctx, text, CANVAS_W / 2, y, 18, game.bannerColor, "center", game.bannerColor, HUD_TITLE);
    const div = hudArt("divider", divider);
    ctx.drawImage(div, Math.round(CANVAS_W / 2 - div.width), y + 46, div.width * PX, div.height * PX);
    ctx.globalAlpha = 1;
  }
}

// Gold ring with gems at the four points, for the radar.
function radarRingArt(R) {
  const S = R * 2 + 3;
  const [c, ctx] = pxCanvas(S, S);
  const m = (S - 1) / 2;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x - m, dy = y - m, d = Math.hypot(dx, dy);
      if (d > R + 0.5 || d < R - 4.5) continue;
      let col;
      if (d > R - 0.5 || d < R - 3.5) col = PAL.ink;
      else col = dx + dy < -R * 0.4 ? PAL.gold3 : dx + dy > R * 0.4 ? PAL.gold1 : PAL.gold2;
      put(ctx, x, y, col);
    }
  }
  const mm = Math.round(m);
  gemPx(ctx, mm, mm - R + 2, 3, RAMPS.g); gemPx(ctx, mm, mm - R + 2, 2, GEMS.rose);
  for (const [gx, gy] of [[mm, mm + R - 2], [mm - R + 2, mm], [mm + R - 2, mm]]) gemPx(ctx, gx, gy, 2, RAMPS.g);
  return c;
}
