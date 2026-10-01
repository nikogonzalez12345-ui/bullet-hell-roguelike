// PS1-style rendering primitives: one shared material shader and a set of
// procedurally painted low-res textures.
//
// The shader reproduces the three signature artifacts of the original
// hardware: vertex positions snapped to a coarse screen grid (wobble),
// affine (non-perspective-correct) texture mapping (warping), and
// per-vertex Gouraud lighting with 15-bit colour + ordered dithering.

const PS1_SNAP = new THREE.Vector2(RENDER_W / 2, RENDER_H / 2); // updated on resize

// Scene-wide lighting + fog, shared by reference with every material so a
// biome change relights the whole world at once (see applyLighting).
const SCENE = {
  lightDir: { value: new THREE.Vector3(0, 0.28, -1).normalize() },
  lightColor: { value: new THREE.Color("#ffb070") },
  ambient: { value: new THREE.Color("#5a4a78") },
  fillDir: { value: new THREE.Vector3(0.35, 0.6, 1).normalize() },
  fillColor: { value: new THREE.Color("#6a6090") },
  fogColor: { value: new THREE.Color("#5a2320") },
  fogNear: { value: 18 },
  fogFar: { value: 70 },
};

function applyLighting(l) {
  SCENE.lightDir.value.set(...l.dir).normalize();
  SCENE.lightColor.value.set(l.color);
  SCENE.ambient.value.set(l.ambient);
  SCENE.fillColor.value.set(l.fill);
  SCENE.fogColor.value.set(l.fog);
  SCENE.fogNear.value = l.fogNear;
  SCENE.fogFar.value = l.fogFar;
}

// Shared by every scenery material that opts in with `occlusionFade`: props
// within fadeR of the camera->player line are screen-door dithered away,
// the way N64/PS1 games dissolved walls between the camera and the hero.
const OCCLUSION = {
  fadeA: { value: new THREE.Vector3() },
  fadeB: { value: new THREE.Vector3() },
  fadeR: { value: 0 },
};

const PS1_DITHER_GLSL = `
  float ps1B2(vec2 a) { return mod(a.x * 2.0 + a.y * 3.0, 4.0); }
  float ps1Bayer(vec2 p) {
    vec2 q = floor(p);
    return (4.0 * ps1B2(mod(q, 2.0)) + ps1B2(mod(floor(q / 2.0), 2.0)) + 0.5) / 16.0;
  }
  vec3 ps1Quantize(vec3 c) {
    return floor(clamp(c, 0.0, 1.0) * 31.0 + ps1Bayer(gl_FragCoord.xy)) / 31.0;
  }
`;

const PS1_VERTEX = `
  uniform vec2 snapRes;
  uniform vec3 lightDir;
  uniform vec3 lightColor;
  uniform vec3 ambient;
  uniform vec3 fillDir;
  uniform vec3 fillColor;
  uniform vec2 uvScale;
  uniform vec2 uvOffset;
  uniform float rimStrength;
  varying vec3 vUvw;
  varying vec3 vLight;
  varying vec3 vTint;
  varying float vFogDepth;
  varying float vRim;
  #ifdef OCCLUSION_FADE
    varying vec3 vWorld;
  #endif

  void main() {
    vec4 local = vec4(position, 1.0);
    vec3 n = normal;
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
      n = mat3(instanceMatrix) * n;
    #endif
    vec4 mv = modelViewMatrix * local;
    vec4 clip = projectionMatrix * mv;
    #ifdef OCCLUSION_FADE
      vWorld = (modelMatrix * local).xyz;
    #endif

    // Snap to a coarse grid in screen space -> the classic PS1 vertex wobble.
    if (clip.w > 0.0) {
      vec2 ndc = clip.xy / clip.w;
      ndc = floor(ndc * snapRes + 0.5) / snapRes;
      clip.xy = ndc * clip.w;
    }
    gl_Position = clip;

    // Multiplying by w here and dividing per-fragment cancels the GPU's
    // perspective correction, giving affine texture warping.
    vec2 uvT = uv * uvScale + uvOffset;
    vUvw = vec3(uvT * clip.w, clip.w);

    vec3 worldN = normalize(mat3(modelMatrix) * n);
    // Warm key light from the sunset + a dim cool fill from the opposite
    // side, so characters seen from behind don't turn into silhouettes.
    vLight = ambient
      + lightColor * max(dot(worldN, lightDir), 0.0)
      + fillColor * max(dot(worldN, fillDir), 0.0);

    // Rim light (enemies): edges facing away from the camera glow a little,
    // so silhouettes separate from dark ground and fog.
    vRim = 0.0;
    if (rimStrength > 0.0) {
      vec3 viewDir = normalize(cameraPosition - (modelMatrix * local).xyz);
      vRim = rimStrength * pow(1.0 - max(dot(worldN, viewDir), 0.0), 2.0);
    }

    vTint = vec3(1.0);
    #ifdef USE_COLOR
      vTint *= color;
    #endif
    #ifdef USE_INSTANCING_COLOR
      vTint *= instanceColor;
    #endif
    vFogDepth = -mv.z;
  }
`;

const PS1_FRAGMENT = `
  uniform sampler2D map;
  uniform float useMap;
  uniform vec3 baseColor;
  uniform float unlit;
  uniform float flash;
  uniform vec3 flashColor;
  uniform float opacity;
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;
  uniform float fogAmount;
  uniform vec3 rimColor;
  varying vec3 vUvw;
  varying vec3 vLight;
  varying vec3 vTint;
  varying float vFogDepth;
  varying float vRim;
  #ifdef OCCLUSION_FADE
    uniform vec3 fadeA;
    uniform vec3 fadeB;
    uniform float fadeR;
    varying vec3 vWorld;
  #endif
  ${PS1_DITHER_GLSL}

  void main() {
    #ifdef OCCLUSION_FADE
      if (fadeR > 0.0) {
        vec3 ab = fadeB - fadeA;
        float t = clamp(dot(vWorld - fadeA, ab) / dot(ab, ab), 0.0, 1.0);
        float d = length(vWorld - (fadeA + ab * t));
        float fade = 1.0 - smoothstep(fadeR * 0.5, fadeR, d);
        if (ps1Bayer(gl_FragCoord.xy) < fade * 0.8) discard;
      }
    #endif
    vec3 c = baseColor * vTint;
    if (useMap > 0.5) {
      vec4 t = texture2D(map, vUvw.xy / vUvw.z);
      if (t.a < 0.5) discard;
      c *= t.rgb;
    }
    if (unlit < 0.5) c *= vLight;
    c += rimColor * vRim;
    c = mix(c, flashColor, flash);
    c = mix(c, fogColor, smoothstep(fogNear, fogFar, vFogDepth) * fogAmount);
    gl_FragColor = vec4(ps1Quantize(c), opacity);
  }
`;

function ps1Material(opts = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: opts.map || null },
      useMap: { value: opts.map ? 1 : 0 },
      baseColor: { value: new THREE.Color(opts.color || "#ffffff") },
      unlit: { value: opts.unlit ? 1 : 0 },
      flash: { value: 0 },
      flashColor: { value: new THREE.Color("#ffffff") },
      opacity: { value: opts.opacity !== undefined ? opts.opacity : 1 },
      uvScale: { value: opts.uvScale || new THREE.Vector2(1, 1) },
      uvOffset: { value: new THREE.Vector2(0, 0) },
      snapRes: { value: PS1_SNAP },
      lightDir: SCENE.lightDir,
      lightColor: SCENE.lightColor,
      ambient: SCENE.ambient,
      fillDir: SCENE.fillDir,
      fillColor: SCENE.fillColor,
      fogColor: SCENE.fogColor,
      // Shared scene fog unless the material opts out or brings its own.
      fogNear: opts.fog === false ? { value: 1e6 } : opts.fogNear !== undefined ? { value: opts.fogNear } : SCENE.fogNear,
      fogFar: opts.fog === false ? { value: 2e6 } : opts.fogFar !== undefined ? { value: opts.fogFar } : SCENE.fogFar,
      fogAmount: { value: 1 },
      rimColor: { value: new THREE.Color("#000000") },
      rimStrength: { value: 0 },
      fadeA: OCCLUSION.fadeA,
      fadeB: OCCLUSION.fadeB,
      fadeR: OCCLUSION.fadeR,
    },
    vertexShader: PS1_VERTEX,
    fragmentShader: PS1_FRAGMENT,
    defines: opts.occlusionFade ? { OCCLUSION_FADE: "" } : {},
    vertexColors: !!opts.vertexColors,
    transparent: !!opts.transparent,
    depthWrite: opts.depthWrite !== undefined ? opts.depthWrite : true,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
  return mat;
}

// ---------------------------------------------------------------------------
// Procedural textures — painted on small canvases, sampled with NearestFilter
// (PS1 had no texture filtering). Tiling textures are painted at TEX_DETAIL x
// their nominal size with proportionally more speckles: same look, finer grain.
// ---------------------------------------------------------------------------

const TEX_DETAIL = 2;
let paintDetail = 1; // area multiplier for counts while a texture is being painted

function makeTexture(size, paint, repeat = true) {
  const detail = repeat ? TEX_DETAIL : 1; // icons/faces/tufts keep exact pixel layouts
  const real = size * detail;
  const c = document.createElement("canvas");
  c.width = c.height = real;
  const ctx = c.getContext("2d");
  paintDetail = detail * detail;
  paint(ctx, real);
  paintDetail = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function speckle(ctx, size, colors, count, minS = 1, maxS = 2) {
  count *= paintDetail;
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
    const s = Math.round(rand(minS, maxS));
    ctx.fillRect(Math.floor(rand(0, size)), Math.floor(rand(0, size)), s, s);
  }
}

const TEX = {};

function buildTextures() {
  TEX.grass = makeTexture(32, (ctx, s) => {
    ctx.fillStyle = "#3f6b2a"; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, ["#2e5220", "#557f33", "#4a7a2e", "#6b8f3a", "#35592a"], 260, 1, 2);
    speckle(ctx, s, ["#8a7a3a"], 10);
  });
  TEX.leaves = makeTexture(32, (ctx, s) => {
    ctx.fillStyle = "#2f5a26"; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, ["#1f3d1a", "#3f7a2e", "#4c8a35", "#274a20"], 220, 1, 3);
    speckle(ctx, s, ["#e0701e", "#f08a28", "#c85a1a"], 40, 1, 2); // sunset catching the canopy
  });
  TEX.leavesAutumn = makeTexture(32, (ctx, s) => {
    ctx.fillStyle = "#a8481e"; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, ["#7a2a14", "#d8641e", "#f0902a", "#8a3a1a"], 220, 1, 3);
    speckle(ctx, s, ["#ffc04a", "#5a7a2a"], 30, 1, 2);
  });
  TEX.pine = makeTexture(16, (ctx, s) => {
    ctx.fillStyle = "#1e3f2a"; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, ["#14301e", "#2a5a36", "#35683e"], 90, 1, 2);
    speckle(ctx, s, ["#c86a2a"], 6);
  });
  TEX.flower = makeTexture(16, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const petals = ["#ffd24a", "#ff6a8a", "#ffffff", "#c05aff"];
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(rand(2, s - 3));
      const h = Math.floor(rand(5, s - 3));
      ctx.fillStyle = "#4a7a2e";
      ctx.fillRect(x, s - h, 1, h);
      ctx.fillStyle = petals[Math.floor(Math.random() * petals.length)];
      ctx.fillRect(x - 1, s - h - 1, 3, 2);
    }
  }, false);
  TEX.bark = makeTexture(16, (ctx, s) => {
    ctx.fillStyle = "#4a3a30"; ctx.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 3) {
      ctx.fillStyle = Math.random() < 0.5 ? "#3a2c24" : "#5a4a3c";
      ctx.fillRect(x, 0, 1, s);
    }
    speckle(ctx, s, ["#2a201a", "#6a5a4a"], 30);
  });
  TEX.rock = makeTexture(16, (ctx, s) => {
    ctx.fillStyle = "#6a6a78"; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, ["#55556a", "#7a7a88", "#4a4a58", "#8a8898"], 90, 1, 3);
  });
  TEX.water = makeTexture(32, (ctx, s) => {
    ctx.fillStyle = "#12243a"; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 26 * paintDetail; i++) {
      ctx.fillStyle = Math.random() < 0.7 ? "#1c3450" : "#a0502a";
      ctx.fillRect(Math.floor(rand(0, s)), Math.floor(rand(0, s)), Math.round(rand(3, 8)), 1);
    }
  });
  TEX.caveFloor = makeTexture(32, (ctx, s) => {
    ctx.fillStyle = "#4a4452"; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, ["#3a3442", "#5a5462", "#2e2a36", "#625a6a"], 260, 1, 3);
    speckle(ctx, s, ["#3a6a7a"], 8);
  });
  TEX.ash = makeTexture(32, (ctx, s) => {
    ctx.fillStyle = "#4a3836"; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, ["#3a2a28", "#5a4442", "#322422", "#624a46"], 240, 1, 3);
    // a few glowing cracks
    for (let i = 0; i < 3 * paintDetail; i++) {
      let x = Math.floor(rand(0, s)), y = Math.floor(rand(0, s));
      ctx.fillStyle = Math.random() < 0.5 ? "#ff5a1a" : "#c8300a";
      for (let k = 0; k < 7 * TEX_DETAIL; k++) {
        ctx.fillRect(x, y, 1, 1);
        x = (x + (Math.random() < 0.5 ? 1 : 0) + s) % s;
        y = (y + (Math.random() < 0.5 ? 1 : -1) + s) % s;
      }
    }
  });
  TEX.lava = makeTexture(32, (ctx, s) => {
    ctx.fillStyle = "#e0420a"; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, ["#ff7a1a", "#ffb02a", "#a8200a", "#ffd84a", "#6a0a04"], 300, 1, 4);
  });
  TEX.obsidian = makeTexture(16, (ctx, s) => {
    ctx.fillStyle = "#1a1224"; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, ["#2a1e3a", "#0e0a14", "#4a3a6a"], 60, 1, 2);
  });
  TEX.deadBark = makeTexture(16, (ctx, s) => {
    ctx.fillStyle = "#2a2220"; ctx.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 3) { ctx.fillStyle = Math.random() < 0.5 ? "#1a1412" : "#3a302c"; ctx.fillRect(x, 0, 1, s); }
  });
  TEX.stone = makeTexture(16, (ctx, s) => {
    ctx.fillStyle = "#8a8478"; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, ["#76706a", "#9a948a", "#6a645c"], 60, 1, 2);
  });
  TEX.grassTuft = makeTexture(16, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    for (let i = 0; i < 9; i++) {
      const x = Math.floor(rand(1, s - 1));
      const h = Math.floor(rand(6, s));
      ctx.fillStyle = Math.random() < 0.5 ? "#4a7a2e" : "#6b9a3a";
      ctx.fillRect(x, s - h, 1, h);
    }
  }, false);
  TEX.denim = makeTexture(8, (ctx, s) => {
    ctx.fillStyle = "#34426a"; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, ["#2a3558", "#3e4e7a"], 14);
  });
  TEX.cloth = makeTexture(8, (ctx, s) => {
    ctx.fillStyle = "#cccccc"; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, ["#b0b0b0", "#e0e0e0"], 14);
  });
  TEX.wood = makeTexture(8, (ctx, s) => {
    ctx.fillStyle = "#6a3e22"; ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 2) { ctx.fillStyle = "#5a321a"; ctx.fillRect(0, y, s, 1); }
  });
}

// Anime face: big eyes, fringe of hair. Painted per-character so eye/hair
// colours can vary.
const FACE_CACHE = new Map();
function faceTexture(skin, hair, eye) {
  const key = skin + hair + eye;
  if (FACE_CACHE.has(key)) return FACE_CACHE.get(key);
  const tex = makeTexture(16, (ctx) => {
    ctx.fillStyle = skin; ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = hair;
    ctx.fillRect(0, 0, 16, 4);
    ctx.fillRect(0, 4, 2, 5); ctx.fillRect(14, 4, 2, 5);
    ctx.fillRect(4, 4, 2, 1); ctx.fillRect(9, 4, 3, 1);
    // eyes: white, iris, highlight
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(3, 7, 4, 4); ctx.fillRect(9, 7, 4, 4);
    ctx.fillStyle = eye;
    ctx.fillRect(4, 7, 3, 4); ctx.fillRect(9, 7, 3, 4);
    ctx.fillStyle = "#111111";
    ctx.fillRect(5, 8, 2, 3); ctx.fillRect(9, 8, 2, 3);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(5, 8, 1, 1); ctx.fillRect(9, 8, 1, 1);
    // mouth + blush
    ctx.fillStyle = "#8a3a3a"; ctx.fillRect(7, 13, 2, 1);
    ctx.fillStyle = "rgba(255,120,120,0.5)";
    ctx.fillRect(2, 11, 2, 1); ctx.fillRect(12, 11, 2, 1);
  }, false);
  FACE_CACHE.set(key, tex);
  return tex;
}

const SOLID_CACHE = new Map();
function solidTexture(color) {
  if (SOLID_CACHE.has(color)) return SOLID_CACHE.get(color);
  const tex = makeTexture(8, (ctx, s) => {
    ctx.fillStyle = color; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, ["rgba(0,0,0,0.18)", "rgba(255,255,255,0.12)"], 10);
  });
  SOLID_CACHE.set(color, tex);
  return tex;
}
