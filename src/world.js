// Procedurally generated arenas, one per biome. Each run gets a seed; the
// seed drives the coastline/walls, hills, and where forests, rocky patches
// and props go. Trees, rocks and other props inside the playable radius are
// cover: they're registered as obstacles (sim units) so characters collide
// with them and bullets stop.

const WATER_Y = -0.8;
const PLAY_R = ARENA_RADIUS * WORLD_SCALE;      // playable radius, world units
const TERRAIN_SIZE = Math.ceil((PLAY_R + 30) * 2);
const TERRAIN_SEGS = 170;

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
// Biomes
// ---------------------------------------------------------------------------

const BIOMES = {
  sunset: {
    terrain: "island", ground: "grass", sea: "ocean", flora: "island", particles: null,
    sky: { top: "#330818", mid: "#b8240f", low: "#ff7319", hor: "#ffc74d", below: "#0f0a14",
           sun: "#ffeea6", glow: "#ff731a", sunDir: [0, 0.02, -1], sunSize: 0.9975, cloud: 0.75, cloudTint: "#1f0008", stars: 0 },
    light: { dir: [0, 0.28, -1], color: "#ffb070", ambient: "#5a4a78", fill: "#6a6090", fog: "#5a2320", fogNear: 22, fogFar: 85 },
  },
  night: {
    terrain: "island", ground: "grass", sea: "ocean", seaTint: "#6a7aa8", flora: "island", lanterns: true, particles: "fireflies",
    sky: { top: "#02030a", mid: "#0a1030", low: "#16224a", hor: "#2a3c70", below: "#02030a",
           sun: "#eef4ff", glow: "#4a64a8", sunDir: [0.45, 0.32, -1], sunSize: 0.9988, cloud: 0.35, cloudTint: "#000008", stars: 1 },
    light: { dir: [0.4, 0.8, -0.6], color: "#9ab4f0", ambient: "#343c62", fill: "#46588a", fog: "#0a1024", fogNear: 18, fogFar: 75 },
  },
  cave: {
    terrain: "cave", ground: "caveFloor", sea: null, flora: "cave", particles: "motes",
    sky: { top: "#07070c", mid: "#0c0c16", low: "#12121e", hor: "#181828", below: "#040408",
           sun: "#000000", glow: "#000000", sunDir: [0, 1, 0], sunSize: 2, cloud: 0.5, cloudTint: "#030306", stars: 0 },
    light: { dir: [0.25, 1, 0.3], color: "#7686b8", ambient: "#2e2e4c", fill: "#3e3468", fog: "#0c0c18", fogNear: 16, fogFar: 62 },
  },
  hell: {
    terrain: "hell", ground: "ash", sea: "lava", flora: "hell", particles: "embers",
    sky: { top: "#1a0202", mid: "#6a0e04", low: "#c8300a", hor: "#ff7a2a", below: "#200000",
           sun: "#ff5a1a", glow: "#ff2a00", sunDir: [0, 0.12, -1], sunSize: 0.992, cloud: 0.95, cloudTint: "#140000", stars: 0 },
    light: { dir: [0, 0.5, -1], color: "#ff9464", ambient: "#6a3034", fill: "#6a3434", fog: "#2a0806", fogNear: 18, fogFar: 72 },
  },
};

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

class World {
  constructor(scene, seed, biomeId = "sunset") {
    this.scene = scene;
    this.seed = seed;
    this.biome = BIOMES[biomeId];
    this.biomeId = biomeId;
    this.rng = mulberry32(seed);
    this.noise = makeNoise(this.rng);
    this.time = 0;
    this.group = new THREE.Group();
    this.animated = []; // flickering flames etc.
    scene.add(this.group);
    clearObstacles();
    applyLighting(this.biome.light);

    const prop = (map, uv) => ps1Material({ map, uvScale: new THREE.Vector2(uv, uv), occlusionFade: true });
    const glow = (color) => ps1Material({ color, unlit: true, occlusionFade: true });
    this.mats = {
      bark: prop(TEX.bark, 2),
      leaves: prop(TEX.leaves, 3),
      autumn: prop(TEX.leavesAutumn, 3),
      pine: prop(TEX.pine, 2),
      rock: prop(TEX.rock, 1.5),
      caveRock: prop(TEX.caveFloor, 1.5),
      obsidian: prop(TEX.obsidian, 1.5),
      deadBark: prop(TEX.deadBark, 2),
      stone: prop(TEX.stone, 1),
      grass: ps1Material({ map: TEX.grassTuft, doubleSide: true }),
      moss: ps1Material({ map: TEX.grassTuft, doubleSide: true, color: "#5aa8a0" }),
      cinder: ps1Material({ map: TEX.grassTuft, doubleSide: true, color: "#b04a2a" }),
      flower: ps1Material({ map: TEX.flower, doubleSide: true }),
      lanternGlow: glow("#ffd27a"),
      crystalA: glow("#5af0ff"),
      crystalB: glow("#d07aff"),
      mushroom: glow("#6affc8"),
      flame: glow("#ffb02a"),
      flameCore: glow("#fff0a0"),
    };
    this.geoVariants = new Map();

    this.buildHeights();
    CURRENT_WORLD = this;
    this.buildSky();
    this.buildTerrain();
    this.buildSea();
    this.scatter();
    this.buildParticles();
  }

  // ---- Terrain --------------------------------------------------------------

  rawHeight(x, z) {
    const { fbm } = this.noise;
    const r = Math.hypot(x, z);
    const style = this.biome.terrain;
    let h;

    if (style === "cave") {
      // Gently rolling floor ringed by steep rock walls instead of a coast.
      h = fbm(x * 0.03, z * 0.03, 4) * 1.8 + 0.6;
      const wallR = PLAY_R + 4 + fbm(x * 0.03 + 70, z * 0.03 - 40, 3) * 8;
      h += smooth(wallR, wallR + 14, r) * 24;
    } else {
      const coastR = PLAY_R + 12 + fbm(x * 0.02 + 50, z * 0.02 + 50, 3) * 14;
      const land = 1 - smooth(coastR - 8, coastR + 6, r);
      h = fbm(x * 0.03, z * 0.03, 4) * 2.8 + 0.7;
      const ridge = Math.max(0, fbm(x * 0.013 + 200, z * 0.013 - 90, 3));
      if (style === "hell") {
        // Jagged, cracked badlands.
        h += Math.abs(fbm(x * 0.06, z * 0.06, 3)) * 2.2;
        h += ridge * ridge * 18 * smooth(15, 35, r);
      } else {
        h += ridge * ridge * 14 * smooth(15, 35, r);
      }
      h = h * land - 4.5 * (1 - land);
      if (r < PLAY_R) h = Math.max(h, WATER_Y + 0.35);
    }
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

  buildTerrain() {
    const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGS, TERRAIN_SEGS);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const n = TERRAIN_SEGS + 1;
    const style = this.biome.terrain;
    for (let k = 0; k < pos.count; k++) {
      const i = k % n, j = Math.floor(k / n);
      const h = this.heights[j * n + i];
      pos.setY(k, h);
      const shade = 0.85 + 0.25 * this.rng();
      let r = shade, g = shade, b = shade;
      if (style === "island") {
        const dry = smooth(2.5, 7, h);              // higher ground is drier/yellower
        const wet = h < WATER_Y + 0.5 ? 0.55 : 1;   // darken the waterline
        r *= (1 + dry * 0.35) * wet; g *= (1 - dry * 0.05) * wet; b *= (1 - dry * 0.3) * wet;
      } else if (style === "cave") {
        const wall = smooth(3, 12, h);              // walls fade to a bluer, darker stone
        r *= 1 - wall * 0.35; g *= 1 - wall * 0.25; b *= 1 - wall * 0.05;
      } else {
        const low = h < WATER_Y + 0.8 ? 1 : 0;      // scorched red near the lava
        r *= 1 + low * 0.6; g *= 1 - low * 0.3; b *= 1 - low * 0.4;
      }
      colors[k * 3] = r; colors[k * 3 + 1] = g; colors[k * 3 + 2] = b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const uv = TERRAIN_SIZE / 4.2;
    this.mats.terrain = ps1Material({ map: TEX[this.biome.ground], uvScale: new THREE.Vector2(uv, uv), vertexColors: true });
    this.group.add(new THREE.Mesh(geo, this.mats.terrain));
  }

  buildSea() {
    const kind = this.biome.sea;
    if (!kind) return;
    const geo = new THREE.PlaneGeometry(600, 600, 48, 48);
    geo.rotateX(-Math.PI / 2);
    this.seaMat = kind === "lava"
      ? ps1Material({ map: TEX.lava, uvScale: new THREE.Vector2(60, 60), unlit: true, fogNear: 40, fogFar: 200 })
      : ps1Material({ map: TEX.water, uvScale: new THREE.Vector2(84, 84), color: this.biome.seaTint || "#ffffff", fogNear: 40, fogFar: 180 });
    this.seaSpeed = kind === "lava" ? 0.008 : 0.03;
    const sea = new THREE.Mesh(geo, this.seaMat);
    sea.position.y = WATER_Y;
    this.group.add(sea);
  }

  buildSky() {
    const s = this.biome.sky;
    const col = (h) => ({ value: new THREE.Color(h) });
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        cTop: col(s.top), cMid: col(s.mid), cLow: col(s.low), cHor: col(s.hor), cBelow: col(s.below),
        sunColor: col(s.sun), glowColor: col(s.glow), cloudTint: col(s.cloudTint),
        sunDir: { value: new THREE.Vector3(...s.sunDir).normalize() },
        sunSize: { value: s.sunSize }, cloudAmt: { value: s.cloud }, stars: { value: s.stars }, time: { value: 0 },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 cTop, cMid, cLow, cHor, cBelow, sunColor, glowColor, cloudTint, sunDir;
        uniform float sunSize, cloudAmt, stars, time;
        varying vec3 vDir;
        ${PS1_DITHER_GLSL}
        float hash3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        void main() {
          vec3 d = normalize(vDir);
          float y = d.y;
          vec3 c = mix(cHor, cLow, smoothstep(0.0, 0.05, y));
          c = mix(c, cMid, smoothstep(0.05, 0.22, y));
          c = mix(c, cTop, smoothstep(0.22, 0.65, y));
          if (y < 0.0) c = mix(cHor * 0.5, cBelow, smoothstep(0.0, 0.08, -y));
          float s = max(dot(d, sunDir), 0.0);
          c += glowColor * pow(s, 30.0) * 0.7;
          c = mix(c, sunColor, smoothstep(sunSize, sunSize + 0.0015, s));
          // Long horizontal cloud / smoke / rock-strata bands.
          float a = atan(d.x, d.z);
          float band = sin(y * 80.0 + sin(a * 3.0) * 2.5 + sin(a * 7.0) * 0.6);
          float cloud = smoothstep(0.55, 1.0, band) * smoothstep(0.03, 0.08, y) * (1.0 - smoothstep(0.28, 0.45, y));
          c = mix(c, c * 0.5 + cloudTint, cloud * cloudAmt);
          if (stars > 0.5 && y > 0.04) {
            float h = hash3(floor(d * 240.0));
            float tw = 0.55 + 0.45 * sin(time * 2.5 + h * 60.0);
            c += vec3(step(0.9965, h)) * tw * smoothstep(0.04, 0.3, y);
          }
          gl_FragColor = vec4(ps1Quantize(c), 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(250, 24, 16), mat);
    this.sky.renderOrder = -1;
    this.group.add(this.sky);
  }

  // ---- Props ----------------------------------------------------------------

  // A handful of pre-jittered geometry variants per shape, shared between
  // every prop that uses them.
  variant(kind, index, make) {
    const key = kind + index;
    if (!this.geoVariants.has(key)) this.geoVariants.set(key, make(index));
    return this.geoVariants.get(key);
  }

  place(obj, wx, wz, yOffset = 0) {
    obj.position.set(wx, this.sampleHeight(wx, wz) + yOffset, wz);
    this.group.add(obj);
    return obj;
  }

  collide(wx, wz, rWorld) {
    if (Math.hypot(wx, wz) < PLAY_R) addObstacle({ x: wx / WORLD_SCALE, y: wz / WORLD_SCALE, r: rWorld / WORLD_SCALE });
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
    g.scale.setScalar(scale);
    g.rotation.y = r() * Math.PI * 2;
    this.place(g, wx, wz, -0.1);
    this.collide(wx, wz, 0.45 * scale);
  }

  addRock(wx, wz, scale, mat = this.mats.rock) {
    const rock = new THREE.Mesh(
      this.variant("rock", Math.floor(this.rng() * 5), (k) => jitterGeometry(new THREE.DodecahedronGeometry(1.2, 0), 0.22, k * 31 + 5)),
      mat
    );
    rock.scale.set(scale * (1 + this.rng() * 0.5), scale * 0.8, scale);
    rock.rotation.y = this.rng() * Math.PI * 2;
    this.place(rock, wx, wz, 0.2 * scale);
    this.collide(wx, wz, 1.2 * scale);
  }

  addBush(wx, wz, scale) {
    const bush = new THREE.Mesh(
      this.variant("bush", Math.floor(this.rng() * 5), (k) => jitterGeometry(new THREE.IcosahedronGeometry(0.8, 1), 0.2, k * 17 + 9)),
      this.rng() < 0.2 ? this.mats.autumn : this.mats.leaves
    );
    bush.scale.set(scale * 1.3, scale * 0.8, scale * 1.2);
    this.place(bush, wx, wz, 0.35 * scale);
  }

  // Japanese stone lantern with a warm glowing window (night).
  addLantern(wx, wz) {
    const g = new THREE.Group();
    const part = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; g.add(m); return m; };
    part(this.variant("lb", 0, () => new THREE.BoxGeometry(0.7, 0.2, 0.7)), this.mats.stone, 0.1);
    part(this.variant("lp", 0, () => new THREE.BoxGeometry(0.25, 0.9, 0.25)), this.mats.stone, 0.65);
    part(this.variant("lh", 0, () => new THREE.BoxGeometry(0.55, 0.45, 0.55)), this.mats.stone, 1.3);
    part(this.variant("lw", 0, () => new THREE.BoxGeometry(0.58, 0.22, 0.58)), this.mats.lanternGlow, 1.32);
    part(this.variant("lr", 0, () => new THREE.ConeGeometry(0.62, 0.4, 4)), this.mats.stone, 1.75).rotation.y = Math.PI / 4;
    g.rotation.y = this.rng() * Math.PI;
    this.place(g, wx, wz);
    this.collide(wx, wz, 0.4);
  }

  addStalagmite(wx, wz, scale) {
    const s = new THREE.Mesh(
      this.variant("stal", Math.floor(this.rng() * 4), (k) => jitterGeometry(new THREE.ConeGeometry(0.9, 4, 6, 3), 0.12, k * 11 + 2)),
      this.mats.caveRock
    );
    s.scale.set(scale, scale * (0.7 + this.rng() * 0.8), scale);
    this.place(s, wx, wz, 1.6 * s.scale.y);
    this.collide(wx, wz, 0.75 * scale);
  }

  addCrystals(wx, wz, scale) {
    const g = new THREE.Group();
    const mat = this.rng() < 0.5 ? this.mats.crystalA : this.mats.crystalB;
    const geo = this.variant("crys", 0, () => new THREE.OctahedronGeometry(0.35, 0));
    const n = 3 + Math.floor(this.rng() * 3);
    for (let i = 0; i < n; i++) {
      const c = new THREE.Mesh(geo, mat);
      c.scale.set(0.7, 2 + this.rng() * 2.2, 0.7);
      c.position.set((this.rng() - 0.5) * 0.9, 0.5, (this.rng() - 0.5) * 0.9);
      c.rotation.set((this.rng() - 0.5) * 0.8, this.rng() * 3, (this.rng() - 0.5) * 0.8);
      g.add(c);
    }
    g.scale.setScalar(scale);
    this.place(g, wx, wz);
    this.collide(wx, wz, 0.6 * scale);
  }

  addMushroom(wx, wz, scale) {
    const g = new THREE.Group();
    const stem = new THREE.Mesh(this.variant("mstem", 0, () => new THREE.CylinderGeometry(0.08, 0.12, 0.6, 5)), this.mats.stone);
    stem.position.y = 0.3;
    const cap = new THREE.Mesh(this.variant("mcap", 0, () => new THREE.SphereGeometry(0.35, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2)), this.mats.mushroom);
    cap.position.y = 0.55;
    g.add(stem, cap);
    g.scale.setScalar(scale);
    this.place(g, wx, wz);
  }

  // Massive floor-to-ceiling column — sells the "huge cavern" scale.
  addPillar(wx, wz, scale) {
    const p = new THREE.Mesh(
      this.variant("pillar", Math.floor(this.rng() * 3), (k) => jitterGeometry(new THREE.CylinderGeometry(1.6, 2.4, 30, 8, 6), 0.1, k * 5 + 1)),
      this.mats.caveRock
    );
    p.scale.setScalar(scale);
    this.place(p, wx, wz, 14 * scale);
    this.collide(wx, wz, 2.2 * scale);
  }

  addDeadTree(wx, wz, scale) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(this.variant("dtrunk", 0, () => jitterGeometry(new THREE.CylinderGeometry(0.15, 0.35, 3.4, 5, 3), 0.1, 4)), this.mats.deadBark);
    trunk.position.y = 1.7;
    g.add(trunk);
    const branch = this.variant("dbranch", 0, () => new THREE.CylinderGeometry(0.05, 0.1, 1.4, 4));
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(branch, this.mats.deadBark);
      const a = (i / 4) * Math.PI * 2 + this.rng();
      b.position.set(Math.cos(a) * 0.45, 2.2 + i * 0.35, Math.sin(a) * 0.45);
      b.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
      g.add(b);
    }
    g.scale.setScalar(scale);
    g.rotation.y = this.rng() * Math.PI * 2;
    this.place(g, wx, wz);
    this.collide(wx, wz, 0.35 * scale);
  }

  addObsidian(wx, wz, scale) {
    const s = new THREE.Mesh(
      this.variant("obs", Math.floor(this.rng() * 4), (k) => jitterGeometry(new THREE.ConeGeometry(0.8, 3.5, 5, 2), 0.15, k * 9 + 7)),
      this.mats.obsidian
    );
    s.scale.set(scale, scale * (0.8 + this.rng() * 0.9), scale);
    s.rotation.set((this.rng() - 0.5) * 0.5, this.rng() * 3, (this.rng() - 0.5) * 0.5);
    this.place(s, wx, wz, 1.3 * s.scale.y);
    this.collide(wx, wz, 0.65 * scale);
  }

  // Stone brazier with a flickering flame (animated in update()).
  addBrazier(wx, wz) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(this.variant("bpost", 0, () => new THREE.BoxGeometry(0.4, 1.3, 0.4)), this.mats.obsidian);
    post.position.y = 0.65;
    const bowl = new THREE.Mesh(this.variant("bbowl", 0, () => new THREE.CylinderGeometry(0.55, 0.35, 0.35, 6)), this.mats.obsidian);
    bowl.position.y = 1.45;
    const flame = new THREE.Mesh(this.variant("bflame", 0, () => new THREE.ConeGeometry(0.4, 1, 5)), this.mats.flame);
    flame.position.y = 2.05;
    const core = new THREE.Mesh(this.variant("bcore", 0, () => new THREE.ConeGeometry(0.2, 0.6, 5)), this.mats.flameCore);
    core.position.y = 1.9;
    g.add(post, bowl, flame, core);
    this.place(g, wx, wz);
    this.collide(wx, wz, 0.45);
    this.animated.push({ obj: flame, phase: this.rng() * 10 }, { obj: core, phase: this.rng() * 10 });
  }

  scatter() {
    const { fbm } = this.noise;
    const r = this.rng;
    const flora = this.biome.flora;
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
        if (flora === "cave" && h > 4) continue; // not up the walls

        const dense = fbm(wx * 0.045 + 300, wz * 0.045 + 300, 3);
        const rocky = fbm(wx * 0.06 - 200, wz * 0.06 + 100, 2);
        const roll = r();
        const treeChance = dense > 0.18 ? 0.7 : dense > -0.05 ? 0.2 : 0.04;
        const rockChance = rocky > 0.25 ? 0.45 : 0.04;

        if (flora === "island") {
          if (roll < treeChance) {
            const style = h > 4.5 ? "pine" : dense > 0.3 && r() < 0.35 ? "autumn" : r() < 0.12 ? "pine" : "round";
            this.addTree(wx, wz, 0.9 + r() * 0.6, style);
          } else if (roll < treeChance + rockChance) this.addRock(wx, wz, 0.7 + r() * 1.1);
          else if (roll < treeChance + rockChance + 0.18) this.addBush(wx, wz, 0.7 + r() * 0.6);
          else if (this.biome.lanterns && roll > 0.975) this.addLantern(wx, wz);
        } else if (flora === "cave") {
          if (roll < treeChance * 0.5) this.addStalagmite(wx, wz, 0.7 + r() * 0.9);
          else if (roll < treeChance * 0.5 + rockChance) this.addRock(wx, wz, 0.7 + r() * 1.2, this.mats.caveRock);
          else if (roll < treeChance * 0.5 + rockChance + 0.07) this.addCrystals(wx, wz, 0.8 + r() * 0.8);
          else if (roll < treeChance * 0.5 + rockChance + 0.2) this.addMushroom(wx, wz, 0.8 + r() * 1.2);
        } else {
          if (roll < treeChance * 0.45) this.addDeadTree(wx, wz, 0.9 + r() * 0.6);
          else if (roll < treeChance * 0.45 + rockChance * 0.7) this.addObsidian(wx, wz, 0.7 + r() * 0.9);
          else if (roll < treeChance * 0.45 + rockChance * 0.7 + 0.1) this.addRock(wx, wz, 0.6 + r() * 1.0, this.mats.obsidian);
          else if (roll > 0.982) this.addBrazier(wx, wz);
        }
      }
    }
    if (flora === "cave") {
      for (let i = 0; i < 9; i++) {
        const a = r() * Math.PI * 2, d = 18 + r() * (PLAY_R - 25);
        this.addPillar(Math.cos(a) * d, Math.sin(a) * d, 0.8 + r() * 0.6);
      }
    }
    this.scatterGround();
  }

  // Ground cover: two crossed instanced quads each.
  scatterGround() {
    const { fbm } = this.noise;
    const flora = this.biome.flora;
    const placeTufts = (count, mat, geo, accept) => {
      const r = this.rng;
      const pts = [];
      for (let tries = 0; pts.length < count && tries < count * 4; tries++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * (PLAY_R + 10);
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        const h = this.sampleHeight(x, z);
        if (h < WATER_Y + 0.4 || (flora === "cave" && h > 4) || !accept(x, z)) continue;
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
    const cover = flora === "cave" ? this.mats.moss : flora === "hell" ? this.mats.cinder : this.mats.grass;
    placeTufts(flora === "island" ? 2000 : 900, cover, tuft, () => true);
    if (flora === "island") {
      const flower = new THREE.PlaneGeometry(0.6, 0.5);
      flower.translate(0, 0.25, 0);
      this.geoVariants.set("flowerGeo", flower);
      // Flowers gather in open meadows, away from forests.
      placeTufts(700, this.mats.flower, flower, (x, z) => fbm(x * 0.045 + 300, z * 0.045 + 300, 3) < -0.05);
    }
  }

  // ---- Ambient particles (fireflies / cave motes / hell embers) -------------

  buildParticles() {
    const kind = this.biome.particles;
    if (!kind) return;
    const count = kind === "embers" ? 260 : 160;
    const color = { fireflies: "#d8ff6a", motes: "#9ad8ff", embers: "#ff8a2a" }[kind];
    this.ambient = {
      kind,
      mesh: new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), ps1Material({ color, unlit: true }), count),
      pts: Array.from({ length: count }, () => ({
        x: (this.rng() - 0.5) * 50, y: this.rng() * 8, z: (this.rng() - 0.5) * 50,
        phase: this.rng() * 10, speed: 0.4 + this.rng() * 0.8,
      })),
    };
    this.ambient.mesh.frustumCulled = false;
    this.group.add(this.ambient.mesh);
  }

  updateParticles(dt, focus) {
    const a = this.ambient;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const t = this.time;
    a.pts.forEach((pt, i) => {
      if (a.kind === "embers") {
        pt.y += dt * pt.speed * 2.2;
        pt.x += Math.sin(t * 1.3 + pt.phase) * dt * 0.6;
        if (pt.y > 12) pt.y = 0;
      } else {
        pt.x += Math.sin(t * pt.speed + pt.phase) * dt * 0.8;
        pt.z += Math.cos(t * pt.speed * 0.8 + pt.phase) * dt * 0.8;
        pt.y += Math.sin(t * 0.7 + pt.phase) * dt * 0.3;
      }
      // Keep the cloud centred on the player by wrapping it around them.
      const wrap = (v, c) => c + ((((v - c) + 25) % 50) + 50) % 50 - 25;
      pt.x = wrap(pt.x, focus.x);
      pt.z = wrap(pt.z, focus.z);
      const ground = this.sampleHeight(pt.x, pt.z);
      const blink = a.kind === "fireflies" ? Math.max(0, Math.sin(t * 2 + pt.phase * 3)) : 1;
      const size = (a.kind === "embers" ? 0.07 : 0.08) * (0.4 + blink * 0.6);
      p.set(pt.x, ground + 0.3 + pt.y * (a.kind === "fireflies" ? 0.35 : 1), pt.z);
      s.set(size, size, size);
      m.compose(p, q, s);
      a.mesh.setMatrixAt(i, m);
    });
    a.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt, camera, focus) {
    this.time += dt;
    this.sky.position.copy(camera.position);
    this.sky.material.uniforms.time.value = this.time;
    if (this.seaMat) this.seaMat.uniforms.uvOffset.value.set(this.time * this.seaSpeed * 0.7, this.time * this.seaSpeed);
    for (const f of this.animated) {
      const k = 1 + Math.sin(this.time * 12 + f.phase) * 0.15 + Math.sin(this.time * 7.3 + f.phase) * 0.1;
      f.obj.scale.set(1, k, 1);
    }
    if (this.ambient && focus) this.updateParticles(dt, focus);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    for (const g of this.geoVariants.values()) g.dispose();
    for (const m of Object.values(this.mats)) m.dispose();
    if (this.seaMat) this.seaMat.dispose();
    if (this.ambient) this.ambient.mesh.material.dispose();
    this.sky.material.dispose();
    clearObstacles();
    if (CURRENT_WORLD === this) CURRENT_WORLD = null;
  }
}
