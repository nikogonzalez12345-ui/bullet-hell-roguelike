// Bridges the 2D gameplay simulation to the Three.js scene. Gameplay code
// never touches Three.js — every frame this syncs models, instanced bullets
// and particles from game state, positions the over-the-shoulder camera,
// and renders at RENDER_W x RENDER_H (upscaled with CSS pixelation).

const BULLET_HEIGHT = 1.15;
const MAX_BULLETS = 2500;
const MAX_PARTICLES = 1500;
const MAX_SHADOWS = 160;

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

// Sim facing angle (direction cos a, sin a in sim x/y) -> model yaw, given
// models face +Z.
const facingToYaw = (a) => Math.PI / 2 - a;

class Renderer3D {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(RENDER_W, RENDER_H, false);
    this.renderer.setClearColor("#000000");

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(66, RENDER_W / RENDER_H, 0.1, 400);

    buildTextures();
    this.world = new World(this.scene);

    this.models = new Map(); // entity -> model
    this.tmpM = new THREE.Matrix4();
    this.tmpQ = new THREE.Quaternion();
    this.tmpS = new THREE.Vector3();
    this.tmpP = new THREE.Vector3();

    this.buildInstanced();
  }

  buildInstanced() {
    const orb = new THREE.IcosahedronGeometry(1, 0);
    this.bulletMesh = new THREE.InstancedMesh(orb, ps1Material({ unlit: true, fog: false }), MAX_BULLETS);
    this.glowMesh = new THREE.InstancedMesh(orb, ps1Material({
      unlit: true, fog: false, transparent: true, additive: true, opacity: 0.35, depthWrite: false,
    }), MAX_BULLETS);
    this.particleMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), ps1Material({ unlit: true }), MAX_PARTICLES);

    const disc = new THREE.CircleGeometry(1, 8);
    disc.rotateX(-Math.PI / 2);
    this.shadowMesh = new THREE.InstancedMesh(disc, ps1Material({
      color: "#000000", unlit: true, transparent: true, opacity: 0.45, depthWrite: false,
    }), MAX_SHADOWS);

    // instanceColor must exist before first compile so USE_INSTANCING_COLOR is defined.
    for (const m of [this.bulletMesh, this.glowMesh, this.particleMesh]) {
      m.setColorAt(0, cachedColor("#ffffff"));
      m.frustumCulled = false;
      m.count = 0;
      this.scene.add(m);
    }
    this.shadowMesh.frustumCulled = false;
    this.shadowMesh.count = 0;
    this.scene.add(this.shadowMesh);
  }

  // ---------------------------------------------------------------------
  // Camera
  // ---------------------------------------------------------------------

  updateCamera(game) {
    const p = game.player;
    const P = toWorld(p.x, p.y);
    const fwd = new THREE.Vector3(Math.cos(game.yaw), 0, Math.sin(game.yaw));
    const right = new THREE.Vector3(-Math.sin(game.yaw), 0, Math.cos(game.yaw));
    const dist = 5.2;
    const back = Math.cos(game.pitch) * dist;
    const up = Math.sin(game.pitch) * dist + 1.7;

    const cam = P.clone().addScaledVector(fwd, -back).addScaledVector(right, 0.85);
    cam.y += up;
    const ground = terrainHeight(cam.x, cam.z) + 0.6;
    if (cam.y < ground) cam.y = ground;
    this.camera.position.copy(cam);

    const target = P.clone().addScaledVector(fwd, 3).addScaledVector(right, 0.85);
    target.y += 1.55;
    this.camera.lookAt(target);
  }

  // Where the player's shots are headed, in overlay-canvas pixels — used to
  // draw the crosshair where bullets actually go (the shoulder offset means
  // that isn't the screen centre).
  projectAim(game) {
    const p = game.player;
    const P = toWorld(p.x, p.y);
    const aim = P.add(new THREE.Vector3(Math.cos(game.yaw), 0, Math.sin(game.yaw)).multiplyScalar(25));
    aim.y = terrainHeight(aim.x, aim.z) + BULLET_HEIGHT;
    aim.project(this.camera);
    return { x: (aim.x + 1) / 2 * CANVAS_W, y: VIEW_TOP + (1 - aim.y) / 2 * VIEW_H };
  }

  // ---------------------------------------------------------------------
  // Entity sync
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
    let shadows = 0;
    const addShadow = (x, y, r) => {
      if (shadows >= MAX_SHADOWS) return;
      const w = toWorld(x, y);
      this.tmpP.set(w.x, w.y + 0.03, w.z);
      this.tmpS.set(r, 1, r);
      this.tmpQ.identity();
      this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
      this.shadowMesh.setMatrixAt(shadows++, this.tmpM);
    };

    const p = game.player;
    if (p.alive) {
      const model = this.modelFor(p, "player");
      model.root.position.copy(toWorld(p.x, p.y));
      const rolling = p.isRolling;
      if (rolling) {
        model.root.rotation.y = facingToYaw(Math.atan2(p.rollDirY, p.rollDirX));
      } else {
        model.root.rotation.y = facingToYaw(p.facing);
      }
      const rollProgress = rolling ? 1 - p.rollTimer / p.rollDuration : 0;
      model.update(dt, { moving: p.moving, rolling, rollAngle: rollProgress * Math.PI * 2 });
      // Blink while in post-hit invulnerability (not during a roll).
      const blink = p.iframeTimer > 0 && !rolling && Math.floor(p.iframeTimer * 20) % 2 === 0;
      model.root.visible = !blink;
      addShadow(p.x, p.y, 0.55);
    }

    for (const e of game.enemies) {
      if (!e.alive) continue;
      const model = this.modelFor(e, e.type);
      model.root.position.copy(toWorld(e.x, e.y));
      model.root.rotation.y = facingToYaw(angleTo(e.x, e.y, p.x, p.y));
      model.update(dt, { moving: true, rolling: false });
      model.flash(e.hitFlash > 0 ? 0.85 : 0);
      addShadow(e.x, e.y, e.radius * WORLD_SCALE * 1.3);
    }

    for (const [entity, model] of this.models) {
      if (!model.seen) {
        this.scene.remove(model.root);
        if (model.trailGroup) this.scene.remove(model.trailGroup);
        model.dispose();
        this.models.delete(entity);
      }
    }

    this.shadowMesh.count = shadows;
    this.shadowMesh.instanceMatrix.needsUpdate = true;
  }

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
      this.tmpQ.setFromEuler(new THREE.Euler(pt.life * 7, pt.life * 5, 0));
      this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
      this.particleMesh.setMatrixAt(n, this.tmpM);
      this.particleMesh.setColorAt(n, cachedColor(pt.color));
      n++;
    }
    this.particleMesh.count = n;
    this.particleMesh.instanceMatrix.needsUpdate = true;
    this.particleMesh.instanceColor.needsUpdate = true;
  }

  render(game, dt) {
    this.updateCamera(game);
    this.world.update(dt, this.camera);
    this.syncCharacters(game, dt);
    this.syncBullets(game);
    this.syncParticles(game);
    this.renderer.render(this.scene, this.camera);
  }
}
