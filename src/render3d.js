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
    const orb = new THREE.IcosahedronGeometry(1, 0);
    this.bulletMesh = new THREE.InstancedMesh(orb, ps1Material({ unlit: true, fog: false }), MAX_BULLETS);
    this.glowMesh = new THREE.InstancedMesh(orb, ps1Material({
      unlit: true, fog: false, transparent: true, additive: true, opacity: 0.35, depthWrite: false,
    }), MAX_BULLETS);
    this.particleMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), ps1Material({ unlit: true }), MAX_PARTICLES);
    this.gemMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), ps1Material({ unlit: true }), MAX_GEMS);

    const disc = new THREE.CircleGeometry(1, 8);
    disc.rotateX(-Math.PI / 2);
    this.shadowMesh = new THREE.InstancedMesh(disc, ps1Material({
      color: "#000000", unlit: true, transparent: true, opacity: 0.45, depthWrite: false,
    }), MAX_SHADOWS);

    // instanceColor must exist before first compile so USE_INSTANCING_COLOR is defined.
    for (const m of [this.bulletMesh, this.glowMesh, this.particleMesh, this.gemMesh]) {
      m.setColorAt(0, cachedColor("#ffffff"));
    }
    for (const m of [this.bulletMesh, this.glowMesh, this.particleMesh, this.gemMesh, this.shadowMesh]) {
      m.frustumCulled = false;
      m.count = 0;
      this.scene.add(m);
    }

    this.beamGeo = new THREE.CylinderGeometry(0.07, 0.18, 7, 5, 1, true);
    this.beamGeo.translate(0, 3.5, 0);
    this.beamMats = new Map();
    this.spriteMats = new Map();
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
    const P = toWorld(p.x, p.y);
    // Smooth the height the rig rides on so small bumps don't jolt the view.
    this.anchorY = lerp(this.anchorY, P.y, clamp(dt * 8, 0, 1));
    P.y = this.anchorY;

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
    const fwd = new THREE.Vector3(Math.cos(game.yaw), 0, Math.sin(game.yaw));
    const P = toWorld(game.player.x, game.player.y);
    P.y = this.anchorY + BULLET_HEIGHT;
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
      model.root.rotation.y = facingToYaw(rolling ? Math.atan2(p.rollDirY, p.rollDirX) : p.aimAngle);
      const rollProgress = rolling ? 1 - p.rollTimer / p.rollDuration : 0;
      model.update(dt, { moving: p.moving, rolling, rollAngle: rollProgress * Math.PI * 2 });
      model.setBackpackSize(p.backpackSlots);
      const blink = p.iframeTimer > 0 && !rolling && Math.floor(p.iframeTimer * 20) % 2 === 0;
      model.root.visible = !blink;
      this.addShadow(p.x, p.y, 0.55);
    }

    for (const e of game.enemies) {
      if (!e.alive) continue;
      const model = this.modelFor(e, e.type);
      model.root.position.copy(toWorld(e.x, e.y));
      model.root.rotation.y = facingToYaw(angleTo(e.x, e.y, p.x, p.y));
      model.update(dt, { moving: true, rolling: false });
      model.flash(e.hitFlash > 0 ? 0.85 : 0);
      this.addShadow(e.x, e.y, e.radius * WORLD_SCALE * 1.3);
    }

    for (const [entity, model] of this.models) {
      if (!model.seen) {
        this.scene.remove(model.root);
        if (model.trailGroup) this.scene.remove(model.trailGroup);
        model.dispose();
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
    let n = 0, g = 0;
    this.tmpQ.identity();
    const cam = this.camera.position;
    for (const b of game.bullets) {
      if (n >= MAX_BULLETS) break;
      const wx = b.x * WORLD_SCALE, wz = b.y * WORLD_SCALE;
      this.tmpP.set(wx, terrainHeight(wx, wz) + BULLET_HEIGHT, wz);
      const r = b.radius * WORLD_SCALE * 1.4;
      const c = cachedColor(b.color);
      this.tmpS.set(r, r, r);
      this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
      this.bulletMesh.setMatrixAt(n, this.tmpM);
      this.bulletMesh.setColorAt(n++, c);
      // A glow halo right next to the lens fills the screen — skip it there.
      if (this.tmpP.distanceToSquared(cam) > 16) {
        this.tmpS.multiplyScalar(2.3);
        this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
        this.glowMesh.setMatrixAt(g, this.tmpM);
        this.glowMesh.setColorAt(g++, c);
      }
    }
    this.bulletMesh.count = n;
    this.glowMesh.count = g;
    for (const m of [this.bulletMesh, this.glowMesh]) {
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
    }
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
    this.syncParticles(game);
    this.shadowMesh.count = this.shadows;
    this.shadowMesh.instanceMatrix.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }
}
