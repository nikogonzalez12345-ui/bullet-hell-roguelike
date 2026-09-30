// Procedurally generated sunset island. Each run gets a seed; the seed drives
// the coastline, hills, and where forests, rocky patches and meadows go.
// Trees and rocks inside the playable radius are cover: they're registered
// as obstacles (sim units) so characters collide with them and bullets stop.

const WATER_Y = -0.8;
const PLAY_R = ARENA_RADIUS * WORLD_SCALE;      // playable radius, world units
const TERRAIN_SIZE = Math.ceil((PLAY_R + 30) * 2);
const TERRAIN_SEGS = 150;

// ---------------------------------------------------------------------------
// Obstacles + a coarse spatial grid so collision checks stay cheap on a big map
// ---------------------------------------------------------------------------

const OBSTACLES = []; // { x, y, r } in sim units
const OB_CELL = 160;
const OB_GRID = new Map();
const NO_OBSTACLES = [];

function addObstacle(o) {
  OBSTACLES.push(o);
  const pad = o.r + 60; // covers the largest moving body that might query this cell
  for (let cx = Math.floor((o.x - pad) / OB_CELL); cx <= Math.floor((o.x + pad) / OB_CELL); cx++) {
    for (let cy = Math.floor((o.y - pad) / OB_CELL); cy <= Math.floor((o.y + pad) / OB_CELL); cy++) {
      const key = cx + "," + cy;
      if (!OB_GRID.has(key)) OB_GRID.set(key, []);
      OB_GRID.get(key).push(o);
    }
  }
}

function obstaclesNear(x, y) {
  return OB_GRID.get(Math.floor(x / OB_CELL) + "," + Math.floor(y / OB_CELL)) || NO_OBSTACLES;
}

function clearObstacles() {
  OBSTACLES.length = 0;
  OB_GRID.clear();
}

// ---------------------------------------------------------------------------
// Seeded randomness + value noise
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(rng) {
  const perm = new Uint8Array(256);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) vals[i] = rng() * 2 - 1;
  const at = (i, j) => vals[perm[(perm[i & 255] + j) & 255]];

  function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }
  function fbm(x, y, octaves) {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += noise(x * freq, y * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum / norm;
  }
  return { noise, fbm };
}

function smooth(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// Deterministic jitter keyed on position, so vertices shared between faces
// of non-indexed geometry move together and the mesh doesn't crack.
function jitterGeometry(geo, amount, seed = 1) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const h = Math.sin(Math.round(x * 97) * 12.9898 + Math.round(y * 97) * 78.233 + Math.round(z * 97) * 37.719 + seed) * 43758.5453;
    const n = (h - Math.floor(h)) * 2 - 1;
    const k = 1 + n * amount;
    pos.setXYZ(i, x * k, y * k, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

// Height lookup used everywhere (characters, bullets, camera). Bilinear
// sampling of the same grid the terrain mesh was built from.
let CURRENT_WORLD = null;
function terrainHeight(wx, wz) {
  return CURRENT_WORLD ? CURRENT_WORLD.sampleHeight(wx, wz) : 0;
}

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

class World {
  constructor(scene, seed) {
    this.scene = scene;
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.noise = makeNoise(this.rng);
    this.time = 0;
    this.group = new THREE.Group();
    scene.add(this.group);
    clearObstacles();

    this.mats = {
      bark: ps1Material({ map: TEX.bark, uvScale: new THREE.Vector2(2, 2), occlusionFade: true }),
      leaves: ps1Material({ map: TEX.leaves, uvScale: new THREE.Vector2(3, 3), occlusionFade: true }),
      autumn: ps1Material({ map: TEX.leavesAutumn, uvScale: new THREE.Vector2(3, 3), occlusionFade: true }),
      pine: ps1Material({ map: TEX.pine, uvScale: new THREE.Vector2(2, 2), occlusionFade: true }),
      rock: ps1Material({ map: TEX.rock, uvScale: new THREE.Vector2(1.5, 1.5), occlusionFade: true }),
      grass: ps1Material({ map: TEX.grassTuft, doubleSide: true }),
      flower: ps1Material({ map: TEX.flower, doubleSide: true }),
    };
    this.geoVariants = new Map();

    this.buildHeights();
    CURRENT_WORLD = this;
    this.buildSky();
    this.buildTerrain();
    this.buildOcean();
    this.scatter();
  }

  rawHeight(x, z) {
    const { fbm } = this.noise;
    const r = Math.hypot(x, z);
    const coastR = PLAY_R + 12 + fbm(x * 0.02 + 50, z * 0.02 + 50, 3) * 14;
    const land = 1 - smooth(coastR - 8, coastR + 6, r);

    let h = fbm(x * 0.03, z * 0.03, 4) * 2.8 + 0.7;
    const ridge = Math.max(0, fbm(x * 0.013 + 200, z * 0.013 - 90, 3));
    h += ridge * ridge * 14 * smooth(15, 35, r);

    h = h * land - 4.5 * (1 - land);
    if (r < PLAY_R) h = Math.max(h, WATER_Y + 0.35);
    // Gentle clearing where the run starts.
    return lerp(0.4, h, smooth(4, 14, r));
  }

  buildHeights() {
    const n = TERRAIN_SEGS + 1;
    this.heights = new Float32Array(n * n);
    const step = TERRAIN_SIZE / TERRAIN_SEGS;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        this.heights[j * n + i] = this.rawHeight(-TERRAIN_SIZE / 2 + i * step, -TERRAIN_SIZE / 2 + j * step);
      }
    }
  }

  sampleHeight(x, z) {
    const n = TERRAIN_SEGS + 1;
    const fx = clamp((x + TERRAIN_SIZE / 2) / TERRAIN_SIZE * TERRAIN_SEGS, 0, TERRAIN_SEGS - 0.001);
    const fz = clamp((z + TERRAIN_SIZE / 2) / TERRAIN_SIZE * TERRAIN_SEGS, 0, TERRAIN_SEGS - 0.001);
    const i = Math.floor(fx), j = Math.floor(fz);
    const u = fx - i, v = fz - j;
    const h = this.heights;
    const a = h[j * n + i], b = h[j * n + i + 1], c = h[(j + 1) * n + i], d = h[(j + 1) * n + i + 1];
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }

  buildSky() {
    const sunDir = new THREE.Vector3(0, 0.02, -1).normalize();
    const mat = new THREE.ShaderMaterial({
      uniforms: { sunDir: { value: sunDir } },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 sunDir;
        varying vec3 vDir;
        ${PS1_DITHER_GLSL}
        void main() {
          vec3 d = normalize(vDir);
          float y = d.y;
          vec3 top = vec3(0.20, 0.03, 0.10);
          vec3 mid = vec3(0.72, 0.14, 0.08);
          vec3 low = vec3(1.00, 0.45, 0.10);
          vec3 hor = vec3(1.00, 0.78, 0.30);
          vec3 c = mix(hor, low, smoothstep(0.0, 0.05, y));
          c = mix(c, mid, smoothstep(0.05, 0.22, y));
          c = mix(c, top, smoothstep(0.22, 0.65, y));
          if (y < 0.0) c = mix(hor * 0.5, vec3(0.06, 0.04, 0.08), smoothstep(0.0, 0.08, -y));
          float s = max(dot(d, sunDir), 0.0);
          c += vec3(1.0, 0.45, 0.1) * pow(s, 30.0) * 0.7;
          c = mix(c, vec3(1.0, 0.93, 0.65), smoothstep(0.9975, 0.999, s));
          float a = atan(d.x, d.z);
          float band = sin(y * 80.0 + sin(a * 3.0) * 2.5 + sin(a * 7.0) * 0.6);
          float cloud = smoothstep(0.55, 1.0, band) * smoothstep(0.03, 0.08, y) * (1.0 - smoothstep(0.28, 0.45, y));
          c = mix(c, c * 0.5 + vec3(0.12, 0.0, 0.04), cloud * 0.75);
          gl_FragColor = vec4(ps1Quantize(c), 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(250, 24, 16), mat);
    this.sky.renderOrder = -1;
    this.group.add(this.sky);
  }

  buildTerrain() {
    const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGS, TERRAIN_SEGS);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const n = TERRAIN_SEGS + 1;
    for (let k = 0; k < pos.count; k++) {
      // PlaneGeometry rows run +y -> -y before rotation, i.e. -z -> +z after.
      const i = k % n, j = Math.floor(k / n);
      const h = this.heights[j * n + i];
      pos.setY(k, h);
      const dry = smooth(2.5, 7, h);              // higher ground is drier/yellower
      const wet = h < WATER_Y + 0.5 ? 0.55 : 1;   // darken the waterline
      const shade = (0.85 + 0.25 * this.rng()) * wet;
      colors[k * 3] = shade * (1 + dry * 0.35);
      colors[k * 3 + 1] = shade * (1 - dry * 0.05);
      colors[k * 3 + 2] = shade * (1 - dry * 0.3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const uv = TERRAIN_SIZE / 4.2;
    this.mats.terrain = ps1Material({ map: TEX.grass, uvScale: new THREE.Vector2(uv, uv), vertexColors: true });
    this.group.add(new THREE.Mesh(geo, this.mats.terrain));
  }

  buildOcean() {
    const geo = new THREE.PlaneGeometry(600, 600, 48, 48);
    geo.rotateX(-Math.PI / 2);
    this.waterMat = ps1Material({ map: TEX.water, uvScale: new THREE.Vector2(84, 84) });
    this.waterMat.uniforms.fogNear.value = 40;
    this.waterMat.uniforms.fogFar.value = 180;
    const water = new THREE.Mesh(geo, this.waterMat);
    water.position.y = WATER_Y;
    this.group.add(water);
  }

  // A handful of pre-jittered geometry variants per shape, shared between
  // all trees/rocks that use them.
  variant(kind, index, make) {
    const key = kind + index;
    if (!this.geoVariants.has(key)) this.geoVariants.set(key, make(index));
    return this.geoVariants.get(key);
  }

  addTree(wx, wz, scale, style) {
    const r = this.rng;
    const g = new THREE.Group();
    const trunkH = style === "pine" ? 2.2 : 3.2;
    const trunk = new THREE.Mesh(
      this.variant("trunk", 0, () => new THREE.CylinderGeometry(0.22, 0.38, 3.2, 6, 2)),
      this.mats.bark
    );
    trunk.position.y = trunkH / 2;
    trunk.scale.y = trunkH / 3.2;
    g.add(trunk);

    if (style === "pine") {
      for (let i = 0; i < 3; i++) {
        const cone = new THREE.Mesh(
          this.variant("pine", i, (k) => jitterGeometry(new THREE.ConeGeometry(1.7 - k * 0.45, 2.0, 7, 1), 0.08, k)),
          this.mats.pine
        );
        cone.position.y = 2.2 + i * 1.2;
        g.add(cone);
      }
    } else {
      const v = Math.floor(r() * 5);
      const mat = style === "autumn" ? this.mats.autumn : this.mats.leaves;
      const crown = new THREE.Mesh(
        this.variant("crown", v, (k) => jitterGeometry(new THREE.IcosahedronGeometry(1.9, 1), 0.18, k * 13 + 1)),
        mat
      );
      crown.position.y = 4.2;
      crown.scale.set(1, 1.1 + r() * 0.2, 1);
      g.add(crown);
      if (r() < 0.5) {
        const crown2 = new THREE.Mesh(
          this.variant("crown2", v, (k) => jitterGeometry(new THREE.IcosahedronGeometry(1.3, 1), 0.2, k * 7 + 3)),
          mat
        );
        crown2.position.set(0.9, 3.3, 0.6);
        g.add(crown2);
      }
    }

    g.position.set(wx, this.sampleHeight(wx, wz) - 0.1, wz);
    g.scale.setScalar(scale);
    g.rotation.y = r() * Math.PI * 2;
    this.group.add(g);
    if (Math.hypot(wx, wz) < PLAY_R) {
      addObstacle({ x: wx / WORLD_SCALE, y: wz / WORLD_SCALE, r: 0.45 * scale / WORLD_SCALE });
    }
  }

  addRock(wx, wz, scale) {
    const rock = new THREE.Mesh(
      this.variant("rock", Math.floor(this.rng() * 5), (k) => jitterGeometry(new THREE.DodecahedronGeometry(1.2, 0), 0.22, k * 31 + 5)),
      this.mats.rock
    );
    rock.position.set(wx, this.sampleHeight(wx, wz) + 0.2 * scale, wz);
    rock.scale.set(scale * (1 + this.rng() * 0.5), scale * 0.8, scale);
    rock.rotation.y = this.rng() * Math.PI * 2;
    this.group.add(rock);
    if (Math.hypot(wx, wz) < PLAY_R) {
      addObstacle({ x: wx / WORLD_SCALE, y: wz / WORLD_SCALE, r: 1.2 * scale / WORLD_SCALE });
    }
  }

  addBush(wx, wz, scale) {
    const bush = new THREE.Mesh(
      this.variant("bush", Math.floor(this.rng() * 5), (k) => jitterGeometry(new THREE.IcosahedronGeometry(0.8, 1), 0.2, k * 17 + 9)),
      this.rng() < 0.2 ? this.mats.autumn : this.mats.leaves
    );
    bush.position.set(wx, this.sampleHeight(wx, wz) + 0.35 * scale, wz);
    bush.scale.set(scale * 1.3, scale * 0.8, scale * 1.2);
    this.group.add(bush);
  }

  scatter() {
    const { fbm } = this.noise;
    const r = this.rng;
    const step = 5.2;
    const limit = PLAY_R + 14;
    for (let x = -limit; x <= limit; x += step) {
      for (let z = -limit; z <= limit; z += step) {
        const wx = x + (r() - 0.5) * step * 0.85;
        const wz = z + (r() - 0.5) * step * 0.85;
        const d = Math.hypot(wx, wz);
        if (d < 9 || d > limit) continue;
        const h = this.sampleHeight(wx, wz);
        if (h < WATER_Y + 0.4) continue;

        const forest = fbm(wx * 0.045 + 300, wz * 0.045 + 300, 3);
        const rocky = fbm(wx * 0.06 - 200, wz * 0.06 + 100, 2);
        const roll = r();
        const treeChance = forest > 0.18 ? 0.7 : forest > -0.05 ? 0.2 : 0.04;
        const rockChance = rocky > 0.25 ? 0.45 : 0.04;

        if (roll < treeChance) {
          const style = h > 4.5 ? "pine" : forest > 0.3 && r() < 0.35 ? "autumn" : r() < 0.12 ? "pine" : "round";
          this.addTree(wx, wz, 0.9 + r() * 0.6, style);
        } else if (roll < treeChance + rockChance) {
          this.addRock(wx, wz, 0.7 + r() * 1.1);
        } else if (roll < treeChance + rockChance + 0.18) {
          this.addBush(wx, wz, 0.7 + r() * 0.6);
        }
      }
    }
    this.scatterGround();
  }

  // Grass tufts and flowers: two crossed instanced quads each.
  scatterGround() {
    const { fbm } = this.noise;
    const place = (count, mat, geo, accept) => {
      const r = this.rng;
      const pts = [];
      for (let tries = 0; pts.length < count && tries < count * 4; tries++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * (PLAY_R + 10);
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        const h = this.sampleHeight(x, z);
        if (h < WATER_Y + 0.4 || !accept(x, z)) continue;
        pts.push([x, h, z, r() * Math.PI, 0.7 + r() * 0.8]);
      }
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      for (let pass = 0; pass < 2; pass++) {
        const mesh = new THREE.InstancedMesh(geo, mat, pts.length);
        pts.forEach(([x, h, z, rot, sc], i) => {
          p.set(x, h - 0.05, z);
          q.setFromAxisAngle(up, rot + pass * Math.PI / 2);
          s.set(sc, sc, sc);
          m.compose(p, q, s);
          mesh.setMatrixAt(i, m);
        });
        this.group.add(mesh);
      }
    };
    const tuft = new THREE.PlaneGeometry(0.9, 0.7);
    tuft.translate(0, 0.35, 0);
    this.geoVariants.set("tuftGeo", tuft);
    place(1400, this.mats.grass, tuft, () => true);
    const flower = new THREE.PlaneGeometry(0.6, 0.5);
    flower.translate(0, 0.25, 0);
    this.geoVariants.set("flowerGeo", flower);
    // Flowers gather in open meadows, away from forests.
    place(500, this.mats.flower, flower, (x, z) => fbm(x * 0.045 + 300, z * 0.045 + 300, 3) < -0.05);
  }

  update(dt, camera) {
    this.time += dt;
    this.sky.position.copy(camera.position);
    this.waterMat.uniforms.uvOffset.value.set(this.time * 0.02, this.time * 0.035);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    for (const g of this.geoVariants.values()) g.dispose();
    for (const m of Object.values(this.mats)) m.dispose();
    this.waterMat.dispose();
    this.sky.material.dispose();
    clearObstacles();
    if (CURRENT_WORLD === this) CURRENT_WORLD = null;
  }
}
