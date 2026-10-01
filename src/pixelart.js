// Pixel-art UI kit. Everything here is drawn in code into small canvases:
//  - sprites authored as character maps, auto-outlined and bevel-shaded
//  - ornate 9-slice frames (filigree curls + corner gems) for panels, cards,
//    buttons, slots and tooltips, exposed to CSS as border-images
//  - the emblem, ribbon, divider and wing ornaments
// The HUD (hud.js) and DOM screens (ui.js / style.css) share these.

const PAL = {
  ink: "#0b0916",
  night0: "#0c0e22", night1: "#151935", night2: "#1f2448", night3: "#2c3463", night4: "#434d8a",
  gold0: "#4e3412", gold1: "#8f6224", gold2: "#d0a04a", gold3: "#f0d38a", gold4: "#fff4cc",
  ivory: "#f1e9d2", lilac: "#a7a1c8",
};

// Colour ramps for sprites: [shade, base, highlight].
const RAMPS = {
  w: ["#6c6a8a", "#c8c6dc", "#ffffff"],   // silver / white
  g: [PAL.gold1, PAL.gold2, PAL.gold3],    // gold
  r: ["#6e1a34", "#d0405e", "#ff9fb0"],    // rose / red
  b: ["#1f4a8a", "#4a9ae8", "#bfe6ff"],    // sky blue
  p: ["#4a1e7a", "#9a52e0", "#e0b8ff"],    // amethyst
  n: ["#1e5a34", "#4ab868", "#b8f0c0"],    // green
  o: ["#7a2a0a", "#f0782a", "#ffd080"],    // fire orange
  k: ["#1a1828", "#3a3850", "#6a6888"],    // iron
  y: ["#a07a10", "#ffd23a", "#fff6b0"],    // bright yellow
  c: ["#14606e", "#3ad0e0", "#c0fbff"],    // cyan
  m: ["#4a2a14", "#8a5a30", "#c89060"],    // wood / leather
  v: ["#2a1438", "#5a2a6e", "#9a5ab0"],    // dark violet
};

// Gem colours per rarity / theme.
const GEMS = {
  common: ["#5c5a78", "#b8b6d0", "#ffffff"],
  uncommon: ["#1e5a3a", "#58c47a", "#d0ffd8"],
  rare: ["#1c3c8a", "#4a8ef0", "#c8e4ff"],
  epic: ["#4a1a7a", "#a058ec", "#efd0ff"],
  wild: ["#2a4a9a", "#d05ae8", "#b8fbff"],
  legendary: ["#8a4a10", "#f2a83a", "#fff0b0"],
  gold: [PAL.gold1, PAL.gold2, PAL.gold4],
  rose: ["#7a1a34", "#e0506e", "#ffc0cc"],
};

function pxCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}
function put(ctx, x, y, col) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); }
function fillPx(ctx, x, y, w, h, col) { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); }

// Pixel arc (for filigree curls).
function arcPx(ctx, cx, cy, r, a0, a1, col) {
  const steps = Math.ceil(Math.abs(a1 - a0) * r * 2) + 4;
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * (i / steps);
    put(ctx, Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), col);
  }
}

// Faceted gem: highlight on the upper-left facets, shade lower-right, a glint.
function gemPx(ctx, cx, cy, r, ramp) {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d = Math.abs(dx) + Math.abs(dy);
      if (d > r) continue;
      let col = ramp[1];
      if (d === r) col = dy < 0 || (dy === 0 && dx < 0) ? ramp[2] : ramp[0];
      else if (dx + dy > 0) col = ramp[0];
      put(ctx, cx + dx, cy + dy, col);
    }
  }
  if (r >= 2) put(ctx, cx - 1, cy - 1, "#ffffff");
}

// ---------------------------------------------------------------------------
// Sprites from character maps. '.' = empty; a lowercase ramp key is shaded
// automatically (light where exposed above, dark below/right); uppercase =
// forced highlight; '*' = white glint; '#' = ink. A 1px ink outline is added.
// ---------------------------------------------------------------------------

const SPRITE_CACHE = new Map();
function pixelSprite(key, rows, size = 16) {
  if (SPRITE_CACHE.has(key)) return SPRITE_CACHE.get(key);
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const SW = Math.max(size, w), SH = Math.max(size, h); // size 0 = fit the art
  const W = SW + 2, H = SH + 2;
  const ox = 1 + Math.floor((SW - w) / 2), oy = 1 + Math.floor((SH - h) / 2);
  const grid = Array.from({ length: H }, () => Array(W).fill(null));
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== "." && ch !== " ") grid[y + oy][x + ox] = ch; }));
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? null : grid[y][x]);
  const [c, ctx] = pxCanvas(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = grid[y][x];
      if (!ch) {
        if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) put(ctx, x, y, PAL.ink);
        continue;
      }
      if (ch === "*") { put(ctx, x, y, "#ffffff"); continue; }
      if (ch === "#") { put(ctx, x, y, PAL.ink); continue; }
      const ramp = RAMPS[ch.toLowerCase()];
      if (!ramp) continue;
      let col = ramp[1];
      if (ch !== ch.toLowerCase()) col = ramp[2];
      else {
        const same = (nx, ny) => { const n = at(nx, ny); return n && n.toLowerCase() === ch; };
        if (!same(x, y - 1)) col = ramp[2];
        else if (!same(x, y + 1) || !same(x + 1, y)) col = ramp[0];
      }
      put(ctx, x, y, col);
    }
  }
  SPRITE_CACHE.set(key, c);
  return c;
}

// Scale a canvas up with crisp pixels (for <img> data URLs).
function upscale(c, k) {
  const [o, ctx] = pxCanvas(c.width * k, c.height * k);
  ctx.drawImage(c, 0, 0, c.width * k, c.height * k);
  return o;
}

// ---------------------------------------------------------------------------
// Ornate 9-slice frames
// ---------------------------------------------------------------------------

// Corner ornament for the top-left corner of a frame with slice size `c`:
// a gem in a gold setting, with filigree curls running out along both edges.
function cornerOrnament(c, gem, curls) {
  const [o, ctx] = pxCanvas(c, c);
  const G = RAMPS.g;
  if (curls && c >= 12) {
    // Curls along the top and left edges, ending in a little bud.
    const k = c / 16;
    arcPx(ctx, 10 * k + 2, 6 * k, 2.2 * k, Math.PI * 0.9, Math.PI * 2.4, G[2]);
    arcPx(ctx, 10 * k + 2, 6 * k + 1, 2.2 * k, Math.PI * 0.9, Math.PI * 2.4, G[0]);
    arcPx(ctx, 6 * k, 10 * k + 2, 2.2 * k, Math.PI * 1.4, Math.PI * 2.9, G[2]);
    arcPx(ctx, 6 * k + 1, 10 * k + 2, 2.2 * k, Math.PI * 1.4, Math.PI * 2.9, G[0]);
    put(ctx, Math.round(13 * k + 1), Math.round(4 * k), G[2]);
    put(ctx, Math.round(4 * k), Math.round(13 * k + 1), G[2]);
  }
  const g = Math.round(c * 0.3) + 1;
  if (gem) {
    gemPx(ctx, g, g, Math.max(2, Math.round(c / 5.5)) + 1, G);
    gemPx(ctx, g, g, Math.max(1, Math.round(c / 5.5)), gem);
  } else {
    gemPx(ctx, g, g, Math.max(1, Math.round(c / 8)), G);
  }
  return o;
}

// opts: c (slice px), fill [top, bottom], rim ("gold" | "dark"), gem (ramp),
// curls, inset (recessed slot look), inner (thin inner gold line).
function ornateFrame({ c = 16, fill = [PAL.night2, PAL.night1], gem = null, curls = true, inset = false, inner = true, rim = "gold" }) {
  const S = c * 3;
  const [cv, ctx] = pxCanvas(S, S);
  // Fill (vertical gradient, quantised into bands for a pixel look).
  const bands = 6;
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    fillPx(ctx, 2, 2 + Math.floor((S - 4) * i / bands), S - 4, Math.ceil((S - 4) / bands) + 1, lerpColor(fill[0], fill[1], t));
  }
  // Ink outline with clipped corners.
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(2, 0, S - 4, 1); ctx.fillRect(2, S - 1, S - 4, 1);
  ctx.fillRect(0, 2, 1, S - 4); ctx.fillRect(S - 1, 2, 1, S - 4);
  put(ctx, 1, 1, PAL.ink); put(ctx, S - 2, 1, PAL.ink); put(ctx, 1, S - 2, PAL.ink); put(ctx, S - 2, S - 2, PAL.ink);
  // Rim: 2px bevel (light top/left, dark bottom/right; reversed when inset).
  const R = rim === "gold" ? RAMPS.g : [PAL.night1, PAL.night3, PAL.night4];
  const lightC = inset ? R[0] : R[2], darkC = inset ? R[2] : R[0];
  fillPx(ctx, 2, 1, S - 4, 1, lightC); fillPx(ctx, 1, 2, 1, S - 4, lightC);
  fillPx(ctx, 2, S - 2, S - 4, 1, darkC); fillPx(ctx, S - 2, 2, 1, S - 4, darkC);
  fillPx(ctx, 2, 2, S - 4, 1, R[1]); fillPx(ctx, 2, 2, 1, S - 4, R[1]);
  fillPx(ctx, 2, S - 3, S - 4, 1, R[1]); fillPx(ctx, S - 3, 2, 1, S - 4, R[1]);
  // Dark gap, then a thin inner gold line.
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(3, 3, S - 6, 1); ctx.fillRect(3, S - 4, S - 6, 1);
  ctx.fillRect(3, 3, 1, S - 6); ctx.fillRect(S - 4, 3, 1, S - 6);
  if (inner && c >= 10) {
    ctx.fillStyle = PAL.gold1;
    ctx.fillRect(c, 5, S - 2 * c, 1); ctx.fillRect(c, S - 6, S - 2 * c, 1);
    ctx.fillRect(5, c, 1, S - 2 * c); ctx.fillRect(S - 6, c, 1, S - 2 * c);
  }
  // Corner ornaments, mirrored into all four corners.
  const orn = cornerOrnament(c, gem, curls);
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    ctx.save();
    ctx.translate(sx > 0 ? 0 : S, sy > 0 ? 0 : S);
    ctx.scale(sx, sy);
    ctx.drawImage(orn, 0, 0);
    ctx.restore();
  }
  return cv;
}

function lerpColor(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * t);
  return "#" + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}

// Draw a 9-slice frame onto a canvas at an integer pixel scale.
function drawNine(ctx, img, x, y, w, h, scale = 2) {
  const c = img.width / 3, d = c * scale;
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const sx = [0, c, 2 * c], dx = [x, x + d, x + w - d], dw = [d, w - 2 * d, d];
  const dy = [y, y + d, y + h - d], dh = [d, h - 2 * d, d];
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) {
      if (dw[i] <= 0 || dh[j] <= 0) continue;
      ctx.drawImage(img, sx[i], sx[j], c, c, dx[i], dy[j], dw[i], dh[j]);
    }
  }
}

// ---------------------------------------------------------------------------
// Ornaments
// ---------------------------------------------------------------------------

// Diamond emblem that holds an icon (cards, medallions).
function emblem(gem) {
  const S = 34;
  const [c, ctx] = pxCanvas(S, S);
  const m = S / 2 - 0.5;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.abs(x - m) + Math.abs(y - m);
      if (d > 16.5) continue;
      let col;
      if (d > 15.5) col = PAL.ink;
      else if (d > 13.5) col = (y < m ? (x < m ? PAL.gold3 : PAL.gold2) : (x < m ? PAL.gold2 : PAL.gold1));
      else if (d > 12.5) col = PAL.ink;
      else {
        // Inner glass: dark night with a soft glow of the gem colour toward the centre.
        const t = Math.min(1, d / 12.5);
        col = lerpColor(lerpColor(gem[1], PAL.night1, 0.45), PAL.night0, t * t);
      }
      put(ctx, x, y, col);
    }
  }
  // Little gems at the four points.
  gemPx(ctx, 16, 1, 1, gem); gemPx(ctx, 16, 32, 1, gem); gemPx(ctx, 1, 16, 1, gem); gemPx(ctx, 32, 16, 1, gem);
  return c;
}

// Ribbon banner (horizontal 9-slice: 10px ends, stretchable middle).
function ribbon(gem) {
  const W = 30, H = 14;
  const [c, ctx] = pxCanvas(W, H);
  const base = lerpColor(gem[1], PAL.night2, 0.35), dark = lerpColor(gem[0], PAL.night0, 0.3), light = lerpColor(gem[2], gem[1], 0.4);
  // Swallow-tailed ends.
  for (let y = 0; y < H; y++) {
    const notch = Math.abs(y - (H - 1) / 2) < 2.5 ? 3 - Math.floor(Math.abs(y - (H - 1) / 2)) : 0;
    const x0 = notch, x1 = W - notch;
    fillPx(ctx, x0, y, x1 - x0, 1, y === 0 || y === H - 1 ? PAL.ink : y === 1 ? PAL.gold3 : y === H - 2 ? PAL.gold1 : y === 2 ? light : y >= H - 4 ? dark : base);
    put(ctx, x0, y, PAL.ink); put(ctx, x1 - 1, y, PAL.ink);
  }
  // Folds near the ends.
  for (const fx of [6, W - 7]) for (let y = 2; y < H - 2; y++) put(ctx, fx, y, dark);
  return c;
}

// Horizontal divider: gold line fading out with a central fleur and side diamonds.
function divider() {
  const W = 120, H = 9;
  const [c, ctx] = pxCanvas(W, H);
  for (let x = 0; x < W; x++) {
    const t = 1 - Math.abs(x - W / 2) / (W / 2);
    if (t < 0.08) continue;
    put(ctx, x, 4, t > 0.5 ? PAL.gold3 : t > 0.25 ? PAL.gold2 : PAL.gold1);
    if (t > 0.6) put(ctx, x, 5, PAL.gold0);
  }
  gemPx(ctx, W / 2, 4, 4, RAMPS.g);
  gemPx(ctx, W / 2, 4, 2, GEMS.rose);
  gemPx(ctx, W / 2 - 14, 4, 2, RAMPS.g);
  gemPx(ctx, W / 2 + 14, 4, 2, RAMPS.g);
  return c;
}

// Feathered angel wing (left wing; mirror for the right).
const WING_MAP = [
  "..........gggg",
  ".......ggwwwwg",
  ".....gwwwwwwwg",
  "...gwwwwwwwwwg",
  "..gwwwwwwwwwwg",
  ".gwwwwwwwwwwg.",
  "gwwwwwwwwwwwg.",
  "wwwwwwwwwwwg..",
  "wwwwww.wwwww..",
  ".www..wwwwg...",
  "..w..wwww.....",
  "....www.ww....",
  "...ww..ww.....",
  "......w.......",
];

// Halo ring.
const HALO_MAP = [
  "......yyyyyy......",
  "...yyyYYYYYYyyy...",
  ".yyy..........yyy.",
  "yy..............yy",
  ".yyy..........yyy.",
  "...yyyyyyyyyyyy...",
  "......yyyyyy......",
];

// Publish the frames and ornaments to CSS as custom properties, so the DOM
// screens can use them as pixel-crisp border-images and backgrounds.
function initPixelUI() {
  const root = document.documentElement.style;
  const set = (name, canvas) => root.setProperty(name, `url("${canvas.toDataURL()}")`);
  set("--frame-panel", ornateFrame({ c: 16, gem: GEMS.rose }));
  for (const r of ["common", "uncommon", "rare", "epic", "legendary", "wild"]) {
    set(`--frame-card-${r}`, ornateFrame({ c: 12, gem: GEMS[r] }));
    set(`--ribbon-${r}`, ribbon(GEMS[r]));
    set(`--emblem-${r}`, emblem(GEMS[r]));
  }
  set("--frame-button", ornateFrame({ c: 6, curls: false, inner: false, fill: [PAL.night3, PAL.night2] }));
  set("--frame-button-hot", ornateFrame({ c: 6, curls: false, inner: false, fill: [PAL.night4, PAL.night3] }));
  set("--frame-button-primary", ornateFrame({ c: 6, curls: false, inner: false, fill: ["#4e3c78", "#2c2452"] }));
  set("--frame-slot", ornateFrame({ c: 6, inset: true, curls: false, inner: false, rim: "dark", fill: [PAL.night0, PAL.night1] }));
  set("--frame-tooltip", ornateFrame({ c: 10, gem: GEMS.gold, fill: [PAL.night2, PAL.night0] }));
  set("--frame-plaque", ornateFrame({ c: 8, curls: false, gem: GEMS.gold, fill: [PAL.night2, PAL.night1] }));
  set("--divider", divider());
  set("--wing", wingArt());
  set("--halo", pixelSprite("haloFit", HALO_MAP, 0));
}

// Angel wing: a fan of outlined, shaded feathers painted back to front so
// each overlaps the one below, then a row of gold-tipped coverts at the root.
// Left wing (the root is on the right); mirror it for the right side.
function wingArt() {
  const W = 46, H = 46;
  const [c, ctx] = pxCanvas(W, H);
  const R = [W - 4, 31];
  const feather = (deg, len, wid, body, shade, tip) => {
    const a = (deg * Math.PI) / 180, ax = Math.cos(a), ay = Math.sin(a);
    const half = (s) => wid * Math.pow(Math.sin(Math.PI * Math.min(0.999, Math.max(0.03, s / len))), 0.55);
    const inside = (x, y, grow) => {
      const dx = x - R[0], dy = y - R[1];
      const s = dx * ax + dy * ay, p = -dx * ay + dy * ax;
      if (s < -grow || s > len + grow) return null;
      return Math.abs(p) <= half(s) + grow ? { s, p } : null;
    };
    for (const pass of [0, 1]) {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (pass === 0) { if (inside(x, y, 1)) put(ctx, x, y, PAL.ink); continue; }
          const q = inside(x, y, 0);
          if (!q) continue;
          let col = q.p > 0.6 ? shade : body;
          if (q.s > len * 0.82) col = tip;
          if (Math.abs(q.p) < 0.5 && q.s > 3) col = lerpColor(body, shade, 0.5); // quill
          put(ctx, x, y, col);
        }
      }
    }
  };
  // Short feathers low on the wing, sweeping up to long ones at the raised tip.
  const prim = [[112, 11], [128, 16], [144, 21], [160, 26], [176, 30], [192, 34], [207, 37], [221, 38], [234, 33]];
  for (const [deg, len] of prim) feather(deg, len, 3.4, "#ffffff", "#c6c2e0", "#e4dcff");
  for (const [deg, len] of [[165, 12], [185, 14], [205, 16], [225, 15], [244, 11]]) feather(deg, len, 3.8, "#fff7e0", "#d8c8a0", PAL.gold3);
  return c;
}
