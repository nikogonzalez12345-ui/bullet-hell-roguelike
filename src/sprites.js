// Procedural pixel-art sprites. Every character is a tiny vector drawing
// rendered onto a small offscreen canvas, then blitted upscaled with
// image smoothing OFF — that combo is what gives cheap vector shapes a
// crunchy, chunky "pixel art" look without hand-authoring pixel grids.

const SPRITE_CACHE = new Map();

function getSprite(key, w, h, drawFn) {
  let sprite = SPRITE_CACHE.get(key);
  if (!sprite) {
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    drawFn(off.getContext("2d"), w, h);
    sprite = off;
    SPRITE_CACHE.set(key, sprite);
  }
  return sprite;
}

function drawSprite(ctx, sprite, cx, cy, drawW, drawH, flipX, rotation) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(cx, cy);
  if (rotation) ctx.rotate(rotation);
  if (flipX) ctx.scale(-1, 1);
  ctx.drawImage(sprite, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Chibi humanoid — used for the player and the four regular enemy types.
// hairStyle differentiates silhouettes so each type reads instantly even
// before you notice the color.
// ---------------------------------------------------------------------------

const W = 20, H = 24; // low-res canvas size; upscaled at draw time

function drawHair(ctx, cx, headY, headR, style, palette) {
  ctx.fillStyle = palette.hair;
  switch (style) {
    case "spiky": // player — energetic protagonist swoop
      ctx.beginPath();
      ctx.moveTo(cx - headR - 1, headY - 1);
      ctx.lineTo(cx - headR + 1, headY - headR - 4);
      ctx.lineTo(cx - 2, headY - headR + 1);
      ctx.lineTo(cx, headY - headR - 5);
      ctx.lineTo(cx + 2, headY - headR + 1);
      ctx.lineTo(cx + headR - 1, headY - headR - 4);
      ctx.lineTo(cx + headR + 1, headY - 1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = palette.hairDark;
      ctx.fillRect(cx - headR, headY - 2, headR * 2, 2);
      break;
    case "horns": // grunt oni — stubby horns, slicked-back hair
      ctx.beginPath();
      ctx.ellipse(cx, headY - headR + 1, headR, headR * 0.7, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = palette.hairDark;
      ctx.beginPath(); ctx.moveTo(cx - headR + 1, headY - headR); ctx.lineTo(cx - headR - 1, headY - headR - 4); ctx.lineTo(cx - headR + 3, headY - headR - 1); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx + headR - 1, headY - headR); ctx.lineTo(cx + headR + 1, headY - headR - 4); ctx.lineTo(cx + headR - 3, headY - headR - 1); ctx.fill();
      break;
    case "flame": // shooter — flickering flame-shaped hair
      ctx.beginPath();
      ctx.moveTo(cx - headR, headY - headR + 2);
      ctx.quadraticCurveTo(cx - headR - 2, headY - headR - 5, cx - 1, headY - headR - 6);
      ctx.quadraticCurveTo(cx + 1, headY - headR - 3, cx + 2, headY - headR - 6);
      ctx.quadraticCurveTo(cx + headR + 3, headY - headR - 4, cx + headR, headY - headR + 2);
      ctx.closePath();
      ctx.fill();
      break;
    case "hood": // sniper — hood shadows most of the face
      ctx.fillStyle = palette.body;
      ctx.beginPath();
      ctx.arc(cx, headY - headR + 2, headR + 2, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(cx - headR - 2, headY - headR + 2, (headR + 2) * 2, headR + 2);
      break;
    case "floating": // orbiter — wispy trailing hair, no real hairline
      ctx.beginPath();
      ctx.ellipse(cx, headY - headR, headR + 1, headR * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.ellipse(cx - headR, headY + 1, 2, 4, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + headR, headY + 1, 2, 4, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      break;
  }
}

function drawChibi(ctx, w, h, palette, hairStyle, opts = {}) {
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const floating = hairStyle === "floating";

  if (!floating) {
    // legs
    ctx.fillStyle = palette.bodyAccent;
    ctx.fillRect(cx - 3.5, h - 5, 2.5, 5);
    ctx.fillRect(cx + 1, h - 5, 2.5, 5);
  } else {
    // floating orb-spirit base instead of legs
    ctx.fillStyle = palette.bodyAccent;
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.ellipse(cx, h - 4, 4, 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // torso
  ctx.fillStyle = palette.body;
  roundRect(ctx, cx - 4.5, h - 14, 9, 9, 2);
  ctx.fill();
  ctx.fillStyle = palette.bodyAccent;
  ctx.fillRect(cx - 1, h - 13, 2, 7);

  // arms
  ctx.fillStyle = palette.body;
  ctx.fillRect(cx - 6.5, h - 13, 2, 6);
  ctx.fillRect(cx + 4.5, h - 13, 2, 6);

  // head
  const headY = h - 17;
  const headR = 5;
  ctx.fillStyle = palette.skin;
  ctx.beginPath();
  ctx.arc(cx, headY, headR, 0, Math.PI * 2);
  ctx.fill();

  drawHair(ctx, cx, headY, headR, hairStyle, palette);

  // eyes (skipped when hood fully shadows the face)
  if (hairStyle !== "hood") {
    ctx.fillStyle = palette.eye;
    ctx.fillRect(cx - 2.5, headY, 1.4, 2);
    ctx.fillRect(cx + 1.1, headY, 1.4, 2);
  } else {
    ctx.fillStyle = palette.eye;
    ctx.fillRect(cx - 1.8, headY, 1.2, 1.2);
    ctx.fillRect(cx + 0.6, headY, 1.2, 1.2);
  }

  if (opts.accessory) opts.accessory(ctx, cx, headY, headR, palette);
}

function chibiSprite(key, palette, hairStyle, opts) {
  return getSprite(key, W, H, (ctx) => drawChibi(ctx, W, H, palette, hairStyle, opts));
}

const CHARACTER_SPRITES = {
  player: () => chibiSprite("player", PALETTES.player, "spiky", {
    accessory(ctx, cx, headY, headR) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(cx - headR - 1, headY - 1, headR * 2 + 2, 1.5);
    },
  }),
  grunt: () => chibiSprite("grunt", PALETTES.grunt, "horns"),
  shooter: () => chibiSprite("shooter", PALETTES.shooter, "flame"),
  sniper: () => chibiSprite("sniper", PALETTES.sniper, "hood"),
  orbiter: () => chibiSprite("orbiter", PALETTES.orbiter, "floating"),
};

function getCharacterSprite(type) {
  return CHARACTER_SPRITES[type]();
}

// ---------------------------------------------------------------------------
// Bosses — bigger canvas, more silhouette detail, still nearest-neighbor
// upscaled so they match the chibi crowd's pixel-art texture.
// ---------------------------------------------------------------------------

const BW = 34, BH = 34;

const BOSS_SPRITES = {
  boss_oni: () => getSprite("boss_oni", BW, BH, (ctx) => {
    const p = PALETTES.boss_oni;
    const cx = BW / 2, cy = BH / 2 + 3;
    ctx.clearRect(0, 0, BW, BH);
    // legs
    ctx.fillStyle = p.hairDark;
    ctx.fillRect(cx - 7, cy + 8, 5, 6);
    ctx.fillRect(cx + 2, cy + 8, 5, 6);
    // torso — broad
    ctx.fillStyle = p.body;
    roundRect(ctx, cx - 10, cy - 6, 20, 16, 3);
    ctx.fill();
    ctx.fillStyle = p.bodyAccent;
    roundRect(ctx, cx - 10, cy - 6, 20, 5, 2);
    ctx.fill();
    // arms / fists
    ctx.fillStyle = p.skin;
    ctx.fillRect(cx - 14, cy - 2, 5, 8);
    ctx.fillRect(cx + 9, cy - 2, 5, 8);
    // head
    ctx.fillStyle = p.skin;
    ctx.beginPath(); ctx.arc(cx, cy - 12, 8, 0, Math.PI * 2); ctx.fill();
    // horns
    ctx.fillStyle = p.horn;
    ctx.beginPath(); ctx.moveTo(cx - 6, cy - 18); ctx.lineTo(cx - 9, cy - 27); ctx.lineTo(cx - 3, cy - 19); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + 6, cy - 18); ctx.lineTo(cx + 9, cy - 27); ctx.lineTo(cx + 3, cy - 19); ctx.fill();
    // brow + eyes (angry)
    ctx.fillStyle = "#1a0a0a";
    ctx.fillRect(cx - 7, cy - 15, 5, 1.6);
    ctx.fillRect(cx + 2, cy - 15, 5, 1.6);
    ctx.fillStyle = p.eye;
    ctx.fillRect(cx - 6, cy - 13, 2.4, 2.4);
    ctx.fillRect(cx + 3.6, cy - 13, 2.4, 2.4);
    // fangs
    ctx.fillStyle = "#fff8e8";
    ctx.fillRect(cx - 2.5, cy - 6.5, 1.6, 3);
    ctx.fillRect(cx + 1, cy - 6.5, 1.6, 3);
  }),

  boss_kitsune: () => getSprite("boss_kitsune", BW, BH, (ctx) => {
    const p = PALETTES.boss_kitsune;
    const cx = BW / 2, cy = BH / 2 + 4;
    ctx.clearRect(0, 0, BW, BH);
    // tails fanning out behind
    ctx.fillStyle = p.tail;
    for (let i = -1; i <= 1; i++) {
      ctx.save();
      ctx.translate(cx, cy + 4);
      ctx.rotate(i * 0.5);
      ctx.beginPath();
      ctx.ellipse(0, 9, 3, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // robe
    ctx.fillStyle = p.body;
    roundRect(ctx, cx - 8, cy - 6, 16, 15, 4);
    ctx.fill();
    ctx.fillStyle = p.bodyAccent;
    ctx.fillRect(cx - 1.5, cy - 6, 3, 15);
    // arms/sleeves
    ctx.fillStyle = p.body;
    ctx.fillRect(cx - 12, cy - 3, 5, 9);
    ctx.fillRect(cx + 7, cy - 3, 5, 9);
    // head with fox ears
    ctx.fillStyle = p.skin;
    ctx.beginPath(); ctx.moveTo(cx - 7, cy - 13); ctx.lineTo(cx - 10, cy - 22); ctx.lineTo(cx - 3, cy - 15); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + 7, cy - 13); ctx.lineTo(cx + 10, cy - 22); ctx.lineTo(cx + 3, cy - 15); ctx.fill();
    ctx.fillStyle = p.hair;
    ctx.beginPath(); ctx.moveTo(cx - 6.4, cy - 14); ctx.lineTo(cx - 8, cy - 19); ctx.lineTo(cx - 4, cy - 15.5); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + 6.4, cy - 14); ctx.lineTo(cx + 8, cy - 19); ctx.lineTo(cx + 4, cy - 15.5); ctx.fill();
    ctx.fillStyle = p.skin;
    ctx.beginPath(); ctx.arc(cx, cy - 11, 7, 0, Math.PI * 2); ctx.fill();
    // fox mask markings + eyes
    ctx.fillStyle = p.eye;
    ctx.beginPath(); ctx.ellipse(cx - 3, cy - 11, 1.6, 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 3, cy - 11, 1.6, 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.bodyAccent;
    ctx.fillRect(cx - 5, cy - 8, 2.5, 1.2);
    ctx.fillRect(cx + 2.5, cy - 8, 2.5, 1.2);
  }),

  boss_dragon: () => getSprite("boss_dragon", BW, BH, (ctx) => {
    const p = PALETTES.boss_dragon;
    const cx = BW / 2, cy = BH / 2 + 2;
    ctx.clearRect(0, 0, BW, BH);
    // serpentine body trailing below
    ctx.strokeStyle = p.body;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(cx, cy + 2);
    ctx.quadraticCurveTo(cx - 10, cy + 9, cx - 3, cy + 15);
    ctx.quadraticCurveTo(cx + 6, cy + 20, cx, cy + 25);
    ctx.stroke();
    ctx.strokeStyle = p.bodyAccent;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // chest/torso
    ctx.fillStyle = p.body;
    roundRect(ctx, cx - 8, cy - 7, 16, 13, 4);
    ctx.fill();
    // wing hints
    ctx.fillStyle = p.hairDark;
    ctx.beginPath(); ctx.moveTo(cx - 8, cy - 4); ctx.lineTo(cx - 17, cy - 8); ctx.lineTo(cx - 9, cy + 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + 8, cy - 4); ctx.lineTo(cx + 17, cy - 8); ctx.lineTo(cx + 9, cy + 2); ctx.fill();
    // head
    ctx.fillStyle = p.skin;
    roundRect(ctx, cx - 6, cy - 16, 12, 10, 3);
    ctx.fill();
    // horns
    ctx.fillStyle = p.horn;
    ctx.beginPath(); ctx.moveTo(cx - 4, cy - 15); ctx.lineTo(cx - 7, cy - 22); ctx.lineTo(cx - 2, cy - 16); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + 4, cy - 15); ctx.lineTo(cx + 7, cy - 22); ctx.lineTo(cx + 2, cy - 16); ctx.fill();
    // snout + glowing eyes
    ctx.fillStyle = p.hairDark;
    ctx.fillRect(cx - 5, cy - 9, 10, 3);
    ctx.fillStyle = p.eye;
    ctx.fillRect(cx - 4, cy - 13, 2.2, 2.2);
    ctx.fillRect(cx + 1.8, cy - 13, 2.2, 2.2);
  }),
};

function getBossSprite(type) {
  return BOSS_SPRITES[type]();
}
