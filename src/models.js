// Low-poly character models built from boxes/cones, PS1 style. Every model
// faces +Z locally, stands with its feet at y=0, and exposes update() for
// walk/roll/hover animation and a flash() hook for hit feedback.

const GEO_CACHE = new Map();
function cachedGeo(key, make) {
  if (!GEO_CACHE.has(key)) GEO_CACHE.set(key, make());
  return GEO_CACHE.get(key);
}
const box = (w, h, d) => cachedGeo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cone = (r, h, s = 5) => cachedGeo(`c${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s));

// ---------------------------------------------------------------------------
// Characters — PS1-era "realistic" proportions (think Tomb Raider '96):
// a lathed torso, tapered limbs with knee/elbow joints, a round head with a
// painted face. Outfits are painted as bands on the torso/limb textures.
// The player is an angel; the humanoid enemies are demons.
//
// Spec fields:
//   body: "fem" | "brute" | "imp"      skin, eye, lips, hair, hairStyle
//   top / bottom / boots / gloves / trim: outfit colours (null = bare skin)
//   midriff: bare waist        thighBoots: boots run up over the knee
//   wings: "feather" | "bat"   halo: "gold" | "dark"   horns, bigHorns
//   tail, foxEars, tails (kitsune), gown (floating robe instead of legs),
//   skirt, hood, floating, hover, weapon, satchel, scale
// ---------------------------------------------------------------------------

const CHARACTER_SPECS = {
  player: {
    body: "fem", skin: "#f6d6c2", eye: "#3a8ad8", lips: "#d07080", hair: "#f4d47a", hairStyle: "long",
    top: "#f6f2ea", bottom: "#f6f2ea", boots: "#efe4c8", gloves: null, trim: "#e8b84a",
    skirt: "#f6f2ea", wings: "feather", halo: "gold", satchel: true, dynamicGear: true,
  },
  grunt: {
    body: "fem", skin: "#c8524c", eye: "#ffd23b", lips: "#3a0812", hair: "#160810", hairStyle: "long",
    top: "#1c1016", bottom: "#1c1016", boots: "#120a0e", gloves: "#120a0e", trim: "#a01a2e",
    midriff: true, thighBoots: true, horns: "#2a1418", wings: "bat", wingColor: "#3a0a16", tail: true,
    weapon: "sickle", scale: 0.95,
  },
  shooter: {
    body: "fem", skin: "#d8a6cc", eye: "#ff3a6a", lips: "#6a0c3a", hair: "#ff5a8a", hairStyle: "ponytail",
    top: "#6a0a1e", bottom: "#24080e", boots: "#24080e", gloves: "#24080e", trim: "#ffb02a",
    midriff: true, thighBoots: true, horns: "#f0e0d0", tail: true, weapon: "pistol",
  },
  sniper: {
    body: "fem", skin: "#a0a0c0", eye: "#c46bff", lips: "#3a1a4a", hair: "#ececf8", hairStyle: "long",
    top: "#20142c", bottom: "#20142c", boots: "#140c1c", gloves: "#140c1c", trim: "#c46bff",
    thighBoots: true, hood: "#2c1c3c", horns: "#140c1c", weapon: "longRifle",
  },
  orbiter: {
    body: "fem", skin: "#f2c4da", eye: "#ff3b9c", lips: "#8a1050", hair: "#3a0a2a", hairStyle: "long",
    top: "#6a1a4a", gown: "#6a1a4a", gloves: "#3a0a2a", trim: "#ff6bd0",
    horns: "#1a0a14", halo: "dark", wings: "bat", wingColor: "#4a0a3a", floating: true, scale: 0.95,
  },
  imp: {
    body: "imp", skin: "#c83a2a", eye: "#ffd23b", hair: null,
    top: null, bottom: "#4a0a0a", trim: "#2a0a0a", horns: "#2a0a0a", ears: true,
    wings: "bat", wingColor: "#3a0a14", tail: true, floating: true, scale: 0.8,
  },
  boss_oni: {
    body: "brute", skin: "#c83a2e", eye: "#ffe066", hair: "#1a0a0a", hairStyle: "wild",
    top: null, bottom: "#3a1010", boots: "#2a0a0a", trim: "#c8a040",
    horns: "#f2e6c8", bigHorns: true, weapon: "bigClub", scale: 2.1,
  },
  boss_kitsune: {
    body: "fem", skin: "#fff3e6", eye: "#ff3b6b", lips: "#c0204a", hair: "#ffffff", hairStyle: "long",
    top: "#8a1a3a", gown: "#8a1a3a", gloves: null, trim: "#ffd04a",
    foxEars: true, tails: 5, hover: 0.6, scale: 1.9,
  },
  boss_demon: {
    body: "brute", skin: "#7a1414", eye: "#ff7a1a", hair: null,
    top: "#24060a", bottom: "#1a0505", boots: "#0a0202", gloves: "#0a0202", trim: "#ff5a1a",
    horns: "#e8d8b0", bigHorns: true, wings: "bat", wingColor: "#2a0508", tail: true, weapon: "bigClub", scale: 2.4,
  },
};

// Body plans (feet at y = 0). Torso profiles are [radius, y] lathe points.
const BODY_PLANS = {
  fem: {
    hipY: 0.98, legX: 0.1, thigh: [0.47, 0.1, 0.07], calf: [0.47, 0.07, 0.045],
    shoulderX: 0.21, shoulderY: 1.54, upper: [0.29, 0.056, 0.045], fore: [0.27, 0.045, 0.034],
    head: 0.125, headY: 1.83, neck: 0.05, sx: 1.12, sz: 0.72,
    torso: [[0.12, 0.9], [0.19, 0.96], [0.205, 1.03], [0.18, 1.1], [0.135, 1.19], [0.15, 1.28],
            [0.18, 1.36], [0.175, 1.44], [0.19, 1.52], [0.14, 1.58], [0.055, 1.63]],
    waistY: 1.12, chestY: [1.24, 1.5],
  },
  brute: {
    hipY: 1.0, legX: 0.15, thigh: [0.46, 0.14, 0.11], calf: [0.46, 0.11, 0.08],
    shoulderX: 0.34, shoulderY: 1.58, upper: [0.31, 0.1, 0.085], fore: [0.3, 0.085, 0.07],
    head: 0.14, headY: 1.86, neck: 0.09, sx: 1.12, sz: 0.76,
    torso: [[0.19, 0.92], [0.25, 1.0], [0.245, 1.1], [0.235, 1.2], [0.27, 1.32], [0.31, 1.45],
            [0.33, 1.55], [0.26, 1.63], [0.1, 1.69]],
    waistY: 1.15, chestY: [1.3, 1.58],
  },
  imp: {
    hipY: 0.82, legX: 0.11, thigh: [0.36, 0.09, 0.07], calf: [0.36, 0.07, 0.05],
    shoulderX: 0.24, shoulderY: 1.34, upper: [0.26, 0.065, 0.05], fore: [0.24, 0.05, 0.04],
    head: 0.17, headY: 1.62, neck: 0.06, sx: 1.05, sz: 0.85,
    torso: [[0.15, 0.74], [0.2, 0.82], [0.22, 0.95], [0.21, 1.08], [0.22, 1.2], [0.2, 1.32], [0.08, 1.42]],
    waistY: 0.9, chestY: [1.0, 1.3],
  },
};

// ---- Painted textures --------------------------------------------------------

const BAND_CACHE = new Map();
// Vertical bands, top to bottom: [[from, to, color, pattern?], ...] with
// from/to in 0..1 measured from the top of the texture.
function bandTexture(bands, w = 16, h = 32) {
  const key = JSON.stringify(bands) + w + "x" + h;
  if (BAND_CACHE.has(key)) return BAND_CACHE.get(key);
  const tex = makeTexture(8, (ctx) => {
    const c = ctx.canvas;
    c.width = w; c.height = h;
    for (const [a, b, color, pattern] of bands) {
      const y0 = Math.floor(a * h), y1 = Math.max(y0 + 1, Math.ceil(b * h));
      ctx.fillStyle = color;
      ctx.fillRect(0, y0, w, y1 - y0);
      // A little cloth/skin grain.
      for (let i = 0; i < (y1 - y0) * w * 0.08; i++) {
        ctx.fillStyle = Math.random() < 0.5 ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.08)";
        ctx.fillRect(Math.floor(Math.random() * w), y0 + Math.floor(Math.random() * (y1 - y0)), 1, 1);
      }
      if (pattern === "lace") {
        // Corset lacing down the front (u = 0 / 1 is the front of a lathe).
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        for (let y = y0 + 1; y < y1; y += 2) { ctx.fillRect(0, y, 1, 1); ctx.fillRect(w - 1, y + 1, 1, 1); }
      } else if (pattern === "abs") {
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        for (let y = y0 + 2; y < y1; y += 3) { ctx.fillRect(w - 2, y, 2, 1); ctx.fillRect(0, y, 2, 1); }
        ctx.fillRect(0, y0, 1, y1 - y0);
      } else if (pattern === "feather") {
        ctx.fillStyle = "rgba(120,110,90,0.35)";
        for (let x = 1; x < w; x += 3) ctx.fillRect(x, y0, 1, y1 - y0);
      }
    }
  }, true);
  BAND_CACHE.set(key, tex);
  return tex;
}

// 64x32 wrap-around head texture; the face is centred at u = 0.5, which the
// head geometry turns to face +Z.
const HEAD_CACHE = new Map();
function headTexture(s) {
  const key = [s.body, s.skin, s.hair, s.hairStyle, s.eye, s.lips].join("|");
  if (HEAD_CACHE.has(key)) return HEAD_CACHE.get(key);
  const tex = makeTexture(8, (ctx) => {
    const c = ctx.canvas;
    c.width = 64; c.height = 32;
    const px = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
    px(0, 0, 64, 32, s.skin);
    // Soft shading at the sides of the face.
    px(20, 12, 2, 12, "rgba(0,0,0,0.10)"); px(42, 12, 2, 12, "rgba(0,0,0,0.10)");
    const brute = s.body !== "fem";
    if (s.hair) {
      const long = s.hairStyle === "long" || s.hairStyle === "ponytail";
      px(0, 0, 64, 10, s.hair);                       // crown
      px(0, 0, 18, long ? 30 : 20, s.hair);            // back of the head
      px(46, 0, 18, long ? 30 : 20, s.hair);
      if (!brute) {
        px(18, 8, 6, long ? 18 : 8, s.hair);           // side locks framing the face
        px(40, 8, 6, long ? 18 : 8, s.hair);
        for (let x = 22; x < 42; x += 3) px(x, 9, 2, 2 + ((x * 7) % 3), s.hair); // bangs
      }
      ctx.fillStyle = "rgba(255,255,255,0.18)";        // sheen
      ctx.fillRect(26, 3, 12, 1);
    }
    const eye = s.eye;
    if (brute) {
      px(25, 12, 6, 2, "rgba(0,0,0,0.55)"); px(33, 12, 6, 2, "rgba(0,0,0,0.55)"); // heavy brow
      px(26, 14, 4, 2, eye); px(34, 14, 4, 2, eye);
      px(31, 17, 2, 2, "rgba(0,0,0,0.25)");           // nose
      px(27, 21, 10, 1, "#2a0a0a");                    // grim mouth
      px(28, 22, 1, 2, "#f4ecd8"); px(35, 22, 1, 2, "#f4ecd8"); // fangs
    } else {
      px(25, 12, 5, 1, "rgba(30,10,10,0.7)"); px(34, 12, 5, 1, "rgba(30,10,10,0.7)"); // brows
      px(25, 14, 5, 1, "#1a0a10"); px(34, 14, 5, 1, "#1a0a10");                         // lash line
      px(26, 15, 3, 2, "#ffffff"); px(35, 15, 3, 2, "#ffffff");
      px(27, 15, 2, 2, eye); px(35, 15, 2, 2, eye);
      px(32, 18, 1, 2, "rgba(0,0,0,0.18)");                                            // nose
      px(30, 21, 5, 1, s.lips || "#b05060"); px(31, 22, 3, 1, s.lips || "#b05060");      // lips
      px(23, 19, 2, 1, "rgba(255,120,140,0.35)"); px(40, 19, 2, 1, "rgba(255,120,140,0.35)");
    }
  }, false);
  HEAD_CACHE.set(key, tex);
  return tex;
}

// Tapered limb segment hanging down from its joint (top at y = 0).
const limbGeo = (len, r0, r1) => cachedGeo(`limb${len},${r0},${r1}`, () => {
  const g = new THREE.CylinderGeometry(r0, r1, len, 7, 1);
  g.translate(0, -len / 2, 0);
  return g;
});

// Lathe from [radius, y] points, squashed into an oval (sx wide, sz deep).
// `bust` pushes the front out a little around y = at (fem torsos).
function latheGeo(key, pts, sx, sz, opts = {}) {
  return cachedGeo("lathe" + key, () => {
    const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 8);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i) * sx, y = pos.getY(i), z = pos.getZ(i) * sz;
      if (opts.bust && z > 0) z *= 1 + opts.bust * Math.max(0, 1 - Math.abs(y - opts.bustY) / 0.09);
      if (opts.seat && z < 0) z *= 1 + opts.seat * Math.max(0, 1 - Math.abs(y - opts.seatY) / 0.08);
      pos.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    return g;
  });
}

// y -> lathe v (0 at the first point, 1 at the last), for painting bands.
function latheV(pts, y) {
  for (let j = 0; j < pts.length - 1; j++) {
    const a = pts[j][1], b = pts[j + 1][1];
    if (y <= b) return (j + clamp((y - a) / (b - a), 0, 1)) / (pts.length - 1);
  }
  return 1;
}

class CharacterModel {
  constructor(type) {
    this.type = type;
    this.mats = [];
    this.root = new THREE.Group();
    this.body = new THREE.Group(); // pivot at hips so rolls spin around the centre of mass
    this.body.position.y = 0.9;
    this.root.add(this.body);
    this.time = rand(0, 10);

    const spec = CHARACTER_SPECS[type];
    this.spec = spec;
    this.plan = BODY_PLANS[spec.body];
    this.build(spec, this.plan);
    this.root.scale.setScalar(spec.scale || 1);
  }

  mat(opts) {
    const m = ps1Material(opts);
    this.mats.push(m);
    return m;
  }

  part(geo, mat, x, y, z, parent = this.body) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y - 0.9, z); // author in "feet at 0" space, stored relative to hip pivot
    parent.add(mesh);
    return mesh;
  }

  // A pivot group at a joint (feet-space coordinates).
  joint(x, y, z, parent = this.body) {
    const g = new THREE.Group();
    g.position.set(x, parent === this.body ? y - 0.9 : y, z);
    parent.add(g);
    return g;
  }

  build(s, P) {
    const skin = s.skin;
    const top = s.top || skin, bottom = s.bottom || skin, trim = s.trim || top;

    // ---- Torso: outfit painted in bands from the hips up. ----
    const T = P.torso;
    const v = (y) => 1 - latheV(T, y); // texture rows are top-down
    const bands = [];
    if (s.body === "brute" && !s.top) {
      bands.push([0, v(P.waistY - 0.02), skin, "abs"]);
    } else {
      bands.push([0, v(P.chestY[1] + 0.04), skin]);                        // shoulders/collar
      bands.push([v(P.chestY[1] + 0.04), v(P.chestY[1]), trim]);
      bands.push([v(P.chestY[1]), v(P.chestY[0]), top, s.midriff ? "lace" : null]);
      if (s.midriff) {
        bands.push([v(P.chestY[0]), v(P.waistY - 0.02), skin]);
      } else {
        bands.push([v(P.chestY[0]), v(P.waistY - 0.02), top]);
      }
    }
    bands.push([v(P.waistY - 0.02), v(P.waistY - 0.06), trim]);             // belt
    bands.push([v(P.waistY - 0.06), 1, bottom]);
    const torsoMat = this.mat({ map: bandTexture(bands) });
    const fem = s.body === "fem";
    this.part(latheGeo(s.body + "Torso", T, P.sx, P.sz, fem ? { bust: 0.32, bustY: 1.37, seat: 0.12, seatY: 1.0 } : {}),
      torsoMat, 0, 0, 0);

    // ---- Neck + head ----
    const skinMat = this.mat({ map: solidTexture(skin) });
    this.part(limbGeo(0.12, P.neck * 0.9, P.neck), skinMat, 0, P.headY - P.head * 0.6, -0.005);
    this.head = this.joint(0, P.headY, 0);
    const headGeo = cachedGeo("head" + P.head, () => {
      const g = new THREE.SphereGeometry(P.head, 10, 8);
      g.rotateY(-Math.PI / 2); // u = 0.5 (the painted face) to +Z
      return g;
    });
    const headMesh = new THREE.Mesh(headGeo, this.mat({ map: headTexture(s) }));
    headMesh.scale.set(fem ? 0.9 : 1, 1.12, 1);
    this.head.add(headMesh);
    this.buildHair(s, P);
    this.buildHeadExtras(s, P);

    // ---- Legs (or a gown) ----
    if (s.gown) {
      const gownPts = [[P.torso[3][0] * 0.95, P.waistY], [0.2, 0.95], [0.27, 0.6], [0.34, 0.25], [0.36, 0.18]];
      const gownTex = bandTexture([[0, 0.12, trim], [0.12, 0.9, s.gown], [0.9, 1, trim]]);
      this.part(latheGeo("gown" + s.body, gownPts.slice().reverse(), P.sx, P.sz + 0.1),
        this.mat({ map: gownTex, doubleSide: true }), 0, 0, 0);
    } else {
      const thighTex = bandTexture(s.thighBoots
        ? [[0, 0.2, bottom], [0.2, 0.62, skin], [0.62, 0.68, trim], [0.68, 1, s.boots]]
        : s.body === "brute" ? [[0, 1, bottom]]
        : [[0, 0.2, bottom], [0.2, 1, s.skirt ? skin : (s.bottom || skin)]], 8, 16);
      const calfTex = bandTexture(s.boots ? [[0, 1, s.boots], [0.9, 1, trim]] : [[0, 1, skin]], 8, 16);
      const thighMat = this.mat({ map: thighTex }), calfMat = this.mat({ map: calfTex });
      const footMat = this.mat({ map: solidTexture(s.boots || skin) });
      [this.legL, this.calfL] = this.limb2(P.legX, P.hipY, P.thigh, P.calf, thighMat, calfMat, footMat, "foot");
      [this.legR, this.calfR] = this.limb2(-P.legX, P.hipY, P.thigh, P.calf, thighMat, calfMat, footMat, "foot");
    }
    if (s.skirt) {
      const skirtPts = [[0.33, 0.8], [0.27, 0.92], [0.215, 1.02], [0.2, 1.08]];
      this.part(latheGeo("skirt", skirtPts, P.sx, P.sz + 0.12),
        this.mat({ map: bandTexture([[0, 0.8, s.skirt, "feather"], [0.8, 1, trim]]), doubleSide: true }), 0, 0, 0);
    }

    // ---- Arms ----
    const upperTex = bandTexture([[0, 1, skin]], 8, 16);
    const foreTex = bandTexture(s.gloves ? [[0, 0.3, skin], [0.3, 0.38, trim], [0.38, 1, s.gloves]]
      : s === CHARACTER_SPECS.player ? [[0, 0.45, skin], [0.45, 0.85, trim], [0.85, 1, skin]] : [[0, 1, skin]], 8, 16);
    const upperMat = this.mat({ map: upperTex }), foreMat = this.mat({ map: foreTex });
    const handMat = this.mat({ map: solidTexture(s.gloves || skin) });
    [this.armL, this.foreL, this.handL] = this.limb2(P.shoulderX, P.shoulderY, P.upper, P.fore, upperMat, foreMat, handMat, "hand");
    [this.armR, this.foreR, this.handR] = this.limb2(-P.shoulderX, P.shoulderY, P.upper, P.fore, upperMat, foreMat, handMat, "hand");
    // Shoulder caps round off the joint.
    const capGeo = cachedGeo("cap" + P.upper[1], () => new THREE.SphereGeometry(P.upper[1] * 1.15, 6, 4));
    this.part(capGeo, s.body === "brute" && !s.top ? skinMat : upperMat, P.shoulderX, P.shoulderY - 0.01, 0);
    this.part(capGeo, s.body === "brute" && !s.top ? skinMat : upperMat, -P.shoulderX, P.shoulderY - 0.01, 0);

    if (s.wings === "feather") this.buildFeatherWings(P);
    else if (s.wings === "bat") this.buildBatWings(s, P);
    if (s.tail) this.buildTail(s, P);
    if (s.tails) this.buildFoxTails(s, P);

    if (s.satchel) {
      const pack = this.mat({ map: bandTexture([[0, 0.25, "#c89a4a"], [0.25, 1, "#8a5a2a"]], 8, 8) });
      this.backpack = this.part(box(0.1, 0.16, 0.2), pack, P.torso[2][0] * P.sx + 0.04, 0.95, -0.02);
      this.backpackSlots = PLAYER.backpackSlots;
    }

    this.buildWeapon(s.weapon);
    this.holdsGun = ["pistol", "longRifle"].includes(s.weapon);
  }

  // Two-segment limb: [upper pivot, lower pivot, end] with the end a foot
  // (pointing forward) or a hand.
  limb2(x, y, upper, lower, upperMat, lowerMat, endMat, end) {
    const top = this.joint(x, y, 0);
    top.add(new THREE.Mesh(limbGeo(upper[0], upper[1], upper[2]), upperMat));
    const knee = this.joint(0, -upper[0], 0, top);
    knee.add(new THREE.Mesh(limbGeo(lower[0], lower[1], lower[2]), lowerMat));
    let tip;
    if (end === "foot") {
      tip = new THREE.Mesh(box(lower[2] * 2.1, 0.07, lower[2] * 4.2), endMat);
      tip.position.set(0, -lower[0] - 0.01, lower[2] * 1.1);
    } else {
      tip = new THREE.Mesh(box(lower[2] * 1.9, lower[2] * 3, lower[2] * 1.3), endMat);
      tip.position.set(0, -lower[0] - lower[2] * 1.4, 0);
    }
    knee.add(tip);
    return [top, knee, tip];
  }

  buildHair(s, P) {
    if (!s.hair) return;
    const hairMat = this.mat({ map: solidTexture(s.hair) });
    const r = P.head;
    // Volume on top and behind; the face pokes out the front.
    const cap = new THREE.Mesh(cachedGeo("hairCap" + r, () => new THREE.SphereGeometry(r * 1.1, 9, 6, 0, Math.PI * 2, 0, Math.PI * 0.58)), hairMat);
    cap.position.set(0, r * 0.12, -r * 0.18);
    cap.scale.set(s.body === "fem" ? 0.95 : 1.05, 1.05, 1.05);
    this.head.add(cap);
    if (s.hairStyle === "long") {
      // A curtain of hair down the back, swaying a little (see update()).
      this.hairBack = new THREE.Group();
      this.hairBack.position.set(0, r * 0.4, -r * 0.55);
      const lock = new THREE.Mesh(cachedGeo("hairLong" + r, () => {
        const g = new THREE.BoxGeometry(r * 2.1, r * 4.2, r * 0.5, 1, 3, 1);
        g.translate(0, -r * 2.1, 0);
        const pos = g.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const t = -pos.getY(i) / (r * 4.2);           // 0 top -> 1 bottom
          pos.setX(i, pos.getX(i) * (1 - t * 0.35));      // taper to the tips
        }
        return g;
      }), hairMat);
      this.hairBack.add(lock);
      this.head.add(this.hairBack);
    } else if (s.hairStyle === "ponytail") {
      this.hairBack = new THREE.Group();
      this.hairBack.position.set(0, r * 0.7, -r * 0.85);
      this.hairBack.rotation.x = 0.5;
      this.hairBack.add(new THREE.Mesh(limbGeo(r * 3.2, r * 0.32, r * 0.12), hairMat));
      this.head.add(this.hairBack);
    } else if (s.hairStyle === "wild") {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const spike = new THREE.Mesh(cone(r * 0.3, r * 0.9, 4), hairMat);
        spike.position.set(Math.cos(a) * r * 0.55, r * 0.75, Math.sin(a) * r * 0.55 - r * 0.2);
        spike.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
        this.head.add(spike);
      }
    }
  }

  buildHeadExtras(s, P) {
    const r = P.head;
    if (s.hood) {
      const hood = this.mat({ map: solidTexture(s.hood), doubleSide: true });
      const h = new THREE.Mesh(cachedGeo("hood" + r, () => new THREE.SphereGeometry(r * 1.35, 8, 6, Math.PI * 0.15, Math.PI * 1.7, 0, Math.PI * 0.7)), hood);
      h.rotation.y = Math.PI / 2; // turn the opening (at -X) to face forward
      h.position.set(0, r * 0.1, -r * 0.1);
      this.head.add(h);
      this.part(latheGeo("mantle", [[0.27, 1.38], [0.2, 1.52], [0.1, 1.66]], P.sx, P.sz), hood, 0, 0, 0);
    }
    if (s.horns) {
      // Curved horns: a base cone and a tip cone swept back.
      const horn = this.mat({ map: bandTexture([[0, 0.4, "#ffffff"], [0.4, 1, s.horns]], 8, 8) });
      const k = s.bigHorns ? 1.8 : 1;
      for (const side of [-1, 1]) {
        const base = new THREE.Group();
        base.position.set(side * r * 0.55, r * 0.7, r * 0.15);
        base.rotation.set(-0.5, 0, -side * 0.55);
        const seg1 = new THREE.Mesh(cone(0.035 * k, 0.13 * k, 5), horn);
        seg1.position.y = 0.06 * k;
        const tip = new THREE.Group();
        tip.position.y = 0.11 * k;
        tip.rotation.x = -0.7;
        const seg2 = new THREE.Mesh(cone(0.022 * k, 0.12 * k, 5), horn);
        seg2.position.y = 0.05 * k;
        tip.add(seg2);
        base.add(seg1, tip);
        this.head.add(base);
      }
    }
    if (s.foxEars) {
      const ear = this.mat({ map: bandTexture([[0, 0.3, "#ff9bd6"], [0.3, 1, s.hair]], 8, 8) });
      for (const side of [-1, 1]) {
        const e = new THREE.Mesh(cone(r * 0.32, r * 0.9, 4), ear);
        e.position.set(side * r * 0.55, r * 1.05, -r * 0.1);
        e.rotation.z = -side * 0.25;
        this.head.add(e);
      }
    }
    if (s.ears) {
      const ear = this.mat({ map: solidTexture(s.skin) });
      for (const side of [-1, 1]) {
        const e = new THREE.Mesh(cone(r * 0.22, r * 0.9, 4), ear);
        e.position.set(side * r * 1.05, r * 0.15, 0);
        e.rotation.z = -side * 1.2;
        this.head.add(e);
      }
    }
    if (s.halo) {
      const halo = new THREE.Mesh(
        cachedGeo("haloRing", () => new THREE.TorusGeometry(0.15, 0.018, 4, 14)),
        this.mat({ color: s.halo === "gold" ? "#fff0a0" : "#ff2a5a", unlit: true })
      );
      halo.rotation.x = Math.PI / 2 - 0.25;
      halo.position.set(0, r * 1.75, -r * 0.2);
      this.head.add(halo);
      this.halo = halo;
    }
  }

  // Angel wings: a feathered silhouette (high arch, long pointed primaries
  // sweeping down) in two layers, white with gold along the top edge.
  buildFeatherWings(P) {
    const outer = this.mat({ map: TEX.featherWing, doubleSide: true });
    const inner = this.mat({ map: TEX.featherWing, doubleSide: true, color: "#fff4dc" });
    const wingGeo = (key, pts, k) => cachedGeo(key, () => {
      const sh = new THREE.Shape();
      sh.moveTo(pts[0][0] * k, pts[0][1] * k);
      for (const [x, y] of pts.slice(1)) sh.lineTo(x * k, y * k);
      const g = new THREE.ShapeGeometry(sh);
      // UVs follow the shape (ShapeGeometry uses raw x/y): scale to taste.
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.4, uv.getY(i) * 1.4 + 0.5);
      return g;
    });
    const main = wingGeo("angelWing", [
      [0, 0], [0.1, 0.28], [0.3, 0.5], [0.55, 0.52], [0.78, 0.36], [0.86, 0.1],
      [0.74, 0.0], [0.8, -0.32], [0.64, -0.24], [0.66, -0.62], [0.52, -0.48], [0.5, -0.86],
      [0.38, -0.66], [0.32, -1.0], [0.22, -0.7], [0.12, -0.86], [0.06, -0.4], [0, 0],
    ], 1.0);
    const covert = wingGeo("angelCovert", [
      [0, 0], [0.12, 0.24], [0.32, 0.4], [0.56, 0.4], [0.7, 0.24], [0.62, 0.08], [0.6, -0.14],
      [0.46, -0.06], [0.42, -0.3], [0.3, -0.16], [0.22, -0.38], [0.12, -0.18], [0, 0],
    ], 1.0);
    this.wings = [-1, 1].map((side) => {
      const pivot = this.joint(side * 0.06, P.shoulderY - 0.06, -0.14);
      const a = new THREE.Mesh(main, outer);
      a.scale.set(side, 1, 1);
      const c = new THREE.Mesh(covert, inner);
      c.scale.set(side, 1, 1);
      c.position.z = 0.012;
      pivot.add(a, c);
      return { pivot, side, kind: "feather" };
    });
  }

  // Demon wings: a scalloped membrane on a flapping pivot.
  buildBatWings(s, P) {
    const mat = this.mat({ map: bandTexture([[0, 0.1, "#0a0204"], [0.1, 1, s.wingColor || "#3a0a14"]], 8, 8), doubleSide: true });
    const geo = cachedGeo("batWingShape", () => {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0);
      sh.lineTo(0.22, 0.32);
      sh.lineTo(0.7, 0.46);
      sh.lineTo(0.6, 0.12);
      sh.lineTo(0.68, -0.18);
      sh.lineTo(0.44, -0.08);
      sh.lineTo(0.36, -0.34);
      sh.lineTo(0.2, -0.14);
      sh.lineTo(0.05, -0.24);
      sh.lineTo(0, 0);
      return new THREE.ShapeGeometry(sh);
    });
    this.wings = [-1, 1].map((side) => {
      const pivot = this.joint(side * 0.07, P.shoulderY - 0.06, -0.12 * (P.sz / 0.72));
      const m = new THREE.Mesh(geo, mat);
      m.scale.set(side, 1, 1);
      pivot.add(m);
      return { pivot, side, kind: "bat" };
    });
  }

  // Spade-tipped demon tail: three segments that sway.
  buildTail(s, P) {
    const mat = this.mat({ map: solidTexture(s.skin) });
    const tipMat = this.mat({ map: solidTexture(s.trim || "#1a0a0a") });
    const root = this.joint(0, P.hipY + 0.02, -P.torso[2][0] * P.sz);
    this.tail = [];
    let parent = root;
    for (let i = 0; i < 3; i++) {
      const seg = new THREE.Group();
      if (i > 0) seg.position.y = -0.22;
      seg.add(new THREE.Mesh(limbGeo(0.22, 0.022 - i * 0.004, 0.018 - i * 0.004), mat));
      parent.add(seg);
      this.tail.push(seg);
      parent = seg;
    }
    const spade = new THREE.Mesh(cachedGeo("spade", () => new THREE.OctahedronGeometry(0.055, 0)), tipMat);
    spade.scale.set(1, 1.5, 0.3);
    spade.position.y = -0.27;
    parent.add(spade);
  }

  buildFoxTails(s, P) {
    this.tails = [];
    const tailMat = this.mat({ map: bandTexture([[0, 0.8, "#ffffff"], [0.8, 1, "#ff9bd6"]], 8, 8) });
    const tailGeo = cachedGeo("foxTail", () => new THREE.SphereGeometry(0.16, 6, 4));
    for (let i = 0; i < s.tails; i++) {
      const pivot = this.joint(0, P.hipY, -0.15);
      const t = (i / (s.tails - 1)) - 0.5;
      pivot.rotation.set(-0.9, t * 2.2, 0);
      const tail = new THREE.Mesh(tailGeo, tailMat);
      tail.scale.set(1, 1, 3.4);
      tail.position.z = -0.5;
      pivot.add(tail);
      this.tails.push(pivot);
    }
  }

  // Enemy weapons sit in the right hand and follow the arm.
  buildWeapon(kind) {
    if (!kind) return;
    const metal = this.mat({ map: solidTexture("#2a2a30") });
    const g = new THREE.Group();
    if (kind === "longRifle") {
      const wood = this.mat({ map: TEX.wood });
      const stock = new THREE.Mesh(box(0.07, 0.11, 0.6), wood);
      stock.position.z = -0.05;
      const barrel = new THREE.Mesh(box(0.04, 0.04, 0.8), metal);
      barrel.position.set(0, 0.03, 0.55);
      g.add(stock, barrel);
    } else if (kind === "pistol") {
      const p = new THREE.Mesh(box(0.05, 0.09, 0.26), metal);
      p.position.z = 0.08;
      g.add(p);
    } else if (kind === "sickle") {
      // Curved demon blade.
      const glow = this.mat({ color: "#ff3a4a", unlit: true });
      const handle = new THREE.Mesh(box(0.04, 0.04, 0.22), metal);
      g.add(handle);
      for (let i = 0; i < 4; i++) {
        const b = new THREE.Mesh(box(0.025, 0.06, 0.12), i === 3 ? glow : metal);
        const a = 0.3 + i * 0.4;
        b.position.set(0, Math.sin(a) * 0.16, 0.12 + Math.cos(a) * 0.12);
        b.rotation.x = -a;
        g.add(b);
      }
    } else if (kind === "club" || kind === "bigClub") {
      const wood = this.mat({ map: TEX.wood });
      const c = new THREE.Mesh(box(0.12, 0.12, kind === "bigClub" ? 0.9 : 0.6), wood);
      c.position.z = kind === "bigClub" ? 0.4 : 0.28;
      g.add(c);
      const studs = this.mat({ map: solidTexture("#8a8a90") });
      for (let i = 0; i < 3; i++) {
        const stud = new THREE.Mesh(box(0.15, 0.03, 0.03), studs);
        stud.position.z = (kind === "bigClub" ? 0.55 : 0.38) + i * 0.1;
        g.add(stud);
      }
    }
    // In the hand: the hand points down its forearm (-Y), so turn +Z (the
    // weapon's forward) to point the same way for guns; blades stay forward.
    const guns = kind === "pistol" || kind === "longRifle";
    g.position.copy(this.handR.position);
    if (guns) g.rotation.x = Math.PI / 2;
    this.foreR.add(g);
    this.weapon = g;
    if (!guns) this.club = g;
  }

  // Tints the body and any worn armor (weapons keep their own glow).
  flash(amount, color = "#ffffff") {
    for (const m of this.mats.concat(this.gearMats || [])) {
      m.uniforms.flash.value = amount;
      m.uniforms.flashColor.value.set(color);
    }
  }

  // The satchel visibly swells as backpack upgrades add slots.
  setBackpackSize(slots) {
    if (!this.backpack || slots === this.backpackSlots) return;
    this.backpackSlots = slots;
    const k = 1 + (slots - PLAYER.backpackSlots) * 0.05;
    this.backpack.scale.set(k, k, k);
  }

  // state: { moving, sprinting, airborne, rollProgress (0 = not rolling, 0..1 during a roll) }
  update(dt, state) {
    this.time += dt;
    const t = this.time;
    const s = this.spec;

    // Walk amount blends in/out, and the stride phase only advances while
    // walking, so starting/stopping never pops the legs.
    const striding = state.moving && !state.airborne;
    this.walkAmt = lerp(this.walkAmt || 0, striding ? (state.sprinting ? 1.3 : 1) : 0, 1 - Math.exp(-10 * dt));
    this.phase = (this.phase || 0) + dt * (state.sprinting ? 14 : 10) * Math.min(1, this.walkAmt);
    const w = this.walkAmt;
    const walk = Math.sin(this.phase) * w;

    // Roll: a tucked forward somersault. A jump tucks the knees part-way.
    const u = state.rollProgress || 0;
    const rolling = u > 0;
    const tuck = rolling ? Math.sin(Math.PI * u) : state.airborne ? 0.5 : 0;
    this.tuckAmt = lerp(this.tuckAmt || 0, tuck, rolling ? 1 : 1 - Math.exp(-18 * dt));
    const k = this.tuckAmt;

    if (this.legL) {
      if (s.floating) {
        // Dangling legs, gently kicking.
        this.legL.rotation.x = -0.35 + Math.sin(t * 2) * 0.1;
        this.legR.rotation.x = -0.2 + Math.sin(t * 2 + 1) * 0.1;
        this.calfL.rotation.x = 0.7;
        this.calfR.rotation.x = 0.55;
      } else {
        this.legL.rotation.x = walk * 0.65 * (1 - k) - 1.45 * k;
        this.legR.rotation.x = -walk * 0.65 * (1 - k) - 1.45 * k;
        // Knees bend on the back-swing (and fold right up in a tuck).
        this.calfL.rotation.x = Math.max(0, Math.sin(this.phase - 1.1)) * 1.0 * w * (1 - k) + 2.1 * k + 0.05;
        this.calfR.rotation.x = Math.max(0, Math.sin(this.phase + Math.PI - 1.1)) * 1.0 * w * (1 - k) + 2.1 * k + 0.05;
      }
    }

    if (this.holdsGun) {
      // Both hands up on the weapon, pulled in while tucked.
      // (armR sits at -X, armL at +X: positive Z swings armR inward, negative armL.)
      this.armR.rotation.set(-1.4 - 0.4 * k, 0, 0.12);
      this.foreR.rotation.set(-0.15, 0, 0);
      this.armL.rotation.set(-1.15 - 0.4 * k, 0, -0.55);
      this.foreL.rotation.set(-0.55, 0, 0);
    } else if (this.club) {
      this.armL.rotation.set(-walk * 0.5, 0, 0.12);
      this.foreL.rotation.set(-0.3, 0, 0);
      this.armR.rotation.set(-0.5 + Math.sin(t * 6) * 0.55, 0, -0.1);
      this.foreR.rotation.set(-0.5, 0, 0);
    } else {
      this.armL.rotation.set(-walk * 0.55 - 0.9 * k, 0, 0.1 + (s.floating ? 0.25 : 0));
      this.armR.rotation.set(walk * 0.55 - 0.9 * k, 0, -0.1 - (s.floating ? 0.25 : 0));
      this.foreL.rotation.set(-0.25 - Math.max(0, walk) * 0.4 - 1.2 * k, 0, 0);
      this.foreR.rotation.set(-0.25 - Math.max(0, -walk) * 0.4 - 1.2 * k, 0, 0);
    }

    let bodyY = 0.9 + Math.abs(walk) * 0.04 - 0.35 * k;
    if (s.floating) bodyY += 0.35 + Math.sin(t * 2.5) * 0.15;
    if (s.hover) bodyY += s.hover + Math.sin(t * 1.8) * 0.2;
    this.body.position.y = bodyY;

    const eased = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; // easeInOutQuad
    this.body.rotation.x = rolling ? eased * Math.PI * 2 : 0;
    this.body.rotation.y = walk * 0.06; // hips/shoulders counter-swing
    this.body.scale.y = 1 - 0.2 * k;
    this.head.rotation.x = Math.sin(t * 1.3) * 0.03;

    if (this.hairBack) this.hairBack.rotation.x = (s.hairStyle === "ponytail" ? 0.5 : 0.08) + Math.sin(this.phase) * 0.06 * w + k * 0.4;

    if (this.wings) {
      for (const { pivot, side, kind } of this.wings) {
        if (kind === "feather") {
          // Folded back at rest; spread and beat in the air.
          const open = state.airborne || rolling ? 1 : 0;
          this.wingOpen = lerp(this.wingOpen || 0, open, 1 - Math.exp(-8 * dt));
          const o = this.wingOpen;
          const beat = Math.sin(t * (o > 0.5 ? 9 : 1.6)) * (0.06 + 0.3 * o);
          pivot.rotation.set(0.12 * (1 - o), side * (1.05 - 0.75 * o), side * beat);
        } else {
          const flap = Math.sin(t * (s.floating ? 11 : 4)) * (s.floating ? 0.6 : 0.25);
          pivot.rotation.set(0.1, side * 0.55, side * flap);
        }
      }
    }
    if (this.tail) {
      this.tail.forEach((seg, i) => {
        // Out behind and slightly down, then curling up toward the spade.
        seg.rotation.set(i === 0 ? 1.3 : 0.45, Math.sin(t * 2.4 + i * 0.9) * 0.35, 0);
      });
    }
    if (this.halo) this.halo.rotation.z = t * 1.5;
    if (this.tails) {
      this.tails.forEach((p, i) => { p.rotation.x = -0.9 + Math.sin(t * 2 + i) * 0.2; });
    }
  }

  dispose() {
    for (const m of this.mats) m.dispose();
  }
}

// ---------------------------------------------------------------------------
// Ryujin Dragon — a floating serpent. The head is the model root; body
// segments live in a separate world-space group and trail the head's path.
// ---------------------------------------------------------------------------

class DragonModel {
  constructor() {
    this.type = "boss_dragon";
    this.mats = [];
    this.time = 0;
    this.root = new THREE.Group();
    this.trailGroup = new THREE.Group();
    this.history = [];

    const scale = this.mat({ map: solidTexture("#1f8a7e") });
    const belly = this.mat({ map: solidTexture("#d9e8b0") });
    const horn = this.mat({ map: solidTexture("#e8f2ee") });
    const eye = this.mat({ color: "#ffea3b", unlit: true });
    const fin = this.mat({ map: solidTexture("#e0702a") });

    const head = new THREE.Group();
    head.position.y = 2.6;
    const skull = new THREE.Mesh(box(1.3, 0.9, 1.5), scale);
    const snout = new THREE.Mesh(box(0.9, 0.5, 0.9), scale);
    snout.position.set(0, -0.15, 1.1);
    const jaw = new THREE.Mesh(box(0.85, 0.2, 1.2), belly);
    jaw.position.set(0, -0.5, 0.8);
    const eyeL = new THREE.Mesh(box(0.2, 0.14, 0.1), eye);
    eyeL.position.set(-0.4, 0.15, 0.76);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.4;
    const hornL = new THREE.Mesh(cone(0.12, 1.0, 4), horn);
    hornL.position.set(-0.4, 0.7, -0.5);
    hornL.rotation.x = -0.9;
    const hornR = hornL.clone();
    hornR.position.x = 0.4;
    head.add(skull, snout, jaw, eyeL, eyeR, hornL, hornR);
    this.root.add(head);
    this.head = head;

    this.segments = [];
    const segGeo = cachedGeo("dragonSeg", () => jitterGeometry(new THREE.IcosahedronGeometry(0.75, 0), 0.08, 3));
    for (let i = 0; i < 12; i++) {
      const seg = new THREE.Group();
      const ball = new THREE.Mesh(segGeo, scale);
      const s = 1 - i * 0.055;
      ball.scale.setScalar(s);
      const spike = new THREE.Mesh(cone(0.18, 0.6, 3), fin);
      spike.position.y = 0.75 * s;
      seg.add(ball, spike);
      this.trailGroup.add(seg);
      this.segments.push(seg);
    }
  }

  mat(opts) {
    const m = ps1Material(opts);
    this.mats.push(m);
    return m;
  }

  flash(amount, color = "#ffffff") {
    for (const m of this.mats) {
      m.uniforms.flash.value = amount;
      m.uniforms.flashColor.value.set(color);
    }
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    this.head.position.y = 2.6 + Math.sin(t * 2) * 0.4;

    const p = this.root.position;
    const last = this.history[0];
    if (!last || Math.hypot(last.x - p.x, last.z - p.z) > 0.25) {
      this.history.unshift({ x: p.x, z: p.z, y: p.y });
      if (this.history.length > 80) this.history.pop();
    }
    this.segments.forEach((seg, i) => {
      const h = this.history[Math.min(this.history.length - 1, (i + 1) * 4)] || { x: p.x, z: p.z, y: p.y };
      seg.position.set(h.x, h.y + 2.3 + Math.sin(t * 3 - i * 0.6) * 0.5, h.z);
    });
  }

  dispose() {
    for (const m of this.mats) m.dispose();
  }
}

// ---------------------------------------------------------------------------
// Non-humanoid stage creatures: bat, wisp, slime, crystal golem, fire
// elemental. Same interface as CharacterModel (root, mats, update, flash).
// ---------------------------------------------------------------------------

const CREATURE_TYPES = new Set(["bat", "wisp", "slime", "slime_small", "golem", "elemental"]);

class CreatureModel {
  constructor(type) {
    this.type = type;
    this.mats = [];
    this.time = rand(0, 10);
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.anim = [];
    this["build_" + (type === "slime_small" ? "slime" : type)]();
    if (type === "slime_small") this.root.scale.setScalar(0.62);
  }

  mat(opts) {
    const m = ps1Material(opts);
    this.mats.push(m);
    return m;
  }

  add(geo, mat, x, y, z, parent = this.body) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  build_bat() {
    const fur = this.mat({ map: solidTexture("#3a1420") });
    const bone = this.mat({ map: solidTexture("#e8d8c0") });
    const eye = this.mat({ color: "#ff3a3a", unlit: true });
    this.body.position.y = 1.5;
    this.add(cachedGeo("batBody", () => new THREE.SphereGeometry(0.28, 6, 5)), fur, 0, 0, 0);
    this.add(cone(0.05, 0.22, 4), bone, -0.13, 0.3, 0).rotation.set(-0.4, 0, 0.3);
    this.add(cone(0.05, 0.22, 4), bone, 0.13, 0.3, 0).rotation.set(-0.4, 0, -0.3);
    this.add(box(0.07, 0.05, 0.04), eye, -0.09, 0.05, 0.25);
    this.add(box(0.07, 0.05, 0.04), eye, 0.09, 0.05, 0.25);
    const wing = this.mat({ map: solidTexture("#7a1a2a"), doubleSide: true });
    this.wings = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.x = side * 0.2;
      const w = this.add(cachedGeo("batWing", () => new THREE.BoxGeometry(0.8, 0.03, 0.42)), wing, side * 0.4, 0, 0, pivot);
      w.rotation.y = side * 0.2;
      this.body.add(pivot);
      return { pivot, side };
    });
  }

  build_wisp() {
    const core = this.mat({ color: "#ffd0f0", unlit: true });
    const flame = this.mat({ color: "#ff4aa8", unlit: true });
    const dark = this.mat({ color: "#3a0a2a", unlit: true });
    this.body.position.y = 1.3;
    this.add(cachedGeo("wispCore", () => new THREE.IcosahedronGeometry(0.32, 1)), core, 0, 0, 0);
    this.flame = this.add(cone(0.22, 0.55, 5), flame, 0, 0.35, -0.05);
    this.add(box(0.07, 0.1, 0.04), dark, -0.1, 0.03, 0.29);
    this.add(box(0.07, 0.1, 0.04), dark, 0.1, 0.03, 0.29);
  }

  build_slime() {
    this.gel = this.mat({ map: solidTexture("#a81a6a") });
    const eye = this.mat({ color: "#ffd23b", unlit: true });
    const shine = this.mat({ color: "#ffb0e0", unlit: true });
    this.blob = this.add(cachedGeo("slimeBody", () => jitterGeometry(new THREE.SphereGeometry(0.6, 8, 6), 0.05, 3)), this.gel, 0, 0.45, 0);
    this.blob.scale.set(1, 0.75, 1);
    this.add(box(0.1, 0.16, 0.05), eye, -0.18, 0.55, 0.52);
    this.add(box(0.1, 0.16, 0.05), eye, 0.18, 0.55, 0.52);
    this.add(box(0.12, 0.06, 0.05), shine, -0.25, 0.8, 0.38);
  }

  build_golem() {
    const stone = this.mat({ map: TEX.obsidian });
    const crystal = this.mat({ color: "#ff7a2a", unlit: true });
    this.add(box(1.2, 1.0, 0.8), stone, 0, 1.5, 0);
    this.add(box(0.55, 0.45, 0.5), stone, 0, 2.2, 0.1);
    this.add(box(0.12, 0.06, 0.04), crystal, -0.12, 2.24, 0.36);
    this.add(box(0.12, 0.06, 0.04), crystal, 0.12, 2.24, 0.36);
    this.arms = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.78, 1.85, 0);
      this.add(box(0.35, 1.0, 0.4), stone, 0, -0.5, 0, pivot);
      this.body.add(pivot);
      return pivot;
    });
    this.add(box(0.4, 0.6, 0.45), stone, -0.3, 0.45, 0);
    this.add(box(0.4, 0.6, 0.45), stone, 0.3, 0.45, 0);
    [[-0.35, 2.1], [0.2, 2.25], [0.45, 1.95]].forEach(([x, y]) => {
      const c = this.add(cachedGeo("crys", () => new THREE.OctahedronGeometry(0.2, 0)), crystal, x, y, -0.45);
      c.scale.set(0.7, 2, 0.7);
      c.rotation.x = -0.5;
    });
  }

  build_elemental() {
    const core = this.mat({ color: "#fff0a0", unlit: true });
    const fire = this.mat({ color: "#ff8a1a", unlit: true });
    const ember = this.mat({ color: "#ff3a0a", unlit: true });
    this.body.position.y = 1.3;
    this.add(cachedGeo("elemCore", () => new THREE.IcosahedronGeometry(0.4, 1)), core, 0, 0, 0);
    this.flames = new THREE.Group();
    this.body.add(this.flames);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const f = this.add(cone(0.2, 0.7, 4), i % 2 ? fire : ember, Math.cos(a) * 0.45, 0.1, Math.sin(a) * 0.45, this.flames);
      f.rotation.z = -Math.cos(a) * 0.4;
      f.rotation.x = Math.sin(a) * 0.4;
    }
    this.add(cone(0.3, 0.9, 5), fire, 0, 0.55, 0);
  }

  flash(amount, color = "#ffffff") {
    for (const m of this.mats) {
      m.uniforms.flash.value = amount;
      m.uniforms.flashColor.value.set(color);
    }
  }

  update(dt, state) {
    this.time += dt;
    const t = this.time;
    switch (this.type) {
      case "bat":
        this.body.position.y = 1.5 + Math.sin(t * 3) * 0.2;
        for (const { pivot, side } of this.wings) pivot.rotation.z = side * Math.sin(t * 18) * 0.8;
        break;
      case "wisp":
        this.body.position.y = 1.3 + Math.sin(t * 2.2) * 0.18;
        this.flame.scale.set(1, 1 + Math.sin(t * 15) * 0.25, 1);
        break;
      case "slime":
      case "slime_small": {
        // Squash on the ground, stretch in the air.
        const sy = state.airborne ? 1.0 : 0.72 + Math.sin(t * 6) * 0.05;
        this.blob.scale.set(state.airborne ? 0.85 : 1.08, sy, state.airborne ? 0.85 : 1.08);
        break;
      }
      case "golem":
        this.body.rotation.z = Math.sin(t * 2.2) * 0.04;
        this.arms.forEach((a, i) => { a.rotation.x = Math.sin(t * 2.2 + i * Math.PI) * 0.3; });
        break;
      case "elemental":
        this.body.position.y = 1.3 + Math.sin(t * 2.6) * 0.15;
        this.flames.rotation.y = t * 3;
        break;
    }
  }

  dispose() {
    for (const m of this.mats) m.dispose();
  }
}

function createModel(type) {
  if (type === "boss_dragon") return new DragonModel();
  if (CREATURE_TYPES.has(type)) return new CreatureModel(type);
  return new CharacterModel(type);
}

// ---------------------------------------------------------------------------
// Weapon meshes — boxy PS1 guns and blades. Forward is +Z, grip at origin.
// Every weapon gets unlit "accent" parts in its element colour so the
// element reads at a glance; mutated weapons pulse.
// ---------------------------------------------------------------------------

const cyl = (r, h, s = 6) => cachedGeo(`cy${r},${h},${s}`, () => {
  const g = new THREE.CylinderGeometry(r, r, h, s);
  g.rotateX(Math.PI / 2); // lie along +Z like a barrel
  return g;
});

function buildWeaponMesh(item) {
  const b = WEAPON_BASES[item.base];
  const el = elementOf(item.element);
  const mats = [];
  const M = (opts) => { const m = ps1Material(opts); mats.push(m); return m; };
  const gun = M({ map: solidTexture("#34343e") });
  const body = M({ map: solidTexture(item.element === "none" ? "#6a6a74" : el.armor) });
  const wood = M({ map: TEX.wood });
  const steel = M({ map: solidTexture("#d8dce0") });
  const accent = M({ color: el.color, unlit: true });
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    g.add(m);
    return m;
  };

  switch (item.base) {
    // Pistols
    case "service":
      add(box(0.11, 0.13, 0.42), body, 0, 0.07, 0.14); add(box(0.09, 0.22, 0.11), gun, 0, -0.08, -0.02, 0.3);
      add(box(0.12, 0.03, 0.28), accent, 0, 0.15, 0.14); break;
    case "cannon":
      add(box(0.15, 0.17, 0.5), body, 0, 0.08, 0.18); add(cyl(0.05, 0.2), gun, 0, 0.05, 0.5);
      add(box(0.1, 0.24, 0.12), wood, 0, -0.1, -0.02, 0.35); add(cyl(0.065, 0.05), accent, 0, 0.05, 0.43); break;
    case "twin":
      for (const x of [-0.11, 0.11]) {
        add(box(0.09, 0.12, 0.36), body, x, 0.06, 0.12); add(box(0.08, 0.18, 0.1), wood, x, -0.07, -0.02, 0.3);
        add(box(0.1, 0.03, 0.2), accent, x, 0.13, 0.12);
      }
      break;
    // Assault rifles
    case "kobra":
      add(box(0.12, 0.16, 0.75), body, 0, 0.05, 0.25); add(box(0.05, 0.05, 0.4), gun, 0, 0.06, 0.8);
      add(box(0.08, 0.24, 0.12), gun, 0, -0.14, 0.25, 0.2); add(box(0.1, 0.14, 0.3), gun, 0, 0, -0.25);
      add(box(0.13, 0.03, 0.4), accent, 0, 0.14, 0.25); break;
    case "burst":
      add(box(0.14, 0.18, 0.7), body, 0, 0.05, 0.22); add(box(0.06, 0.06, 0.35), gun, 0, 0.06, 0.74);
      add(box(0.08, 0.2, 0.1), accent, 0, -0.13, 0.15, 0.2); add(box(0.08, 0.2, 0.1), gun, 0, -0.13, 0.32, 0.2);
      add(box(0.1, 0.16, 0.32), gun, 0, 0, -0.26); break;
    case "dmr":
      add(box(0.11, 0.14, 0.8), body, 0, 0.05, 0.28); add(box(0.045, 0.045, 0.55), gun, 0, 0.06, 0.93);
      add(cyl(0.05, 0.3), gun, 0, 0.2, 0.28); add(cyl(0.035, 0.02), accent, 0, 0.2, 0.44);
      add(box(0.08, 0.2, 0.1), gun, 0, -0.12, 0.22, 0.2); add(box(0.1, 0.16, 0.3), wood, 0, 0, -0.27); break;
    // SMGs
    case "viper":
      add(box(0.12, 0.15, 0.5), body, 0, 0.05, 0.15); add(box(0.07, 0.34, 0.1), gun, 0, -0.18, 0.15);
      add(box(0.05, 0.05, 0.18), gun, 0, 0.06, 0.48); add(box(0.13, 0.03, 0.26), accent, 0, 0.14, 0.15); break;
    case "hornet":
      add(box(0.13, 0.18, 0.46), body, 0, 0.05, 0.14); add(box(0.08, 0.26, 0.1), gun, 0, -0.16, 0.1);
      add(cyl(0.05, 0.12), accent, 0, 0.18, 0.12); add(box(0.1, 0.12, 0.22), gun, 0, 0, -0.2); break;
    case "spray":
      add(box(0.12, 0.15, 0.4), body, 0, 0.05, 0.12); add(box(0.09, 0.4, 0.12), gun, 0, -0.2, 0.08);
      add(box(0.05, 0.05, 0.14), accent, 0, 0.06, 0.38); break;
    // Shotguns
    case "scatter":
      add(box(0.05, 0.05, 0.8), gun, -0.035, 0.08, 0.35); add(box(0.05, 0.05, 0.8), gun, 0.035, 0.08, 0.35);
      add(box(0.13, 0.1, 0.35), body, 0, 0.02, 0.05); add(box(0.1, 0.16, 0.34), wood, 0, -0.03, -0.3);
      add(box(0.14, 0.03, 0.12), accent, 0, 0.12, 0.7); break;
    case "slugger":
      add(cyl(0.06, 0.8), gun, 0, 0.08, 0.38); add(box(0.14, 0.12, 0.35), body, 0, 0.02, 0.02);
      add(box(0.11, 0.17, 0.34), wood, 0, -0.03, -0.32); add(cyl(0.075, 0.06), accent, 0, 0.08, 0.76); break;
    case "autoshot":
      add(box(0.13, 0.15, 0.7), body, 0, 0.05, 0.25); add(cyl(0.12, 0.12, 8), accent, 0, -0.1, 0.2);
      add(box(0.06, 0.06, 0.3), gun, 0, 0.08, 0.7); add(box(0.1, 0.15, 0.28), gun, 0, 0, -0.25); break;
    // Snipers
    case "longshot":
      add(box(0.1, 0.13, 0.9), body, 0, 0.05, 0.3); add(box(0.04, 0.04, 0.7), gun, 0, 0.06, 1.05);
      add(cyl(0.055, 0.4), gun, 0, 0.2, 0.3); add(cyl(0.04, 0.02), accent, 0, 0.2, 0.51);
      add(box(0.1, 0.17, 0.34), wood, 0, 0, -0.3); break;
    case "railgun":
      add(box(0.14, 0.16, 0.8), body, 0, 0.05, 0.25);
      add(box(0.03, 0.05, 1.1), accent, -0.06, 0.07, 0.9); add(box(0.03, 0.05, 1.1), accent, 0.06, 0.07, 0.9);
      add(box(0.1, 0.1, 0.1), gun, 0, 0.07, 1.45); add(box(0.1, 0.16, 0.3), gun, 0, 0, -0.25); break;
    case "needle":
      add(box(0.09, 0.12, 0.85), body, 0, 0.05, 0.3); add(box(0.03, 0.03, 0.6), accent, 0, 0.06, 0.95);
      add(box(0.02, 0.2, 0.02), accent, 0, 0.18, 0.1); add(box(0.02, 0.2, 0.02), accent, 0, 0.18, 0.3);
      add(box(0.09, 0.15, 0.3), gun, 0, 0, -0.26); break;
    // Melee (blade along +Z)
    case "katana":
      add(box(0.05, 0.05, 0.3), wood, 0, 0, -0.05); add(box(0.18, 0.04, 0.05), accent, 0, 0, 0.12);
      add(box(0.03, 0.09, 1.1), steel, 0, 0, 0.7); add(box(0.035, 0.02, 1.1), accent, 0, 0.05, 0.7); break;
    case "hammer":
      add(box(0.06, 0.06, 1.1), wood, 0, 0, 0.35); add(box(0.32, 0.3, 0.42), body, 0, 0, 0.95);
      add(box(0.34, 0.06, 0.44), accent, 0, 0.17, 0.95); break;
    case "scythe":
      add(box(0.05, 0.05, 1.5), wood, 0, 0, 0.55);
      add(box(0.04, 0.12, 0.55), steel, 0.25, 0, 1.25, 0, 1.2); add(box(0.04, 0.08, 0.3), steel, 0.52, 0, 1.08, 0, 0.6);
      add(box(0.045, 0.03, 0.55), accent, 0.25, 0.07, 1.25, 0, 1.2); break;
    // Throwing
    case "shuriken":
      add(box(0.44, 0.03, 0.1), steel, 0, 0, 0.2, 0, 0.785); add(box(0.44, 0.03, 0.1), steel, 0, 0, 0.2, 0, -0.785);
      add(box(0.1, 0.04, 0.1), accent, 0, 0, 0.2); break;
    case "kunai":
      add(box(0.05, 0.05, 0.2), wood, 0, 0, 0);
      add(cachedGeo("kunaiTip", () => new THREE.OctahedronGeometry(0.1, 0)), steel, 0, 0, 0.26).scale.set(0.6, 0.3, 2);
      add(cyl(0.05, 0.02), accent, 0, 0, -0.12); break;
    case "boomerang":
      add(box(0.05, 0.05, 0.6), wood, 0, 0, 0.15); add(box(0.04, 0.35, 0.3), steel, 0, 0.12, 0.42);
      add(box(0.045, 0.06, 0.32), accent, 0, 0.3, 0.42); break;
    // Launchers
    case "rocket":
      add(cyl(0.12, 1.2, 8), body, 0, 0.12, 0.25); add(cyl(0.13, 0.08, 8), accent, 0, 0.12, 0.86);
      add(box(0.08, 0.2, 0.1), gun, 0, -0.08, 0.1, 0.25); break;
    case "grenade":
      add(cyl(0.1, 0.7, 8), body, 0, 0.1, 0.25); add(cyl(0.16, 0.18, 8), accent, 0, 0.02, 0.05);
      add(box(0.08, 0.2, 0.1), wood, 0, -0.12, -0.12, 0.3); break;
    case "swarm":
      add(box(0.3, 0.26, 0.55), body, 0, 0.12, 0.2);
      for (const [x, y] of [[-0.07, 0.06], [0.07, 0.06], [-0.07, 0.18], [0.07, 0.18]]) add(cyl(0.04, 0.02), accent, x, y, 0.48);
      add(box(0.08, 0.2, 0.1), gun, 0, -0.1, 0.05, 0.25); break;
  }
  const s = b.cls === "melee" ? 1.25 : 1.7; // chunky so it reads at 320x180
  g.scale.setScalar(s * (item.mutations.includes("giant") ? 1.3 : 1));
  return { group: g, mats, accent, cls: b.cls, mutated: item.mutations.length > 0 };
}

// ---------------------------------------------------------------------------
// Armor visuals: each equipped piece gets a shell in its element's armor
// colour plus an element-specific flourish.
// ---------------------------------------------------------------------------

function addFlourish(mk, element, spot) {
  const el = ELEMENTS[element];
  if (!el) return;
  const glow = mk.mat({ color: el.color, unlit: true });
  const light = mk.mat({ color: el.light, unlit: true });
  const { x, y, z, spread } = spot;
  switch (element) {
    case "fire": // flickering flame spikes
      [-1, 0, 1].forEach((i) => mk.part(cone(0.06, i === 0 ? 0.34 : 0.24, 4), i === 0 ? light : glow, x + i * spread, y + 0.12, z));
      break;
    case "frost": // ice crystals
      [-1, 0, 1].forEach((i) => {
        const c = mk.part(cachedGeo("crystal", () => new THREE.OctahedronGeometry(0.08, 0)), light, x + i * spread, y + 0.12, z);
        c.scale.set(0.7, 1.8, 0.7);
        c.rotation.z = i * 0.35;
      });
      break;
    case "energy": // antenna with a glowing tip
      mk.part(box(0.025, 0.3, 0.025), glow, x + spread, y + 0.15, z);
      mk.part(box(0.06, 0.06, 0.06), light, x + spread, y + 0.32, z);
      break;
    case "slime": // goo drips
      [-1, 1].forEach((i) => mk.part(cachedGeo("blob", () => new THREE.SphereGeometry(0.07, 5, 4)), glow, x + i * spread, y - 0.12, z));
      break;
    case "dark": // horns
      [-1, 1].forEach((i) => {
        const h = mk.part(cone(0.05, 0.28, 4), mk.mat({ map: solidTexture("#1a0a2a") }), x + i * spread, y + 0.14, z);
        h.rotation.z = -i * 0.5;
      });
      break;
  }
}

Object.assign(CharacterModel.prototype, {
  // Rebuild armor attachments from the equipped items.
  setGear(equipped) {
    if (this.gearGroup) this.body.remove(this.gearGroup);
    (this.legGear || []).forEach((m) => m.parent && m.parent.remove(m));
    (this.gearMats || []).forEach((m) => m.dispose());
    this.gearGroup = new THREE.Group();
    this.body.add(this.gearGroup);
    this.gearMats = [];
    this.legGear = [];
    this.charm = null;
    const mk = {
      mat: (opts) => { const m = ps1Material(opts); this.gearMats.push(m); return m; },
      part: (geo, mat, x, y, z) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y - 0.9, z);
        this.gearGroup.add(m);
        return m;
      },
    };
    const shell = (item) => mk.mat({ map: solidTexture(elementOf(item.element).armor) });
    const glowOf = (item) => mk.mat({ color: elementOf(item.element).color, unlit: true });

    const P = this.plan;
    const head = equipped.head;
    if (head) {
      // Circlet with a glowing gem, plus the element's flourish on top.
      const ring = mk.part(cachedGeo("circlet", () => new THREE.TorusGeometry(P.head * 1.02, 0.022, 4, 12)), shell(head), 0, P.headY + 0.05, -0.01);
      ring.rotation.x = Math.PI / 2;
      mk.part(cachedGeo("gem", () => new THREE.OctahedronGeometry(0.035, 0)), glowOf(head), 0, P.headY + 0.06, P.head * 0.98);
      if (head.element === "light") {
        const halo = mk.part(cachedGeo("haloBig", () => new THREE.TorusGeometry(0.21, 0.025, 4, 14)), mk.mat({ color: ELEMENTS.light.light, unlit: true }), 0, P.headY + 0.26, -0.03);
        halo.rotation.x = Math.PI / 2 - 0.25;
      } else {
        addFlourish(mk, head.element, { x: 0, y: P.headY + 0.1, z: -0.02, spread: 0.07 });
      }
    }

    const chest = equipped.chest;
    if (chest) {
      // Breastplate: a shell over the chest, pauldrons and a glowing seam.
      const m = shell(chest);
      const T = P.torso.filter(([, y]) => y >= P.chestY[0] - 0.04 && y <= P.chestY[1] + 0.06).map(([r, y]) => [r * 1.09, y]);
      mk.part(latheGeo("plate", T, P.sx, P.sz, { bust: 0.3, bustY: 1.37 }), m, 0, 0, 0);
      const pad = cachedGeo("pauldron", () => new THREE.SphereGeometry(0.085, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.6));
      mk.part(pad, m, P.shoulderX + 0.01, P.shoulderY + 0.01, 0);
      mk.part(pad, m, -P.shoulderX - 0.01, P.shoulderY + 0.01, 0);
      mk.part(box(0.03, 0.2, 0.02), glowOf(chest), 0, 1.36, 0.2);
      if (chest.element === "dark") {
        const cape = mk.part(box(0.4, 0.85, 0.03), mk.mat({ map: solidTexture("#1a0a2a"), doubleSide: true }), 0, 1.12, -0.2);
        cape.rotation.x = 0.1;
      } else {
        addFlourish(mk, chest.element, { x: -P.shoulderX, y: P.shoulderY + 0.04, z: 0, spread: 0.05 });
        addFlourish(mk, chest.element, { x: P.shoulderX, y: P.shoulderY + 0.04, z: 0, spread: 0.05 });
      }
    }

    // Greaves + boots ride on the calf pivots so they swing with the walk.
    const legs = equipped.legs, feet = equipped.feet;
    if (this.calfL) {
      const attach = (calf, geo, mat, x, y, z) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        calf.add(m);
        this.legGear.push(m);
      };
      const [len, r0, r1] = P.calf;
      for (const calf of [this.calfL, this.calfR]) {
        if (legs) {
          attach(calf, limbGeo(len * 0.62, r0 * 1.25, r1 * 1.35), shell(legs), 0, -len * 0.12, 0);
          attach(calf, box(0.07, 0.06, 0.03), glowOf(legs), 0, -0.02, r0 + 0.02);
        }
        if (feet) {
          attach(calf, box(r1 * 2.6, 0.1, r1 * 4.8), shell(feet), 0, -len + 0.02, r1 * 1.1);
          attach(calf, box(r1 * 2.7, 0.03, r1 * 4.9), glowOf(feet), 0, -len - 0.03, r1 * 1.1);
        }
      }
    }

    const trinket = equipped.charm || equipped.ring;
    if (trinket) {
      this.charm = new THREE.Mesh(cachedGeo("charmGem", () => new THREE.OctahedronGeometry(0.1, 0)), glowOf(trinket));
      this.gearGroup.add(this.charm);
    }
  },

  // Slot 0 in hand; slots 1-3 float in a world-space group around the player.
  setWeapons(slots) {
    if (!this.floatGroup) this.floatGroup = new THREE.Group();
    for (const w of this.weaponMeshes || []) {
      if (!w) continue;
      w.holder.parent && w.holder.parent.remove(w.holder);
      w.mats.forEach((m) => m.dispose());
    }
    this.weaponMeshes = slots.map((item, i) => {
      if (!item) return null;
      const w = buildWeaponMesh(item);
      w.holder = new THREE.Group();
      w.holder.add(w.group);
      if (i === 0) {
        w.holder.position.set(-0.24, 0.6, 0.5); // in the right hand, held out in front
        this.body.add(w.holder);
      } else {
        this.floatGroup.add(w.holder);
      }
      return w;
    });
    const hand = this.weaponMeshes[0];
    this.holdsGun = !!hand && hand.cls !== "melee" && hand.cls !== "throwing";
  },

  // Per-frame weapon animation: recoil kick, melee sweeps, hovering bob.
  updateWeapons(playerPos, yaw, fx) {
    if (!this.weaponMeshes) return;
    const t = this.time;
    this.floatGroup.position.copy(playerPos);
    this.floatGroup.rotation.y = yaw;
    this.weaponMeshes.forEach((w, i) => {
      if (!w) return;
      const f = fx[i];
      const melee = w.cls === "melee";
      // Melee sweeps across the arc as `swing` runs 1 -> 0.
      const sweep = melee && f.swing > 0 ? (f.swingMirror ? -1 : 1) * 1.9 * (f.swing - 0.5) : 0;
      if (i === 0) {
        w.holder.position.z = 0.5 - f.kick * 0.12;
        // Guns angle slightly outward so their profile shows over the shoulder.
        w.holder.rotation.set(melee ? -0.9 : 0, sweep + (melee ? 0 : -0.25), 0);
      } else {
        const o = SLOT_OFFSETS[i];
        if (melee && f.swing > 0) {
          // Floating blades orbit out in front of you as they cut.
          w.holder.position.set(Math.sin(sweep) * 1.3, 1.3, Math.cos(sweep) * 1.3);
          w.holder.rotation.set(0, sweep, 0);
        } else {
          // Fan outward (away from the body) so the side of each weapon is
          // visible from the camera instead of just its back end; blades stand up.
          const fan = o.right > 0 ? -0.5 : o.right < 0 ? 0.5 : 0;
          w.holder.position.set(-o.right * WORLD_SCALE, o.h + Math.sin(t * 2.2 + i * 2) * 0.08, o.fwd * WORLD_SCALE - f.kick * 0.15);
          w.holder.rotation.set(melee ? -1.1 : 0, fan, Math.sin(t * 1.7 + i) * 0.08);
        }
      }
      // Mutated weapons pulse their accent glow.
      if (w.mutated) {
        w.accent.uniforms.flash.value = 0.35 + 0.35 * Math.sin(t * 6 + i);
      }
    });
    if (this.charm) {
      this.charm.position.set(Math.cos(t * 2.5) * 0.55, 0.4 + Math.sin(t * 3) * 0.08, Math.sin(t * 2.5) * 0.55);
      this.charm.rotation.y = t * 3;
    }
  },

  disposeExtras() {
    (this.gearMats || []).forEach((m) => m.dispose());
    (this.weaponMeshes || []).forEach((w) => w && w.mats.forEach((m) => m.dispose()));
  },
});
