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

const CHARACTER_SPECS = {
  player:  { skin: "#f2c9a8", hair: "#4a2e22", eye: "#3a6ad0", shirt: "#7a2630", pants: "denim", weapon: "rifle", backpack: true },
  grunt:   { skin: "#e0a080", hair: "#c0392b", eye: "#ffd23b", shirt: "#5a1f1f", pants: "#3a1a1a", weapon: "club", horns: "#f2e6c8", scale: 0.9 },
  shooter: { skin: "#e8b48a", hair: "#ff9b3b", eye: "#2a2a2a", shirt: "#b3611a", pants: "#4a2e12", weapon: "pistol" },
  sniper:  { skin: "#cdb8e0", hair: "#2a1a3a", eye: "#c46bff", shirt: "#2a1a3a", pants: "#1a1026", weapon: "longRifle", hood: true },
  orbiter: { skin: "#ffd9ef", hair: "#ff6bd0", eye: "#ff3b9c", shirt: "#b33d92", floating: true, halo: true, scale: 0.9 },
  boss_oni:     { skin: "#c83a2e", hair: "#1a0a0a", eye: "#ffe066", shirt: "#3a0f0f", pants: "#2a0a0a", weapon: "bigClub", horns: "#f2e6c8", bigHorns: true, scale: 2.3 },
  boss_kitsune: { skin: "#fff3e6", hair: "#ffffff", eye: "#ff3b6b", shirt: "#8a2a5a", pants: "#8a2a5a", foxEars: true, tails: 5, hover: 0.6, scale: 2.0 },
};

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
    this.build(spec);
    this.root.scale.setScalar(spec.scale || 1);
  }

  mat(opts) {
    const m = ps1Material(opts);
    this.mats.push(m);
    return m;
  }

  tex(colorOrKey) {
    return colorOrKey === "denim" ? TEX.denim : solidTexture(colorOrKey);
  }

  part(geo, mat, x, y, z, parent = this.body) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y - 0.9, z); // author in "feet at 0" space, stored relative to hip pivot
    parent.add(mesh);
    return mesh;
  }

  build(s) {
    const shirt = this.mat({ map: this.tex(s.shirt) });
    const skin = this.mat({ map: this.tex(s.skin) });
    const hair = this.mat({ map: this.tex(s.hair) });
    const face = this.mat({ map: faceTexture(s.skin, s.hair, s.eye) });

    // Head — anime proportions (big), face texture on the front (+Z) side.
    const head = this.part(box(0.52, 0.5, 0.48), [hair, hair, hair, skin, face, hair], 0, 1.78, 0);
    this.part(box(0.58, 0.14, 0.54), hair, 0, 2.06, -0.02);
    this.part(box(0.56, 0.42, 0.12), hair, 0, 1.78, -0.26);
    this.head = head;

    if (s.hood) {
      const hood = this.mat({ map: this.tex(s.hair) });
      this.part(box(0.64, 0.62, 0.6), hood, 0, 1.82, -0.06).scale.set(1, 1, 1);
      this.part(cone(0.3, 0.4, 4), hood, 0, 2.25, -0.1);
      // hood hides the head box except the face
      head.position.z += 0.08;
    }
    if (s.horns) {
      const horn = this.mat({ map: this.tex(s.horns) });
      const h = s.bigHorns ? 0.45 : 0.22;
      this.part(cone(0.08, h, 4), horn, -0.18, 2.15 + h / 2, 0.05).rotation.z = 0.35;
      this.part(cone(0.08, h, 4), horn, 0.18, 2.15 + h / 2, 0.05).rotation.z = -0.35;
    }
    if (s.foxEars) {
      this.part(cone(0.1, 0.32, 3), hair, -0.2, 2.25, 0).rotation.z = 0.2;
      this.part(cone(0.1, 0.32, 3), hair, 0.2, 2.25, 0).rotation.z = -0.2;
    }
    if (s.halo) {
      const halo = new THREE.Mesh(
        cachedGeo("halo", () => new THREE.TorusGeometry(0.34, 0.04, 4, 10)),
        this.mat({ color: "#fff0a0", unlit: true })
      );
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 2.25 - 0.9;
      this.body.add(halo);
      this.halo = halo;
    }

    if (s.floating) {
      // Spirit: flowing robe cone instead of torso + legs.
      this.part(cone(0.42, 1.1, 6), shirt, 0, 1.0, 0).rotation.x = Math.PI;
      this.part(box(0.46, 0.4, 0.3), shirt, 0, 1.38, 0);
    } else {
      this.part(box(0.56, 0.66, 0.32), shirt, 0, 1.2, 0);
      const pants = this.mat({ map: this.tex(s.pants) });
      this.legL = this.limb(pants, -0.14, 0.86, 0.2, 0.84);
      this.legR = this.limb(pants, 0.14, 0.86, 0.2, 0.84);
      this.part(box(0.56, 0.12, 0.34), pants, 0, 0.9, 0);
    }
    this.armL = this.limb(shirt, -0.37, 1.48, 0.17, 0.62, skin);
    this.armR = this.limb(shirt, 0.37, 1.48, 0.17, 0.62, skin);

    if (s.backpack) {
      const pack = this.mat({ map: this.tex("#3a4a2a") });
      this.backpack = this.part(box(0.44, 0.52, 0.2), pack, 0, 1.22, -0.26);
      this.backpackSlots = PLAYER.backpackSlots;
    }
    if (s.tails) {
      this.tails = [];
      const tailMat = this.mat({ map: this.tex("#ffffff") });
      const tailGeo = cachedGeo("tail", () => new THREE.SphereGeometry(0.22, 6, 4));
      for (let i = 0; i < s.tails; i++) {
        const pivot = new THREE.Group();
        pivot.position.set(0, 0.95 - 0.9, -0.15);
        const t = (i / (s.tails - 1)) - 0.5;
        pivot.rotation.set(-0.9, t * 2.2, 0);
        const tail = new THREE.Mesh(tailGeo, tailMat);
        tail.scale.set(1, 1, 3.4);
        tail.position.z = -0.7;
        pivot.add(tail);
        this.body.add(pivot);
        this.tails.push(pivot);
      }
    }

    this.buildWeapon(s.weapon);
    this.holdsGun = ["rifle", "pistol", "longRifle"].includes(s.weapon);
  }

  // Limb = pivot at the joint with a box hanging below it.
  limb(mat, x, y, w, len, handMat) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y - 0.9, 0);
    const seg = new THREE.Mesh(box(w, len, w + 0.02), mat);
    seg.position.y = -len / 2;
    pivot.add(seg);
    if (handMat) {
      const hand = new THREE.Mesh(box(w * 0.9, 0.14, w * 0.9), handMat);
      hand.position.y = -len - 0.05;
      pivot.add(hand);
    }
    this.body.add(pivot);
    return pivot;
  }

  buildWeapon(kind) {
    if (!kind) return;
    const wood = this.mat({ map: TEX.wood });
    const metal = this.mat({ map: this.tex("#2a2a30") });
    const g = new THREE.Group();
    if (kind === "rifle" || kind === "longRifle") {
      const len = kind === "longRifle" ? 1.4 : 1.05;
      const stock = new THREE.Mesh(box(0.09, 0.13, len * 0.55), wood);
      stock.position.z = -len * 0.1;
      const barrel = new THREE.Mesh(box(0.05, 0.05, len * 0.6), metal);
      barrel.position.set(0, 0.04, len * 0.4);
      g.add(stock, barrel);
      g.position.set(0.12, 1.22 - 0.9, 0.3);
    } else if (kind === "pistol") {
      const p = new THREE.Mesh(box(0.07, 0.12, 0.32), metal);
      g.add(p);
      g.position.set(0.3, 1.2 - 0.9, 0.45);
    } else if (kind === "club" || kind === "bigClub") {
      const c = new THREE.Mesh(box(0.14, 0.14, kind === "bigClub" ? 1.2 : 0.8), wood);
      c.position.z = 0.35;
      g.add(c);
      g.position.set(0.37, 0.8 - 0.9, 0.1);
      this.club = g;
    }
    this.body.add(g);
    this.weapon = g;
  }

  flash(amount) {
    for (const m of this.mats) m.uniforms.flash.value = amount;
  }

  // The pack visibly swells as backpack upgrades add slots.
  setBackpackSize(slots) {
    if (!this.backpack || slots === this.backpackSlots) return;
    this.backpackSlots = slots;
    const k = 1 + (slots - PLAYER.backpackSlots) * 0.035;
    this.backpack.scale.set(1 + (k - 1) * 0.6, k, k * 1.4);
    this.backpack.position.z = -0.26 - (k - 1) * 0.16;
  }

  // state: { moving, rolling, rollAngle, time }
  update(dt, state) {
    this.time += dt;
    const t = this.time;
    const s = this.spec;
    const walk = state.moving ? Math.sin(t * 11) : 0;

    if (this.legL) {
      this.legL.rotation.x = walk * 0.7;
      this.legR.rotation.x = -walk * 0.7;
    }

    if (this.holdsGun) {
      // Arms raised to hold the weapon forward.
      this.armL.rotation.set(-1.25, 0, 0.35);
      this.armR.rotation.set(-1.35, 0, -0.1);
    } else if (this.club) {
      this.armL.rotation.x = -walk * 0.6;
      this.armR.rotation.x = -0.4 + Math.sin(t * 6) * 0.5;
      this.club.rotation.x = this.armR.rotation.x;
    } else {
      this.armL.rotation.set(-walk * 0.6, 0, 0.1);
      this.armR.rotation.set(walk * 0.6, 0, -0.1);
    }

    let bodyY = 0.9 + (state.moving ? Math.abs(walk) * 0.05 : 0);
    if (s.floating) bodyY += 0.35 + Math.sin(t * 2.5) * 0.15;
    if (s.hover) bodyY += s.hover + Math.sin(t * 1.8) * 0.2;
    this.body.position.y = bodyY;

    if (state.rolling) {
      this.body.rotation.x = state.rollAngle;
      this.body.scale.y = 0.8;
    } else {
      this.body.rotation.x = 0;
      this.body.scale.y = 1;
    }

    if (this.halo) this.halo.rotation.z = t * 2;
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

  flash(amount) {
    for (const m of this.mats) m.uniforms.flash.value = amount;
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

function createModel(type) {
  return type === "boss_dragon" ? new DragonModel() : new CharacterModel(type);
}
