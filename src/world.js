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

// Obstacles are circles { x, y, r } or oriented boxes (walls, buildings):
// { x, y, hw, hh, c, s, r } — half extents, cos/sin of the rotation, and a
// bounding radius r for cheap rejection and grid registration.
function addBoxObstacle(x, y, hw, hh, angle) {
  const o = { x, y, hw, hh, c: Math.cos(angle), s: Math.sin(angle), r: Math.hypot(hw, hh) };
  addObstacle(o);
  return o;
}

function obstacleHit(o, x, y, rad) {
  const dx = x - o.x, dy = y - o.y;
  const reach = o.r + rad;
  if (dx * dx + dy * dy > reach * reach) return false;
  if (!o.hw) return true;
  const lx = dx * o.c + dy * o.s, ly = -dx * o.s + dy * o.c;
  const qx = lx - clamp(lx, -o.hw, o.hw), qy = ly - clamp(ly, -o.hh, o.hh);
  return qx * qx + qy * qy < rad * rad;
}

// Where a body of radius `rad` at (x, y) must move to stop overlapping `o`,
// plus the surface normal there. Null when it doesn't overlap.
function obstaclePush(o, x, y, rad) {
  const dx = x - o.x, dy = y - o.y;
  if (!o.hw) {
    const dd = Math.hypot(dx, dy), min = o.r + rad;
    if (dd >= min || dd < 0.001) return null;
    return { x: o.x + (dx / dd) * min, y: o.y + (dy / dd) * min, nx: dx / dd, ny: dy / dd };
  }
  if (dx * dx + dy * dy > (o.r + rad) * (o.r + rad)) return null;
  const lx = dx * o.c + dy * o.s, ly = -dx * o.s + dy * o.c;
  const cx = clamp(lx, -o.hw, o.hw), cy = clamp(ly, -o.hh, o.hh);
  const qx = lx - cx, qy = ly - cy;
  const d = Math.hypot(qx, qy);
  let nlx, nly, px, py;
  if (d > 0.001) {
    if (d >= rad) return null;
    nlx = qx / d; nly = qy / d;
    px = cx + nlx * rad; py = cy + nly * rad;
  } else if (o.hw - Math.abs(lx) < o.hh - Math.abs(ly)) {
    // Centre is inside the box: leave through the nearest face.
    nlx = Math.sign(lx) || 1; nly = 0;
    px = nlx * (o.hw + rad); py = ly;
  } else {
    nlx = 0; nly = Math.sign(ly) || 1;
    px = lx; py = nly * (o.hh + rad);
  }
  return {
    x: o.x + px * o.c - py * o.s, y: o.y + px * o.s + py * o.c,
    nx: nlx * o.c - nly * o.s, ny: nlx * o.s + nly * o.c,
  };
}

// Does the segment pass within `pad` of the obstacle?
function segmentHitsObstacle(o, x1, y1, x2, y2, pad) {
  if (pointSegDist(o.x, o.y, x1, y1, x2, y2) > o.r + pad) return false;
  if (!o.hw) return true;
  // Slab test against the box (inflated by pad) in its local frame.
  const ax = (x1 - o.x) * o.c + (y1 - o.y) * o.s, ay = -(x1 - o.x) * o.s + (y1 - o.y) * o.c;
  const bx = (x2 - o.x) * o.c + (y2 - o.y) * o.s, by = -(x2 - o.x) * o.s + (y2 - o.y) * o.c;
  let t0 = 0, t1 = 1;
  for (const [a, b, h] of [[ax, bx, o.hw + pad], [ay, by, o.hh + pad]]) {
    const d = b - a;
    if (Math.abs(d) < 1e-6) {
      if (Math.abs(a) > h) return false;
      continue;
    }
    let ta = (-h - a) / d, tb = (h - a) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

function blockedAt(x, y, rad) {
  for (const o of obstaclesNear(x, y)) if (obstacleHit(o, x, y, rad)) return true;
  return false;
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
      // Structures compute their own world-space UVs, so no uvScale here.
      stoneWall: prop(TEX.stoneWall, 1),
      caveWall: prop(TEX.caveWall, 1),
      obsidianWall: prop(TEX.obsidianWall, 1),
      planks: prop(TEX.planks, 1),
      roofTiles: ps1Material({ map: TEX.roofTiles, doubleSide: true, occlusionFade: true }),
      thatch: ps1Material({ map: TEX.thatch, doubleSide: true, occlusionFade: true }),
      plankRoof: ps1Material({ map: TEX.planks, doubleSide: true, occlusionFade: true }),
      obsidianRoof: ps1Material({ map: TEX.obsidianWall, doubleSide: true, occlusionFade: true }),
      torii: ps1Material({ map: TEX.wood, color: "#ff5a3a", occlusionFade: true }),
      windowDark: ps1Material({ color: "#1a1014", occlusionFade: true }),
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

    this.planLayout();
    this.buildHeights();
    CURRENT_WORLD = this;
    this.buildSky();
    this.buildTerrain();
    this.buildSea();
    this.buildStructures();
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
      h += Math.max(0, fbm(x * 0.024 + 40, z * 0.024 - 70, 3)) * 3;
      const wallR = PLAY_R + 4 + fbm(x * 0.03 + 70, z * 0.03 - 40, 3) * 8;
      h += smooth(wallR, wallR + 14, r) * 24;
    } else {
      const coastR = PLAY_R + 12 + fbm(x * 0.02 + 50, z * 0.02 + 50, 3) * 14;
      const land = 1 - smooth(coastR - 8, coastR + 6, r);
      h = fbm(x * 0.03, z * 0.03, 4) * 2.8 + 0.7;
      // Rolling hills across the whole island, not just the ridges.
      h += Math.max(0, fbm(x * 0.024 + 40, z * 0.024 - 70, 3)) * 6;
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
    h = this.shapeHeight(x, z, h);
    // Gentle clearing where the run starts.
    return lerp(0.4, h, smooth(4, 14, r));
  }

  // Layout features carved into the terrain: steep rocky knolls, and flat
  // pads under buildings.
  shapeHeight(x, z, h) {
    for (const k of this.knolls) {
      const d = Math.hypot(x - k.x, z - k.z);
      if (d < k.outer) h += k.h * (1 - smooth(k.core, k.outer, d));
    }
    for (const p of this.pads) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r + 4) h = lerp(p.h, h, smooth(p.r, p.r + 4, d));
    }
    return h;
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
      // Steep slopes (knolls, ridges) darken and grey out like rock faces.
      const hx = this.heights[j * n + Math.min(n - 1, i + 1)] - this.heights[j * n + Math.max(0, i - 1)];
      const hz = this.heights[Math.min(n - 1, j + 1) * n + i] - this.heights[Math.max(0, j - 1) * n + i];
      const steep = smooth(1.2, 3.2, Math.hypot(hx, hz) / (2 * TERRAIN_SIZE / TERRAIN_SEGS));
      if (steep > 0) {
        const grey = (r + g + b) / 3 * 0.7;
        r = lerp(r, grey, steep * 0.7); g = lerp(g, grey, steep * 0.7); b = lerp(b, grey * 1.05, steep * 0.7);
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

  // ---- Layout: knolls, zig-zag walls and buildings ---------------------------

  inFootprint(x, z, pad = 0) {
    for (const f of this.footprints) {
      const dx = x - f.x, dz = z - f.z, rr = f.r + pad;
      if (dx * dx + dz * dz < rr * rr) return true;
    }
    return false;
  }

  // Decide where everything goes (before the heightmap is built, since knolls
  // and building pads reshape the terrain).
  planLayout() {
    const r = this.rng;
    const style = this.biome.terrain;
    const cfg = {
      island: { knolls: 11, knollH: [4, 8], walls: 8, buildings: 8 },
      cave:   { knolls: 8,  knollH: [3, 6], walls: 9, buildings: 7 },
      hell:   { knolls: 10, knollH: [5, 10], walls: 9, buildings: 8 },
    }[style];
    this.knolls = [];
    this.pads = [];
    this.footprints = [];
    this.wallPlans = [];
    this.buildingPlans = [];

    const free = (x, z, rad) => {
      const d = Math.hypot(x, z);
      return d > 16 + rad && d < PLAY_R - rad - 6 && !this.inFootprint(x, z, rad + 3);
    };
    const spot = (rad) => {
      for (let t = 0; t < 40; t++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * PLAY_R;
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (free(x, z, rad)) return { x, z };
      }
      return null;
    };

    // Knolls: steep, flat-topped rocky hills you can duck behind.
    for (let i = 0; i < cfg.knolls; i++) {
      const core = 3 + r() * 3.5;
      const s = spot(core * 1.8);
      if (!s) continue;
      const h = cfg.knollH[0] + r() * (cfg.knollH[1] - cfg.knollH[0]);
      this.knolls.push({ x: s.x, z: s.z, core, outer: core * 1.8, h });
      this.footprints.push({ x: s.x, z: s.z, r: core * 1.8 });
    }

    // Buildings (and ruins) sit on flattened pads.
    for (let i = 0; i < cfg.buildings; i++) {
      const roll = r();
      let kind;
      if (style === "island") kind = roll < 0.55 ? "house" : roll < 0.85 ? "ruin" : "torii";
      else if (style === "cave") kind = roll < 0.55 ? "shack" : "ruin";
      else kind = roll < 0.65 ? "ruin" : "shrine";
      const w = kind === "torii" ? 4.6 : kind === "ruin" ? 7 + r() * 4 : 5 + r() * 3;
      const dep = kind === "torii" ? 1.5 : kind === "ruin" ? 6 + r() * 3 : 4 + r() * 2;
      const rad = Math.hypot(w, dep) / 2;
      const s = spot(rad + 1.5);
      if (!s) continue;
      this.buildingPlans.push({ kind, x: s.x, z: s.z, w, d: dep, ang: r() * Math.PI * 2, seed: r() });
      this.footprints.push({ x: s.x, z: s.z, r: rad + 1.5 });
      // Pad height = the terrain there before flattening.
      this.pads.push({ x: s.x, z: s.z, r: rad + 1.2, h: this.rawHeight(s.x, s.z) });
    }

    // Zig-zag walls: chains of segments with sharp 70-115 degree turns,
    // making corners and corridors that break line of sight.
    for (let i = 0; i < cfg.walls; i++) {
      const start = spot(3);
      if (!start) continue;
      let dir = r() * Math.PI * 2;
      let turn = r() < 0.5 ? 1 : -1;
      const pts = [start];
      const segs = 3 + Math.floor(r() * 3);
      for (let k = 0; k < segs; k++) {
        const prev = pts[pts.length - 1];
        const len = 5 + r() * 5;
        const nx = prev.x + Math.cos(dir) * len, nz = prev.z + Math.sin(dir) * len;
        const mx = (prev.x + nx) / 2, mz = (prev.z + nz) / 2;
        if (!free(nx, nz, 1) || !free(mx, mz, 1)) break;
        pts.push({ x: nx, z: nz });
        dir += turn * (1.2 + r() * 0.8);
        if (r() < 0.75) turn = -turn; // mostly zig-zag, sometimes a hairpin
      }
      if (pts.length < 3) continue;
      // Some segments are left out as gaps you can slip through.
      const gaps = pts.slice(1).map(() => r() < 0.18);
      this.wallPlans.push({ pts, gaps });
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1], b = pts[k];
        const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2.5);
        for (let t = 0; t <= steps; t++) {
          this.footprints.push({ x: lerp(a.x, b.x, t / steps), z: lerp(a.z, b.z, t / steps), r: 1.6 });
        }
      }
    }
  }

  buildStructures() {
    const style = this.biome.terrain;
    const wallMat = { island: this.mats.stoneWall, cave: this.mats.caveWall, hell: this.mats.obsidianWall }[style];

    for (const k of this.knolls) this.dressKnoll(k);

    for (const w of this.wallPlans) {
      const H = style === "cave" ? 3.2 : style === "hell" ? 2.8 : 2.3;
      for (let i = 1; i < w.pts.length; i++) {
        if (w.gaps[i - 1]) continue;
        const a = w.pts[i - 1], b = w.pts[i];
        this.addWall(a.x, a.z, b.x, b.z, H, 0.9, wallMat, 0.3);
      }
      // Chunky posts at every joint hide the seams at sharp corners.
      for (let i = 0; i < w.pts.length; i++) {
        const p = w.pts[i];
        const prevGap = i === 0 || w.gaps[i - 1], nextGap = i === w.pts.length - 1 || w.gaps[i];
        if (prevGap && nextGap) continue;
        this.addPost(p.x, p.z, 1.3, H + 0.5, wallMat);
      }
    }

    for (const b of this.buildingPlans) {
      if (b.kind === "house") this.addHouse(b, this.mats.planks, b.seed < 0.5 ? this.mats.roofTiles : this.mats.thatch, this.biome.lanterns);
      else if (b.kind === "shack") this.addHouse(b, this.mats.planks, this.mats.plankRoof, true);
      else if (b.kind === "shrine") this.addHouse(b, this.mats.obsidianWall, this.mats.obsidianRoof, true, this.mats.flame);
      else if (b.kind === "torii") this.addTorii(b);
      else this.addRuin(b, wallMat);
    }
  }

  // Rocks (or spikes / stalagmites) around the rim make the knoll read as a
  // cliff; its core is solid cover.
  dressKnoll(k) {
    const r = this.rng;
    const style = this.biome.terrain;
    const n = 5 + Math.floor(k.core * 1.2);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.4;
      const d = k.core * (1.05 + r() * 0.25);
      const x = k.x + Math.cos(a) * d, z = k.z + Math.sin(a) * d;
      if (style === "hell" && r() < 0.5) this.addObsidian(x, z, 0.9 + r() * 0.6);
      else if (style === "cave" && r() < 0.4) this.addStalagmite(x, z, 0.7 + r() * 0.5);
      else this.addRock(x, z, 1.1 + r() * 0.8, style === "cave" ? this.mats.caveRock : style === "hell" ? this.mats.obsidian : this.mats.rock);
    }
    // Boulders tumbled around the foot of the slope.
    const foot = 2 + Math.floor(r() * 3);
    for (let i = 0; i < foot; i++) {
      const a = r() * Math.PI * 2, d = k.outer * (0.8 + r() * 0.2);
      this.addRock(k.x + Math.cos(a) * d, k.z + Math.sin(a) * d, 0.6 + r() * 0.6,
        style === "cave" ? this.mats.caveRock : style === "hell" ? this.mats.obsidian : this.mats.rock);
    }
    // A little something on top.
    if (style === "island" && r() < 0.7) this.addTree(k.x, k.z, 1 + r() * 0.4, r() < 0.5 ? "pine" : "round");
    else if (style === "cave") this.addCrystals(k.x, k.z, 1.2);
    else if (style === "hell" && r() < 0.6) this.addBrazier(k.x, k.z);
    this.collide(k.x, k.z, k.core * 1.4);
  }

  // A box with world-space-scaled UVs (textures tile instead of stretching).
  blockGeometry(w, h, d, segW = 1) {
    const geo = new THREE.BoxGeometry(w, h, d, segW, 1, 1);
    const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
    const T = 2.5; // world units per texture repeat
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i) + h / 2, z = pos.getZ(i);
      if (Math.abs(nor.getY(i)) > 0.5) uv.setXY(i, x / T, z / T);
      else if (Math.abs(nor.getZ(i)) > 0.5) uv.setXY(i, x / T, y / T);
      else uv.setXY(i, z / T, y / T);
    }
    return geo;
  }

  // A wall segment that follows the ground. `broken` (0-1) knocks chunks
  // out of the top so it reads as a ruin.
  addWall(x1, z1, x2, z2, height, thick, mat, broken = 0) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const ang = Math.atan2(z2 - z1, x2 - x1);
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    const geo = this.blockGeometry(len, height, thick, Math.max(1, Math.ceil(len / 1.2)));
    geo.rotateY(-ang);
    geo.translate(cx, 0, cz);
    const pos = geo.attributes.position;
    const { fbm } = this.noise;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      let y = pos.getY(i) + height / 2;
      if (broken && y > height * 0.5) y -= Math.max(0, fbm(x * 0.7, z * 0.7, 2) + 0.15) * height * broken * 1.4;
      pos.setY(i, y - 0.6 + this.sampleHeight(x, z));
    }
    geo.computeBoundingSphere();
    this.group.add(new THREE.Mesh(geo, mat));
    if (Math.hypot(cx, cz) < PLAY_R) {
      addBoxObstacle(cx / WORLD_SCALE, cz / WORLD_SCALE, len / 2 / WORLD_SCALE, thick / 2 / WORLD_SCALE, ang);
    }
  }

  addPost(x, z, size, height, mat) {
    const post = new THREE.Mesh(this.variant("post" + size + "_" + height, 0, () => this.blockGeometry(size, height, size)), mat);
    post.rotation.y = this.rng() * Math.PI;
    this.place(post, x, z, height / 2 - 0.6);
    this.collide(x, z, size * 0.6);
  }

  // A cottage / miner's shack / demon shrine: walls, a pitched roof, a door
  // and windows that glow when `lit`.
  addHouse(b, wallMat, roofMat, lit, glowMat = this.mats.lanternGlow) {
    const g = new THREE.Group();
    const H = 2.8, R = 1.6 + b.d * 0.12;
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
    add(this.blockGeometry(b.w + 0.4, 0.7, b.d + 0.4), this.mats.stone, 0, 0.05, 0);   // foundation
    add(this.blockGeometry(b.w, H, b.d), wallMat, 0, H / 2 + 0.3, 0);                  // body
    add(this.roofGeometry(b.w / 2 + 0.45, b.d / 2 + 0.55, R), roofMat, 0, H + 0.3, 0); // roof
    // Door on one long side, windows either side of it.
    const front = b.d / 2 + 0.03;
    add(new THREE.BoxGeometry(1.1, 1.8, 0.08), this.mats.windowDark, 0, 1.2, front);
    const winMat = lit ? glowMat : this.mats.windowDark;
    for (const sx of [-1, 1]) {
      if (b.w > 5.5) add(new THREE.BoxGeometry(0.8, 0.7, 0.08), winMat, sx * b.w * 0.3, 1.9, front);
      add(new THREE.BoxGeometry(0.7, 0.7, 0.08), winMat, sx * b.w * 0.25, 1.9, -front);
    }
    g.rotation.y = -b.ang;
    this.place(g, b.x, b.z, -0.3);
    addBoxObstacle(b.x / WORLD_SCALE, b.z / WORLD_SCALE, (b.w / 2 + 0.2) / WORLD_SCALE, (b.d / 2 + 0.2) / WORLD_SCALE, b.ang);
    if (lit && this.biome.lanterns) this.addLantern(b.x + Math.cos(b.ang) * (b.w / 2 + 1.5), b.z + Math.sin(b.ang) * (b.w / 2 + 1.5));
  }

  // Gabled roof: two sloped planes plus the end triangles (eaves at y = 0).
  roofGeometry(W, D, R) {
    const v = [], uv = [];
    const quad = (a, b, c, d, uw, uh) => {
      v.push(...a, ...b, ...c, ...a, ...c, ...d);
      uv.push(0, 0, uw, 0, uw, uh, 0, 0, uw, uh, 0, uh);
    };
    const slope = Math.hypot(D, R) / 2;
    quad([-W, 0, -D], [W, 0, -D], [W, R, 0], [-W, R, 0], W, slope);
    quad([W, 0, D], [-W, 0, D], [-W, R, 0], [W, R, 0], W, slope);
    for (const sx of [-1, 1]) {
      v.push(sx * W, 0, -D, sx * W, R, 0, sx * W, 0, D);
      uv.push(0, 0, D / 2.5, R / 2.5, D / 1.25, 0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    return geo;
  }

  // Roofless ruin: four broken walls with a doorway or two you can run
  // through, and something glowing inside.
  addRuin(b, mat) {
    const r = this.rng;
    const c = Math.cos(b.ang), s = Math.sin(b.ang);
    const P = (lx, lz) => ({ x: b.x + lx * c - lz * s, z: b.z + lx * s + lz * c });
    const hw = b.w / 2, hd = b.d / 2;
    const corners = [P(-hw, -hd), P(hw, -hd), P(hw, hd), P(-hw, hd)];
    const doorSide = Math.floor(r() * 4);
    const H = this.biome.terrain === "cave" ? 3 : 2.6;
    for (let i = 0; i < 4; i++) {
      const a = corners[i], e = corners[(i + 1) % 4];
      const door = i === doorSide || (i === (doorSide + 2) % 4 && r() < 0.5);
      if (door) {
        // Split the side, leaving a 2.4-unit doorway in the middle.
        const len = Math.hypot(e.x - a.x, e.z - a.z);
        const t = (len / 2 - 1.2) / len;
        this.addWall(a.x, a.z, lerp(a.x, e.x, t), lerp(a.z, e.z, t), H, 0.8, mat, 0.45);
        this.addWall(lerp(a.x, e.x, 1 - t), lerp(a.z, e.z, 1 - t), e.x, e.z, H, 0.8, mat, 0.45);
      } else {
        this.addWall(a.x, a.z, e.x, e.z, H, 0.8, mat, 0.45);
      }
    }
    for (const k of corners) this.addPost(k.x, k.z, 1.1, H + 0.3, mat);
    const style = this.biome.terrain;
    if (style === "hell") this.addBrazier(b.x, b.z);
    else if (style === "cave") this.addCrystals(b.x, b.z, 1);
    else if (this.biome.lanterns) this.addLantern(b.x, b.z);
  }

  // Shrine gate: two red posts and two crossbeams. Run between the posts.
  addTorii(b) {
    const g = new THREE.Group();
    const add = (geo, x, y, z) => { const m = new THREE.Mesh(geo, this.mats.torii); m.position.set(x, y, z); g.add(m); };
    for (const sx of [-1.6, 1.6]) add(new THREE.CylinderGeometry(0.22, 0.26, 4, 6), sx, 2, 0);
    add(new THREE.BoxGeometry(5.2, 0.32, 0.4), 0, 4.1, 0);
    add(new THREE.BoxGeometry(4.0, 0.22, 0.3), 0, 3.3, 0);
    g.rotation.y = -b.ang;
    this.place(g, b.x, b.z, -0.1);
    for (const sx of [-1.6, 1.6]) this.collide(b.x + Math.cos(b.ang) * sx, b.z + Math.sin(b.ang) * sx, 0.3);
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
        if (flora === "cave" && h > 4 && d > PLAY_R - 4) continue; // not up the walls
        if (this.inFootprint(wx, wz)) continue;

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
