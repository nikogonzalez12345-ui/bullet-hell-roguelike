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
  player:  { skin: "#f2c9a8", hair: "#4a2e22", eye: "#3a6ad0", shirt: "#7a2630", pants: "denim", backpack: true, dynamicGear: true },
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

  // Tints the body and any worn armor (weapons keep their own glow).
  flash(amount, color = "#ffffff") {
    for (const m of this.mats.concat(this.gearMats || [])) {
      m.uniforms.flash.value = amount;
      m.uniforms.flashColor.value.set(color);
    }
  }

  // The pack visibly swells as backpack upgrades add slots.
  setBackpackSize(slots) {
    if (!this.backpack || slots === this.backpackSlots) return;
    this.backpackSlots = slots;
    const k = 1 + (slots - PLAYER.backpackSlots) * 0.035;
    this.backpack.scale.set(1 + (k - 1) * 0.6, k, k * 1.4);
    this.backpack.position.z = -0.26 - (k - 1) * 0.16;
  }

  // state: { moving, rollProgress (0 = not rolling, 0..1 during a roll) }
  update(dt, state) {
    this.time += dt;
    const t = this.time;
    const s = this.spec;

    // Walk amount blends in/out, and the stride phase only advances while
    // walking, so starting/stopping never pops the legs.
    this.walkAmt = lerp(this.walkAmt || 0, state.moving ? 1 : 0, 1 - Math.exp(-10 * dt));
    this.phase = (this.phase || 0) + dt * 11 * this.walkAmt;
    const walk = Math.sin(this.phase) * this.walkAmt;

    // Roll: a tucked forward somersault, eased so it spins fastest mid-roll.
    const u = state.rollProgress || 0;
    const rolling = u > 0;
    const tuck = rolling ? Math.sin(Math.PI * u) : 0;
    this.tuckAmt = lerp(this.tuckAmt || 0, tuck, rolling ? 1 : 1 - Math.exp(-18 * dt));
    const k = this.tuckAmt;

    if (this.legL) {
      this.legL.rotation.x = walk * 0.7 * (1 - k) - 1.4 * k;
      this.legR.rotation.x = -walk * 0.7 * (1 - k) - 1.4 * k;
    }

    if (this.holdsGun) {
      // Arms raised to hold the weapon forward, pulled in while tucked.
      this.armL.rotation.set(-1.25 - 0.5 * k, 0, 0.35 - 0.2 * k);
      this.armR.rotation.set(-1.35 - 0.5 * k, 0, -0.1 + 0.1 * k);
    } else if (this.club) {
      this.armL.rotation.x = -walk * 0.6;
      this.armR.rotation.x = -0.4 + Math.sin(t * 6) * 0.5;
      this.club.rotation.x = this.armR.rotation.x;
    } else {
      this.armL.rotation.set(-walk * 0.6, 0, 0.1);
      this.armR.rotation.set(walk * 0.6, 0, -0.1);
    }

    let bodyY = 0.9 + Math.abs(walk) * 0.05 - 0.35 * k;
    if (s.floating) bodyY += 0.35 + Math.sin(t * 2.5) * 0.15;
    if (s.hover) bodyY += s.hover + Math.sin(t * 1.8) * 0.2;
    this.body.position.y = bodyY;

    const eased = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; // easeInOutQuad
    this.body.rotation.x = rolling ? eased * Math.PI * 2 : 0;
    this.body.scale.y = 1 - 0.2 * k;

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

function createModel(type) {
  return type === "boss_dragon" ? new DragonModel() : new CharacterModel(type);
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

    const head = equipped.head;
    if (head) {
      mk.part(box(0.6, 0.2, 0.56), shell(head), 0, 2.08, -0.01);
      mk.part(box(0.62, 0.06, 0.1), glowOf(head), 0, 1.97, 0.26);
      if (head.element === "light") {
        const halo = mk.part(cachedGeo("halo", () => new THREE.TorusGeometry(0.34, 0.04, 4, 10)), mk.mat({ color: ELEMENTS.light.light, unlit: true }), 0, 2.42, 0);
        halo.rotation.x = Math.PI / 2;
      } else {
        addFlourish(mk, head.element, { x: 0, y: 2.18, z: 0, spread: 0.16 });
      }
    }

    const chest = equipped.chest;
    if (chest) {
      const m = shell(chest);
      mk.part(box(0.62, 0.52, 0.38), m, 0, 1.25, 0);
      mk.part(box(0.22, 0.12, 0.34), m, -0.38, 1.52, 0);
      mk.part(box(0.22, 0.12, 0.34), m, 0.38, 1.52, 0);
      mk.part(box(0.08, 0.36, 0.02), glowOf(chest), 0, 1.25, 0.2);
      if (chest.element === "light") {
        const wing = mk.mat({ color: ELEMENTS.light.light, unlit: true, doubleSide: true });
        [-1, 1].forEach((i) => {
          const w = mk.part(box(0.5, 0.3, 0.03), wing, i * 0.32, 1.5, -0.3);
          w.rotation.set(0, i * 0.5, i * 0.4);
        });
      } else if (chest.element === "dark") {
        const cape = mk.part(box(0.56, 0.9, 0.04), mk.mat({ map: solidTexture("#1a0a2a"), doubleSide: true }), 0, 1.1, -0.28);
        cape.rotation.x = 0.12;
      } else {
        addFlourish(mk, chest.element, { x: -0.38, y: 1.58, z: 0, spread: 0.09 });
        addFlourish(mk, chest.element, { x: 0.38, y: 1.58, z: 0, spread: 0.09 });
      }
    }

    // Greaves + boots ride on the leg pivots so they swing with the walk.
    const legs = equipped.legs, feet = equipped.feet;
    if (this.legL) {
      const attach = (leg, geo, mat, x, y, z) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        leg.add(m);
        this.legGear.push(m);
      };
      for (const leg of [this.legL, this.legR]) {
        if (legs) {
          attach(leg, box(0.24, 0.42, 0.26), shell(legs), 0, -0.28, 0);
          attach(leg, box(0.1, 0.08, 0.04), glowOf(legs), 0, -0.2, 0.14);
        }
        if (feet) {
          attach(leg, box(0.25, 0.16, 0.34), shell(feet), 0, -0.8, 0.04);
          attach(leg, box(0.26, 0.04, 0.35), glowOf(feet), 0, -0.89, 0.04);
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
        w.holder.position.set(-0.46, 0.5, 0.42); // right hand, out past the body so the camera sees it
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
        w.holder.position.z = 0.42 - f.kick * 0.12;
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
