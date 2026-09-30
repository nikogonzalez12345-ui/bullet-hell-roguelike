// The sunset island: sky dome, terrain, ocean, trees, rocks and grass.
// Trees and rocks inside the arena double as cover — they're registered in
// OBSTACLES (sim units) so characters collide with them and bullets stop.

const WATER_Y = -0.8;
const OBSTACLES = []; // { x, y, r } in sim units

function terrainHeight(wx, wz) {
  const r = Math.hypot(wx, wz);
  const angle = Math.atan2(wz, wx);
  let h = 0.22 * Math.sin(wx * 0.35) * Math.cos(wz * 0.3) + 0.12 * Math.sin(wx * 0.9 + wz * 0.7);
  // Patchy hills ringing the arena — some directions stay open to the sea.
  const hill = Math.max(0, Math.sin(angle * 3 + 1) * Math.cos(angle * 2 - 0.5)) * 3.2;
  h += hill * smooth(26, 30, r) * (1 - smooth(31, 35, r));
  // Shoreline drop into the ocean.
  h -= smooth(32, 38, r) * 3;
  return h;
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
    const len = Math.hypot(x, y, z) || 1;
    const k = 1 + n * amount;
    pos.setXYZ(i, x * k, y * k + (n * amount * len) * 0.2, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

class World {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;
    this.buildSky();
    this.buildTerrain();
    this.buildOcean();
    this.buildTrees();
    this.buildRocks();
    this.buildGrass();
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

          // Long horizontal cloud streaks, darker than the sky behind them.
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
    this.scene.add(this.sky);
  }

  buildTerrain() {
    const geo = new THREE.PlaneGeometry(92, 92, 56, 56);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = terrainHeight(x, z);
      pos.setY(i, h);
      // Darken vertices as they dip toward/under the waterline; add a little
      // per-vertex variation so the grass doesn't look like one flat tile.
      const shade = (0.85 + 0.25 * Math.random()) * (h < WATER_Y + 0.4 ? 0.55 : 1);
      colors[i * 3] = shade;
      colors[i * 3 + 1] = shade;
      colors[i * 3 + 2] = shade;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = ps1Material({ map: TEX.grass, uvScale: new THREE.Vector2(22, 22), vertexColors: true });
    this.terrain = new THREE.Mesh(geo, mat);
    this.scene.add(this.terrain);
  }

  buildOcean() {
    const geo = new THREE.PlaneGeometry(500, 500, 40, 40);
    geo.rotateX(-Math.PI / 2);
    this.waterMat = ps1Material({ map: TEX.water, uvScale: new THREE.Vector2(70, 70) });
    this.waterMat.uniforms.fogNear.value = 40;
    this.waterMat.uniforms.fogFar.value = 180;
    const water = new THREE.Mesh(geo, this.waterMat);
    water.position.y = WATER_Y;
    this.scene.add(water);
  }

  addTree(wx, wz, scale, collide) {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.38, 3.2, 6, 2),
      ps1Material({ map: TEX.bark, uvScale: new THREE.Vector2(2, 2) })
    );
    trunk.position.y = 1.6;
    group.add(trunk);

    const leafMat = ps1Material({ map: TEX.leaves, uvScale: new THREE.Vector2(3, 3) });
    const crown = new THREE.Mesh(jitterGeometry(new THREE.IcosahedronGeometry(1.9, 1), 0.18, wx), leafMat);
    crown.position.y = 4.2;
    crown.scale.set(1, 1.15, 1);
    group.add(crown);
    if (scale > 1.1) {
      const crown2 = new THREE.Mesh(jitterGeometry(new THREE.IcosahedronGeometry(1.3, 1), 0.2, wz), leafMat);
      crown2.position.set(0.9, 3.3, 0.6);
      group.add(crown2);
    }

    group.position.set(wx, terrainHeight(wx, wz) - 0.1, wz);
    group.scale.setScalar(scale);
    group.rotation.y = rand(0, Math.PI * 2);
    this.scene.add(group);
    if (collide) OBSTACLES.push({ x: wx / WORLD_SCALE, y: wz / WORLD_SCALE, r: 0.45 * scale / WORLD_SCALE });
  }

  buildTrees() {
    // Ring of trees around the arena edge (scenery)…
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + rand(-0.12, 0.12);
      const r = rand(27.5, 33);
      this.addTree(Math.cos(a) * r, Math.sin(a) * r, rand(1.0, 1.5), false);
    }
    // …and a few inside it that act as cover.
    const inner = [[8, -10], [-12, -6], [14, 7], [-6, 13], [2, -19]];
    for (const [x, z] of inner) this.addTree(x, z, rand(1.0, 1.35), true);
  }

  addRock(wx, wz, scale, collide) {
    const rock = new THREE.Mesh(
      jitterGeometry(new THREE.DodecahedronGeometry(1.2, 0), 0.22, wx * 3 + wz),
      ps1Material({ map: TEX.rock, uvScale: new THREE.Vector2(1.5, 1.5) })
    );
    rock.position.set(wx, terrainHeight(wx, wz) + 0.2 * scale, wz);
    rock.scale.set(scale * 1.3, scale * 0.8, scale);
    rock.rotation.y = rand(0, Math.PI * 2);
    this.scene.add(rock);
    if (collide) OBSTACLES.push({ x: wx / WORLD_SCALE, y: wz / WORLD_SCALE, r: 1.25 * scale / WORLD_SCALE });
  }

  buildRocks() {
    for (let i = 0; i < 14; i++) {
      const a = rand(0, Math.PI * 2);
      this.addRock(Math.cos(a) * rand(29, 35), Math.sin(a) * rand(29, 35), rand(0.9, 2), false);
    }
    const inner = [[-15, 12], [17, -6], [-3, -9]];
    for (const [x, z] of inner) this.addRock(x, z, rand(0.9, 1.2), true);
  }

  buildGrass() {
    const count = 220;
    const geo = new THREE.PlaneGeometry(0.9, 0.7);
    geo.translate(0, 0.35, 0);
    const mat = ps1Material({ map: TEX.grassTuft, doubleSide: true });
    for (let pass = 0; pass < 2; pass++) {
      const mesh = new THREE.InstancedMesh(geo, mat, count);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3();
      const p = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      let seed = 7;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let i = 0; i < count; i++) {
        const a = rnd() * Math.PI * 2;
        const r = Math.sqrt(rnd()) * 31;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        p.set(x, terrainHeight(x, z) - 0.05, z);
        q.setFromAxisAngle(up, rnd() * Math.PI + pass * Math.PI / 2);
        const sc = 0.7 + rnd() * 0.8;
        s.set(sc, sc, sc);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
      }
      this.scene.add(mesh);
    }
  }

  update(dt, camera) {
    this.time += dt;
    this.sky.position.copy(camera.position);
    this.waterMat.uniforms.uvOffset.value.set(this.time * 0.02, this.time * 0.035);
  }
}
