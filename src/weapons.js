// The arsenal: 24 weapon bases across 8 classes, rolled into items with an
// element, a rarity and (at higher threat) procedural mutations.
// Up to WEAPON_SLOTS are equipped at once; slot 0 is held in hand, the rest
// float around the player and fire from their own positions.

const WEAPON_SLOTS = 4;

const WEAPON_CLASSES = {
  pistol:   { name: "Pistol",        glyph: "⌐" },
  ar:       { name: "Assault Rifle", glyph: "≡" },
  smg:      { name: "SMG",           glyph: "‡" },
  shotgun:  { name: "Shotgun",       glyph: "»" },
  sniper:   { name: "Sniper",        glyph: "—" },
  melee:    { name: "Melee",         glyph: "/" },
  throwing: { name: "Throwing",      glyph: "✦" },
  launcher: { name: "Launcher",      glyph: "◉" },
};

// rate = attacks/sec, dmg per projectile/swing, speed in sim units/sec,
// size = projectile radius (sim). Optional behaviours are documented where
// they're consumed (fireWeapon / Game.handleCollisions).
const WEAPON_BASES = {
  service:   { cls: "pistol",   name: "Service Pistol",  rate: 3.5,  dmg: 11,  speed: 620,  shape: "orb",     size: 3 },
  cannon:    { cls: "pistol",   name: "Hand Cannon",     rate: 1.5,  dmg: 34,  speed: 680,  shape: "slug",    size: 4.5, pierce: 1 },
  twin:      { cls: "pistol",   name: "Twin Revolvers",  rate: 4.5,  dmg: 8,   speed: 620,  shape: "orb",     size: 3, count: 2, spread: 7 },
  kobra:     { cls: "ar",       name: "Kobra AR",        rate: 7,    dmg: 8,   speed: 780,  shape: "tracer",  size: 3, jitter: 3 },
  burst:     { cls: "ar",       name: "Burst Rifle",     rate: 1.8,  dmg: 10,  speed: 800,  shape: "tracer",  size: 3, burst: 3, burstGap: 0.06 },
  dmr:       { cls: "ar",       name: "Marksman DMR",    rate: 2.4,  dmg: 24,  speed: 950,  shape: "tracer",  size: 3.5, pierce: 2 },
  viper:     { cls: "smg",      name: "Viper SMG",       rate: 12,   dmg: 4,   speed: 720,  shape: "pellet",  size: 2.5, jitter: 8 },
  hornet:    { cls: "smg",      name: "Hornet PDW",      rate: 9,    dmg: 5,   speed: 560,  shape: "pellet",  size: 2.5, jitter: 5, homing: 2.4 },
  spray:     { cls: "smg",      name: "Spray Uzi",       rate: 16,   dmg: 3,   speed: 680,  shape: "pellet",  size: 2.5, jitter: 15 },
  scatter:   { cls: "shotgun",  name: "Scattergun",      rate: 1.3,  dmg: 6,   speed: 640,  shape: "pellet",  size: 3, count: 6, spread: 34, life: 0.45 },
  slugger:   { cls: "shotgun",  name: "Slug Thrower",    rate: 1.0,  dmg: 42,  speed: 700,  shape: "slug",    size: 5.5, pierce: 3 },
  autoshot:  { cls: "shotgun",  name: "Auto Shotty",     rate: 2.6,  dmg: 4.5, speed: 620,  shape: "pellet",  size: 3, count: 4, spread: 26, life: 0.4 },
  longshot:  { cls: "sniper",   name: "Longshot",        rate: 0.9,  dmg: 70,  speed: 1500, shape: "beam",    size: 3, pierce: 5 },
  railgun:   { cls: "sniper",   name: "Railgun",         rate: 0.55, dmg: 120, speed: 2400, shape: "rail",    size: 4, pierce: 99 },
  needle:    { cls: "sniper",   name: "Needle Rifle",    rate: 1.8,  dmg: 28,  speed: 1150, shape: "beam",    size: 2.5, pierce: 1, split: 3 },
  katana:    { cls: "melee",    name: "Katana",          rate: 2.6,  dmg: 22,  arc: 110, range: 85 },
  hammer:    { cls: "melee",    name: "Great Hammer",    rate: 0.95, dmg: 55,  arc: 150, range: 95, shock: 75 },
  scythe:    { cls: "melee",    name: "Spirit Scythe",   rate: 1.4,  dmg: 28,  arc: 240, range: 115, reap: 1 },
  shuriken:  { cls: "throwing", name: "Shuriken",        rate: 2.2,  dmg: 9,   speed: 640,  shape: "star",    size: 5, count: 3, spread: 18, bounce: 1 },
  kunai:     { cls: "throwing", name: "Kunai",           rate: 4,    dmg: 12,  speed: 840,  shape: "kunai",   size: 4, pierce: 1 },
  boomerang: { cls: "throwing", name: "Boomerang Axe",   rate: 1.1,  dmg: 20,  speed: 560,  shape: "axe",     size: 7, boomerang: true, life: 1.4 },
  rocket:    { cls: "launcher", name: "Rocket Launcher", rate: 0.8,  dmg: 30,  speed: 430,  shape: "rocket",  size: 6, blast: 85 },
  grenade:   { cls: "launcher", name: "Grenade Tosser",  rate: 1.0,  dmg: 35,  speed: 380,  shape: "grenade", size: 6, blast: 95, lob: true, life: 1.0 },
  swarm:     { cls: "launcher", name: "Swarm Missiles",  rate: 0.9,  dmg: 9,   speed: 380,  shape: "rocket",  size: 4, count: 4, spread: 44, homing: 4, blast: 40 },
};
const WEAPON_BASE_IDS = Object.keys(WEAPON_BASES);

const MUTATIONS = {
  twin:      { name: "Twin",      desc: "+1 projectile, or a second swing" },
  ricochet:  { name: "Ricochet",  desc: "Shots bounce to 2 more enemies" },
  splitter:  { name: "Splitting", desc: "Shots burst into 3 shards on hit" },
  volatile:  { name: "Volatile",  desc: "Every hit explodes" },
  giant:     { name: "Giant",     desc: "Huge shots, +50% damage, slower" },
  rapid:     { name: "Rapid",     desc: "+50% attack speed, -20% damage" },
  seeking:   { name: "Seeking",   desc: "Shots home in on enemies" },
  vampiric:  { name: "Vampiric",  desc: "Heal 3% of damage dealt" },
  prismatic: { name: "Prismatic", desc: "Each attack rolls a random element" },
  echo:      { name: "Echoing",   desc: "Every 3rd attack fires twice" },
};
const MUTATION_IDS = Object.keys(MUTATIONS);

// Mutations only start appearing once the run gets hard (threat 3+), and
// stack up as it gets harder.
function rollMutations(threat) {
  let n = 0;
  if (threat >= 7) n = 2 + (Math.random() < 0.35 ? 1 : 0);
  else if (threat >= 5) n = 1 + (Math.random() < 0.4 ? 1 : 0);
  else if (threat >= 3) n = Math.random() < 0.4 ? 1 : 0;
  const pool = [...MUTATION_IDS];
  const out = [];
  for (let i = 0; i < n; i++) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

function makeWeapon({ level = 0, minRarity = 0, base, element, threat = 1, rarity } = {}) {
  const baseId = base || choice(WEAPON_BASE_IDS);
  const r = rarity ? RARITY_BY_ID[rarity] : rollRarity(level, minRarity);
  const el = element !== undefined ? element : choice(ELEMENT_IDS);
  const mutations = rollMutations(threat);
  const b = WEAPON_BASES[baseId];
  const parts = [];
  if (mutations.length) parts.push(MUTATIONS[mutations[0]].name);
  if (el !== "none") parts.push(ELEMENTS[el].adj);
  parts.push(b.name);
  return {
    id: itemIdCounter++,
    kind: "weapon",
    base: baseId,
    slot: null,
    element: el,
    rarity: r.id,
    level: level + 1,
    mutations,
    name: parts.join(" "),
    stats: {},
  };
}

const hasMut = (item, m) => item.mutations.includes(m);

// Damage multiplier from the item itself (rarity + item level + mutations).
function weaponPower(item) {
  let m = RARITY_BY_ID[item.rarity].mult * (1 + (item.level - 1) * 0.1);
  if (hasMut(item, "giant")) m *= 1.5;
  if (hasMut(item, "rapid")) m *= 0.8;
  return m;
}

function weaponRate(item, player) {
  const b = WEAPON_BASES[item.base];
  let r = b.rate * (player.fireRate / PLAYER.baseFireRate);
  if (hasMut(item, "rapid")) r *= 1.5;
  if (hasMut(item, "giant")) r *= 0.8;
  if (player.tier("energy") >= 2) r *= 1.15;
  return r;
}

// Rough damage per second, for tooltips.
function weaponDps(item, player) {
  const b = WEAPON_BASES[item.base];
  const per = b.dmg * weaponPower(item) * (player.damage / PLAYER.baseDamage);
  const shots = (b.count || 1) * (b.burst || 1) + (hasMut(item, "twin") ? 1 : 0);
  return per * shots * weaponRate(item, player);
}

// Where each slot's weapon sits relative to the player (sim units):
// right = along the camera's right vector, fwd = along the aim.
const SLOT_OFFSETS = [
  { right: 9, fwd: 14, h: 1.2 },   // in hand
  { right: 22, fwd: 4, h: 1.75 },  // floating right
  { right: -22, fwd: 4, h: 1.75 }, // floating left
  { right: 0, fwd: -4, h: 2.55 },  // floating overhead
];

function slotOrigin(p, slot) {
  const o = SLOT_OFFSETS[slot];
  const a = p.facing;
  return {
    x: p.x + Math.cos(a) * o.fwd - Math.sin(a) * o.right,
    y: p.y + Math.sin(a) * o.fwd + Math.cos(a) * o.right,
  };
}

// One attack from the weapon in `slot`. Bursts / echoes / twin swings are
// queued on the player and replayed by Player.updateWeapons.
function fireWeapon(game, p, slot, opts = {}) {
  const item = p.weaponSlots[slot];
  if (!item) return;
  const b = WEAPON_BASES[item.base];
  const origin = slotOrigin(p, slot);
  const target = game.aimTarget && game.aimTarget.alive ? game.aimTarget : null;
  const aim = target ? angleTo(origin.x, origin.y, target.x, target.y) : p.aimAngle;
  const element = hasMut(item, "prismatic") ? choice(ELEMENT_IDS) : item.element === "none" ? null : item.element;
  const damage = b.dmg * weaponPower(item) * (p.damage / PLAYER.baseDamage);
  const fx = p.weaponFx[slot];
  SOUND.play("shoot", b.cls);
  fx.kick = 1;
  fx.element = element;

  if (b.cls === "melee") {
    const dir = opts.mirror ? aim + 0.15 : aim;
    game.swing({ x: p.x, y: p.y, angle: dir, arc: (b.arc * Math.PI) / 180, range: b.range * (hasMut(item, "giant") ? 1.35 : 1),
      damage, element, item, mirror: !!opts.mirror, shock: b.shock, reap: b.reap });
    fx.swing = 1;
    fx.swingMirror = !!opts.mirror;
    if (hasMut(item, "twin") && !opts.mirror) p.queueAttack(slot, 0.12, { mirror: true });
  } else {
    const count = (b.count || 1) + (hasMut(item, "twin") ? 1 : 0) + (p.multishot - 1);
    const spread = ((b.spread || 7) * Math.PI) / 180;
    const giant = hasMut(item, "giant");
    const seek = b.homing || (hasMut(item, "seeking") ? 3.5 : 0);
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1) - 0.5;
      const jitter = b.jitter ? rand(-b.jitter, b.jitter) * (Math.PI / 180) : 0;
      const ang = aim + t * spread * (count > 1 ? 1 : 0) + jitter;
      const speed = b.speed * (p.bulletSpeed / PLAYER.baseBulletSpeed) * (giant ? 0.8 : 1);
      const pierce = (b.pierce || 0) + p.pierce + (element === "light" && p.tier("light") >= 1 ? 1 : 0);
      game.bullets.push(new Bullet({
        x: origin.x, y: origin.y,
        vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
        radius: b.size * (giant ? 1.8 : 1),
        damage, pierce,
        owner: "player",
        color: elementOf(element).color,
        element,
        shape: b.shape,
        life: b.life || 2.2,
        homing: seek,
        target: seek ? target || findNearestEnemy(origin.x, origin.y, game.enemies) : null,
        bounce: (b.bounce || 0) + (hasMut(item, "ricochet") ? 2 : 0),
        split: b.split || (hasMut(item, "splitter") ? 3 : 0),
        blast: b.blast || (hasMut(item, "volatile") ? 55 : 0),
        boomerang: !!b.boomerang,
        lob: !!b.lob,
        vampiric: hasMut(item, "vampiric"),
        player: p,
      }));
    }
    if (b.burst && !opts.burst) {
      for (let k = 1; k < b.burst; k++) p.queueAttack(slot, b.burstGap * k, { burst: true });
    }
  }

  // Echo: every 3rd attack repeats itself a beat later.
  if (hasMut(item, "echo") && !opts.echo && !opts.burst && !opts.mirror) {
    fx.echoCount = (fx.echoCount || 0) + 1;
    if (fx.echoCount % 3 === 0) p.queueAttack(slot, 0.1, { echo: true });
  }

  // Energy tier 3: every 5th attack (across all weapons) calls lightning.
  if (!opts.burst && !opts.echo && !opts.mirror && p.tier("energy") >= 3) {
    p.energyCount = (p.energyCount || 0) + 1;
    if (p.energyCount % 5 === 0) {
      const t = findNearestEnemy(p.x, p.y, game.enemies);
      if (t && dist(t.x, t.y, p.x, p.y) < 520) {
        game.bolt(p.x, p.y, t.x, t.y, ELEMENTS.energy.light);
        game.damageEnemy(t, 25 * (p.damage / PLAYER.baseDamage) * p.potency("energy"), "energy");
      }
    }
  }
}

function findNearestEnemy(x, y, enemies, exclude) {
  let best = null, bestD = Infinity;
  for (const e of enemies) {
    if (!e.alive || (exclude && exclude.has(e.id))) continue;
    const d = dist2(x, y, e.x, e.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}
