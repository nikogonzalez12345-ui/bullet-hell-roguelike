// Bridges the 2D gameplay simulation to the Three.js scene. Gameplay code
// never touches Three.js — every frame this syncs models, instanced bullets,
// gems, loot and particles from game state, positions the camera, and
// renders at RENDER_W x RENDER_H (upscaled with CSS pixelation).

const BULLET_HEIGHT = 1.15;
const MAX_BULLETS = 2500;
const MAX_PARTICLES = 1500;
const MAX_SHADOWS = 200;
const MAX_GEMS = 900;

// Fixed over-the-shoulder rig (world units). Pitch never changes, so the
// crosshair stays locked to one spot on screen.
const CAM = { back: 5.0, up: 2.6, shoulder: 0.85, lookAhead: 3, lookUp: 1.55 };

const COLOR_CACHE = new Map();
function cachedColor(hex) {
  let c = COLOR_CACHE.get(hex);
  if (!c) { c = new THREE.Color(hex); COLOR_CACHE.set(hex, c); }
  return c;
}

function toWorld(simX, simY) {
  const wx = simX * WORLD_SCALE, wz = simY * WORLD_SCALE;
  return new THREE.Vector3(wx, terrainHeight(wx, wz), wz);
}

// Sim facing angle (direction cos a, sin a in sim x/y) -> model yaw (models face +Z).
const facingToYaw = (a) => Math.PI / 2 - a;

// Projectile looks. Long shapes are modelled along +Z and turned to face
// their heading; flat throwables spin. `k` maps sim radius -> world size.
function flatShape(points) {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(-Math.PI / 2);
  return g;
}
const PROJECTILE_SHAPES = {
  orb:     { k: 1.0, geo: () => new THREE.IcosahedronGeometry(1, 0), max: 2500 },
  pellet:  { k: 0.8, geo: () => new THREE.BoxGeometry(1, 1, 1.8) },
  tracer:  { k: 0.7, geo: () => new THREE.BoxGeometry(0.55, 0.55, 5) },
  beam:    { k: 0.7, geo: () => new THREE.BoxGeometry(0.4, 0.4, 10) },
  rail:    { k: 0.7, geo: () => new THREE.BoxGeometry(0.5, 0.5, 18), max: 60 },
  slug:    { k: 0.9, geo: () => { const g = new THREE.CylinderGeometry(0.8, 0.8, 2, 6); g.rotateX(Math.PI / 2); return g; } },
  star:    { k: 1.0, flat: true, spin: 18, max: 200,
             geo: () => flatShape([...Array(8)].map((_, i) => { const a = (i / 8) * Math.PI * 2, r = i % 2 ? 0.35 : 1; return [Math.cos(a) * r, Math.sin(a) * r]; })) },
  kunai:   { k: 0.9, geo: () => { const g = new THREE.OctahedronGeometry(1, 0); g.scale(0.45, 0.25, 2); return g; } },
  axe:     { k: 1.0, flat: true, spin: 14, max: 60,
             geo: () => flatShape([[-0.12, -1], [0.12, -1], [0.12, 0.2], [0.9, 0.1], [1, 0.9], [0.12, 0.8], [0.12, 1], [-0.12, 1]]) },
  rocket:  { k: 0.7, max: 200, geo: () => { const g = new THREE.CylinderGeometry(0.35, 0.7, 3, 6); g.rotateX(Math.PI / 2); return g; } },
  grenade: { k: 0.8, max: 100, geo: () => new THREE.DodecahedronGeometry(1, 0) },
};

// Ease a model's yaw toward `target` (shortest way round) instead of snapping.
function turnModel(model, target, rate, dt) {
  if (model.yaw === undefined) model.yaw = target;
  model.yaw += wrapAngle(target - model.yaw) * (1 - Math.exp(-rate * dt));
  model.root.rotation.y = model.yaw;
}

class Renderer3D {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(RENDER_W, RENDER_H, false);
    this.renderer.setClearColor("#000000");

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(66, RENDER_W / RENDER_H, 0.1, 400);
    this.anchorY = 0;
    this.menuAngle = 0;

    buildTextures();
    this.world = null;
    this.models = new Map(); // entity -> model
    this.lootObjs = new Map(); // Loot -> { group, sprite }
    this.tmpM = new THREE.Matrix4();
    this.tmpQ = new THREE.Quaternion();
    this.tmpS = new THREE.Vector3();
    this.tmpP = new THREE.Vector3();
    this.tmpE = new THREE.Euler();

    this.buildInstanced();
  }

  newWorld(seed) {
    if (this.world) this.world.dispose();
    this.world = new World(this.scene, seed);
  }

  buildInstanced() {
    // One instanced mesh per projectile shape (see PROJECTILE_SHAPES).
    this.shapeMeshes = {};
    for (const [name, def] of Object.entries(PROJECTILE_SHAPES)) {
      const mesh = new THREE.InstancedMesh(def.geo(), ps1Material({ unlit: true, fog: false, doubleSide: !!def.flat }), def.max || 600);
      this.shapeMeshes[name] = mesh;
    }
    this.glowMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), ps1Material({
      unlit: true, fog: false, transparent: true, additive: true, opacity: 0.28, depthWrite: false,
    }), MAX_BULLETS);
    this.particleMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), ps1Material({ unlit: true }), MAX_PARTICLES);
    this.gemMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), ps1Material({ unlit: true }), MAX_GEMS);

    const disc = new THREE.CircleGeometry(1, 8);
    disc.rotateX(-Math.PI / 2);
    this.shadowMesh = new THREE.InstancedMesh(disc, ps1Material({
      color: "#000000", unlit: true, transparent: true, opacity: 0.45, depthWrite: false,
    }), MAX_SHADOWS);

    const instanced = [...Object.values(this.shapeMeshes), this.glowMesh, this.particleMesh, this.gemMesh];
    // instanceColor must exist before first compile so USE_INSTANCING_COLOR is defined.
    for (const m of instanced) m.setColorAt(0, cachedColor("#ffffff"));
    for (const m of [...instanced, this.shadowMesh]) {
      m.frustumCulled = false;
      m.count = 0;
      this.scene.add(m);
    }

    this.beamGeo = new THREE.CylinderGeometry(0.07, 0.18, 7, 5, 1, true);
    this.beamGeo.translate(0, 3.5, 0);
    this.beamMats = new Map();
    this.spriteMats = new Map();
    this.buildEffectPools();
  }

  // Pooled meshes for melee arcs, explosions and puddles (each needs its own
  // material for colour/opacity), plus one dynamic line buffer for lightning.
  buildEffectPools() {
    const pool = (n, make) => Array.from({ length: n }, () => {
      const m = make();
      m.visible = false;
      m.frustumCulled = false;
      this.scene.add(m);
      return m;
    });
    const fxMat = (opts) => ps1Material({ unlit: true, fog: false, transparent: true, depthWrite: false, ...opts });
    this.arcGeos = new Map();
    this.swingPool = pool(12, () => new THREE.Mesh(this.arcGeo(Math.PI), fxMat({ additive: true, doubleSide: true })));
    const sphere = new THREE.IcosahedronGeometry(1, 1);
    this.blastPool = pool(40, () => new THREE.Mesh(sphere, fxMat({ additive: true })));
    const disc = new THREE.CircleGeometry(1, 12);
    disc.rotateX(-Math.PI / 2);
    this.puddlePool = pool(40, () => new THREE.Mesh(disc, fxMat({ opacity: 0.55 })));

    const maxVerts = 160 * 10;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(maxVerts * 3), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(maxVerts * 3), 3));
    this.boltLines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true }));
    this.boltLines.frustumCulled = false;
    this.scene.add(this.boltLines);
  }

  // Flat ring sector centred on +Z, outer radius 1.
  arcGeo(arc) {
    const key = Math.round(arc * 100);
    if (!this.arcGeos.has(key)) {
      const g = new THREE.RingGeometry(0.35, 1, 18, 1, Math.PI / 2 - arc / 2, arc);
      g.rotateX(Math.PI / 2);
      this.arcGeos.set(key, g);
    }
    return this.arcGeos.get(key);
  }

  // ---------------------------------------------------------------------
  // Camera
  // ---------------------------------------------------------------------

  updateCamera(game, dt) {
    if (game.state === STATE.MENU) {
      // Slow cinematic orbit around the island for the title screen.
      this.menuAngle += dt * 0.05;
      const r = 34;
      const x = Math.cos(this.menuAngle) * r, z = Math.sin(this.menuAngle) * r;
      this.camera.position.set(x, Math.max(terrainHeight(x, z), 0) + 9, z);
      this.camera.lookAt(0, 2, 0);
      return;
    }
    const p = game.player;
    const target0 = toWorld(p.x, p.y);
    // The rig follows a smoothed anchor rather than the player directly, so
    // rolls, knockbacks and bumpy ground glide instead of jolting the view.
    if (!this.anchor || this.anchor.distanceTo(target0) > 8) {
      this.anchor = target0.clone();
    } else {
      const kXZ = 1 - Math.exp(-14 * dt), kY = 1 - Math.exp(-7 * dt);
      this.anchor.x = lerp(this.anchor.x, target0.x, kXZ);
      this.anchor.z = lerp(this.anchor.z, target0.z, kXZ);
      this.anchor.y = lerp(this.anchor.y, target0.y, kY);
    }
    this.anchorY = this.anchor.y;
    const P = this.anchor.clone();

    const fwd = new THREE.Vector3(Math.cos(game.yaw), 0, Math.sin(game.yaw));
    const right = new THREE.Vector3(-Math.sin(game.yaw), 0, Math.cos(game.yaw));
    const cam = P.clone().addScaledVector(fwd, -CAM.back).addScaledVector(right, CAM.shoulder);
    cam.y += CAM.up;
    cam.y = Math.max(cam.y, terrainHeight(cam.x, cam.z) + 0.6);
    this.camera.position.copy(cam);

    const target = P.clone().addScaledVector(fwd, CAM.lookAhead).addScaledVector(right, CAM.shoulder);
    target.y += CAM.lookUp;
    this.camera.lookAt(target);
  }

  // Where shots are headed, in overlay pixels. Computed relative to the rig,
  // so it's the same point every frame.
  projectAim(game) {
    if (!this.anchor) return { x: CANVAS_W / 2, y: VIEW_TOP + VIEW_H / 2 };
    const fwd = new THREE.Vector3(Math.cos(game.yaw), 0, Math.sin(game.yaw));
    const P = this.anchor.clone();
    P.y += BULLET_HEIGHT;
    const aim = P.addScaledVector(fwd, 25).project(this.camera);
    return { x: Math.round((aim.x + 1) / 2 * CANVAS_W), y: Math.round(VIEW_TOP + (1 - aim.y) / 2 * VIEW_H) };
  }

  // Screen-space box around an enemy's body (overlay pixels), for the
  // lock-on brackets. Null when it's behind the camera.
  projectEnemy(e) {
    const model = this.models.get(e);
    if (!model) return null;
    const P = new THREE.Vector3();
    let halfW, halfH;
    if (model.head && e.type === "boss_dragon") {
      model.head.getWorldPosition(P);
      halfW = 1.1;
      halfH = 0.9;
    } else {
      const s = model.root.scale.x;
      P.copy(model.root.position);
      P.y += 1.1 * s;
      halfW = 0.45 * s;
      halfH = 1.05 * s;
    }
    const d = P.distanceTo(this.camera.position);
    P.project(this.camera);
    if (P.z > 1) return null;
    const ppu = (VIEW_H / 2) / (Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * d);
    return {
      x: Math.round((P.x + 1) / 2 * CANVAS_W),
      y: Math.round(VIEW_TOP + (1 - P.y) / 2 * VIEW_H),
      w: Math.max(9, Math.round(halfW * ppu)),
      h: Math.max(12, Math.round(halfH * ppu)),
    };
  }

  // Trees/rocks near the camera->player line dither away (see ps1.js).
  updateOcclusion(game) {
    if (game.state === STATE.MENU) {
      OCCLUSION.fadeR.value = 0;
      return;
    }
    const P = toWorld(game.player.x, game.player.y);
    P.y = this.anchorY + 1.2;
    OCCLUSION.fadeA.value.copy(this.camera.position);
    OCCLUSION.fadeB.value.copy(P);
    OCCLUSION.fadeR.value = 2.0;
  }

  // ---------------------------------------------------------------------
  // Characters
  // ---------------------------------------------------------------------

  modelFor(entity, type) {
    let model = this.models.get(entity);
    if (!model) {
      model = createModel(type);
      this.scene.add(model.root);
      if (model.trailGroup) this.scene.add(model.trailGroup);
      this.models.set(entity, model);
    }
    model.seen = true;
    return model;
  }

  syncCharacters(game, dt) {
    for (const m of this.models.values()) m.seen = false;
    this.shadows = 0;

    const p = game.player;
    if (p.alive && game.state !== STATE.MENU) {
      const model = this.modelFor(p, "player");
      model.root.position.copy(toWorld(p.x, p.y));
      const rolling = p.isRolling;
      turnModel(model, facingToYaw(rolling ? Math.atan2(p.rollDirY, p.rollDirX) : p.aimAngle), 22, dt);
      model.update(dt, { moving: p.moving, rollProgress: p.rollProgress });
      model.setBackpackSize(p.backpackSlots);
      // Rebuild armor + weapon visuals whenever the loadout changes.
      if (model.gearVersion !== p.gearVersion) {
        model.gearVersion = p.gearVersion;
        model.setGear(p.equipped);
        model.setWeapons(p.weaponSlots);
        if (!model.floatGroup.parent) this.scene.add(model.floatGroup);
      }
      model.updateWeapons(model.root.position, model.yaw, p.weaponFx);
      const blink = p.iframeTimer > 0 && !rolling && Math.floor(p.iframeTimer * 20) % 2 === 0;
      model.root.visible = !blink;
      model.floatGroup.visible = !blink;
      this.addShadow(p.x, p.y, 0.55);
    }

    for (const e of game.enemies) {
      if (!e.alive) continue;
      const model = this.modelFor(e, e.type);
      model.root.position.copy(toWorld(e.x, e.y));
      turnModel(model, facingToYaw(angleTo(e.x, e.y, p.x, p.y)), 8, dt);
      model.update(dt, { moving: e.slowMul > 0 });
      // Hit flash wins; otherwise tint by the strongest status (frozen, burning…).
      if (e.hitFlash > 0) model.flash(0.85, "#ffffff");
      else if (e.tint) model.flash(e.tint[1], e.tint[0]);
      else model.flash(0);
      this.addShadow(e.x, e.y, e.radius * WORLD_SCALE * 1.3);
    }

    for (const [entity, model] of this.models) {
      if (!model.seen) {
        this.scene.remove(model.root);
        if (model.trailGroup) this.scene.remove(model.trailGroup);
        if (model.floatGroup) this.scene.remove(model.floatGroup);
        model.dispose();
        if (model.disposeExtras) model.disposeExtras();
        this.models.delete(entity);
      }
    }
  }

  addShadow(x, y, r) {
    if (this.shadows >= MAX_SHADOWS) return;
    const w = toWorld(x, y);
    this.tmpP.set(w.x, w.y + 0.03, w.z);
    this.tmpS.set(r, 1, r);
    this.tmpQ.identity();
    this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
    this.shadowMesh.setMatrixAt(this.shadows++, this.tmpM);
  }

  // ---------------------------------------------------------------------
  // Pickups
  // ---------------------------------------------------------------------

  syncGems(game, time) {
    let n = 0;
    for (const gem of game.gems) {
      if (n >= MAX_GEMS) break;
      const wx = gem.x * WORLD_SCALE, wz = gem.y * WORLD_SCALE;
      this.tmpP.set(wx, terrainHeight(wx, wz) + 0.45 + Math.sin(time * 3 + gem.spin) * 0.12, wz);
      this.tmpE.set(0, gem.spin, 0);
      this.tmpQ.setFromEuler(this.tmpE);
      const s = 0.2 * gem.tier.size;
      this.tmpS.set(s, s * 1.5, s);
      this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
      this.gemMesh.setMatrixAt(n, this.tmpM);
      this.gemMesh.setColorAt(n++, cachedColor(gem.tier.color));
    }
    this.gemMesh.count = n;
    this.gemMesh.instanceMatrix.needsUpdate = true;
    this.gemMesh.instanceColor.needsUpdate = true;
  }

  syncLoot(game, time) {
    for (const obj of this.lootObjs.values()) obj.seen = false;
    for (const loot of game.loot) {
      let obj = this.lootObjs.get(loot);
      if (!obj) {
        obj = this.makeLootObj(loot.item);
        this.scene.add(obj.group);
        this.lootObjs.set(loot, obj);
      }
      obj.seen = true;
      const w = toWorld(loot.x, loot.y);
      obj.group.position.copy(w);
      obj.sprite.position.y = 0.7 + Math.sin(time * 2.5 + loot.item.id) * 0.12;
      this.addShadow(loot.x, loot.y, 0.35);
    }
    for (const [loot, obj] of this.lootObjs) {
      if (!obj.seen) {
        this.scene.remove(obj.group);
        this.lootObjs.delete(loot);
      }
    }
  }

  // A rarity-coloured light beam plus a floating pixel icon, Diablo style.
  makeLootObj(item) {
    const color = itemColor(item);
    if (!this.beamMats.has(color)) {
      this.beamMats.set(color, ps1Material({
        color, unlit: true, transparent: true, additive: true, opacity: 0.55, depthWrite: false, doubleSide: true, fog: false,
      }));
    }
    const key = iconKey(item);
    if (!this.spriteMats.has(key)) {
      this.spriteMats.set(key, new THREE.SpriteMaterial({ map: itemIconTexture(item), alphaTest: 0.5 }));
    }
    const group = new THREE.Group();
    const rarityIndex = RARITIES.findIndex((r) => r.id === item.rarity);
    if (item.kind === "potion" || rarityIndex >= 1) {
      const beam = new THREE.Mesh(this.beamGeo, this.beamMats.get(color));
      beam.scale.y = 0.5 + rarityIndex * 0.25;
      group.add(beam);
    }
    const sprite = new THREE.Sprite(this.spriteMats.get(key));
    sprite.scale.set(0.8, 0.8, 1);
    group.add(sprite);
    return { group, sprite };
  }

  // ---------------------------------------------------------------------
  // Bullets + particles
  // ---------------------------------------------------------------------

  syncBullets(game) {
    const counts = {};
    for (const k in this.shapeMeshes) counts[k] = 0;
    let g = 0;
    const cam = this.camera.position;
    const draw = (x, y, radius, color, shape, heading, age, lift, isEnemy) => {
      const def = PROJECTILE_SHAPES[shape] || PROJECTILE_SHAPES.orb;
      const mesh = this.shapeMeshes[shape] || this.shapeMeshes.orb;
      const i = counts[shape] || 0;
      if (i >= mesh.instanceMatrix.count) return;
      const wx = x * WORLD_SCALE, wz = y * WORLD_SCALE;
      this.tmpP.set(wx, terrainHeight(wx, wz) + BULLET_HEIGHT + lift, wz);
      const r = radius * WORLD_SCALE * def.k;
      this.tmpS.set(r, r, r);
      if (def.spin) this.tmpE.set(0, age * def.spin, 0);
      else if (shape === "grenade") this.tmpE.set(age * 8, age * 6, 0);
      else this.tmpE.set(0, heading, 0);
      this.tmpQ.setFromEuler(this.tmpE);
      this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
      const c = cachedColor(color);
      mesh.setMatrixAt(i, this.tmpM);
      mesh.setColorAt(i, c);
      counts[shape] = i + 1;
      // Soft halo; skipped right next to the lens where it would fill the screen.
      if (g < MAX_BULLETS && this.tmpP.distanceToSquared(cam) > 16) {
        const h = radius * WORLD_SCALE * (isEnemy ? 1.7 : 1.5);
        this.tmpS.set(h, h, h);
        this.tmpQ.identity();
        this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
        this.glowMesh.setMatrixAt(g, this.tmpM);
        this.glowMesh.setColorAt(g++, c);
      }
    };

    for (const b of game.bullets) {
      const heading = Math.atan2(b.vx, b.vy);
      const lift = b.lob ? Math.sin(Math.PI * Math.min(1, b.age / b.maxLife)) * 2.4 : 0;
      draw(b.x, b.y, b.radius, b.color, b.shape, heading, b.age, lift, b.owner === "enemy");
    }
    for (const o of game.orbitals) draw(o.x, o.y, 7, ELEMENTS.light.light, "orb", 0, 0, 0.3, false);

    for (const [k, mesh] of Object.entries(this.shapeMeshes)) {
      mesh.count = counts[k];
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    }
    this.glowMesh.count = g;
    this.glowMesh.instanceMatrix.needsUpdate = true;
    this.glowMesh.instanceColor.needsUpdate = true;
  }

  // Melee arcs, explosions, slime puddles and chain lightning.
  syncEffects(game) {
    const worldAt = (x, y, h) => {
      const wx = x * WORLD_SCALE, wz = y * WORLD_SCALE;
      return this.tmpP.set(wx, terrainHeight(wx, wz) + h, wz);
    };

    this.swingPool.forEach((m, i) => {
      const s = game.swings[i];
      m.visible = !!s;
      if (!s) return;
      const u = s.t / s.dur;
      m.geometry = this.arcGeo(s.arc);
      m.position.copy(worldAt(s.x, s.y, 1.1));
      // Sweep a little across the arc as it fades, in the swing's direction.
      m.rotation.set(0, facingToYaw(s.angle) + (s.mirror ? -1 : 1) * (0.5 - u) * 0.5, 0);
      m.scale.setScalar(s.range * WORLD_SCALE * (0.9 + 0.15 * u));
      m.material.uniforms.baseColor.value.set(s.color);
      m.material.uniforms.opacity.value = 0.9 * (1 - u);
    });

    this.blastPool.forEach((m, i) => {
      const b = game.blasts[game.blasts.length - 1 - i];
      m.visible = !!b;
      if (!b) return;
      const u = b.t / b.dur;
      m.position.copy(worldAt(b.x, b.y, 0.6));
      m.scale.setScalar(b.r * WORLD_SCALE * (0.35 + 0.65 * (1 - (1 - u) * (1 - u))));
      m.material.uniforms.baseColor.value.set(b.color);
      m.material.uniforms.opacity.value = 0.5 * (1 - u);
    });

    this.puddlePool.forEach((m, i) => {
      const p = game.puddles[i];
      m.visible = !!p;
      if (!p) return;
      const grow = Math.min(1, p.t / 0.2) * Math.min(1, (p.dur - p.t) / 0.4);
      m.position.copy(worldAt(p.x, p.y, 0.06));
      m.scale.setScalar(p.r * WORLD_SCALE * grow);
      m.material.uniforms.baseColor.value.set(ELEMENTS.slime.color);
    });

    // Lightning: jagged 5-segment polylines, re-jittered every few frames.
    const pos = this.boltLines.geometry.attributes.position;
    const col = this.boltLines.geometry.attributes.color;
    let v = 0;
    const flicker = Math.floor(performance.now() / 50);
    for (const b of game.bolts) {
      if (v + 10 > pos.count) break;
      const a = worldAt(b.x1, b.y1, 1.2).clone();
      const z = worldAt(b.x2, b.y2, 1.2).clone();
      const c = cachedColor(b.color);
      let prev = a;
      for (let s = 1; s <= 5; s++) {
        const t = s / 5;
        const n = s === 5 ? z : new THREE.Vector3(
          lerp(a.x, z.x, t) + (Math.sin(b.seed + s * 12.9 + flicker) * 0.35),
          lerp(a.y, z.y, t) + (Math.sin(b.seed + s * 7.3 + flicker) * 0.3),
          lerp(a.z, z.z, t) + (Math.cos(b.seed + s * 4.1 + flicker) * 0.35)
        );
        pos.setXYZ(v, prev.x, prev.y, prev.z); col.setXYZ(v++, c.r, c.g, c.b);
        pos.setXYZ(v, n.x, n.y, n.z); col.setXYZ(v++, c.r, c.g, c.b);
        prev = n;
      }
    }
    this.boltLines.geometry.setDrawRange(0, v);
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  // Overlay-pixel position of a sim point at height h (for popups).
  projectPoint(x, y, h) {
    const wx = x * WORLD_SCALE, wz = y * WORLD_SCALE;
    const v = new THREE.Vector3(wx, terrainHeight(wx, wz) + h, wz).project(this.camera);
    if (v.z > 1) return null;
    return { x: Math.round((v.x + 1) / 2 * CANVAS_W), y: Math.round(VIEW_TOP + (1 - v.y) / 2 * VIEW_H) };
  }

  syncParticles(game) {
    let n = 0;
    for (const pt of game.particles) {
      if (n >= MAX_PARTICLES) break;
      const wx = pt.x * WORLD_SCALE, wz = pt.y * WORLD_SCALE;
      this.tmpP.set(wx, terrainHeight(wx, wz) + pt.h, wz);
      const s = pt.size * WORLD_SCALE * 1.6 * clamp(pt.life / pt.maxLife, 0.2, 1);
      this.tmpS.set(s, s, s);
      this.tmpE.set(pt.life * 7, pt.life * 5, 0);
      this.tmpQ.setFromEuler(this.tmpE);
      this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
      this.particleMesh.setMatrixAt(n, this.tmpM);
      this.particleMesh.setColorAt(n++, cachedColor(pt.color));
    }
    this.particleMesh.count = n;
    this.particleMesh.instanceMatrix.needsUpdate = true;
    this.particleMesh.instanceColor.needsUpdate = true;
  }

  render(game, dt) {
    if (!this.world) return;
    const time = this.world.time;
    this.updateCamera(game, dt);
    this.updateOcclusion(game);
    this.world.update(dt, this.camera);
    this.syncCharacters(game, dt);
    this.syncLoot(game, time);
    this.syncGems(game, time);
    this.syncBullets(game);
    this.syncEffects(game);
    this.syncParticles(game);
    this.shadowMesh.count = this.shadows;
    this.shadowMesh.instanceMatrix.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }
}
