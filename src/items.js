// Loot: random-rarity armor/accessories and potions, plus their pixel icons.
// Gear stats are plain numbers summed into Player.gear (see Player.recalcGear).

const SLOTS = [
  { id: "head",  name: "Head",  bases: ["Cap", "Helm", "Kabuto", "Hood"],        implicit: { armor: [2, 5], maxHp: [5, 12] } },
  { id: "chest", name: "Chest", bases: ["Vest", "Plate", "Haori", "Mail"],       implicit: { armor: [4, 9] } },
  { id: "legs",  name: "Legs",  bases: ["Pants", "Greaves", "Hakama"],           implicit: { armor: [3, 7] } },
  { id: "feet",  name: "Feet",  bases: ["Boots", "Sandals", "Geta"],             implicit: { moveSpeedPct: [3, 7] } },
  { id: "ring",  name: "Ring",  bases: ["Band", "Ring", "Loop"],                 implicit: { damagePct: [3, 8] } },
  { id: "charm", name: "Charm", bases: ["Omamori", "Charm", "Talisman"],         implicit: { regen: [0.3, 0.8] } },
];
const SLOT_BY_ID = Object.fromEntries(SLOTS.map((s) => [s.id, s]));

const STAT_DEFS = {
  maxHp:          { range: [8, 25],     label: (v) => `+${v} Max HP` },
  armor:          { range: [3, 8],      label: (v) => `+${v} Armor` },
  damagePct:      { range: [4, 10],     label: (v) => `+${v}% Damage` },
  fireRatePct:    { range: [4, 9],      label: (v) => `+${v}% Fire Rate` },
  moveSpeedPct:   { range: [3, 7],      label: (v) => `+${v}% Move Speed` },
  rollCdPct:      { range: [4, 10],     label: (v) => `-${v}% Roll Cooldown` },
  regen:          { range: [0.3, 1.0],  label: (v) => `+${v} HP/sec`, decimals: 1 },
  pickupPct:      { range: [10, 25],    label: (v) => `+${v}% Pickup Range` },
  bulletSpeedPct: { range: [5, 12],     label: (v) => `+${v}% Bullet Speed` },
};

const RARITY_BY_ID = Object.fromEntries(RARITIES.map((r) => [r.id, r]));

const PREFIXES = {
  common: ["Worn", "Plain", "Patched"],
  uncommon: ["Sturdy", "Fine", "Woven"],
  rare: ["Tempered", "Ember", "Tidal"],
  epic: ["Oni-forged", "Twilight", "Spirit"],
  legendary: ["Ryujin's", "Kitsune's", "Sunset"],
};

let itemIdCounter = 1;

function rollStat(key, range, rarity, level) {
  const def = STAT_DEFS[key];
  const v = rand(range[0], range[1]) * rarity.mult * (1 + level * 0.12);
  const p = Math.pow(10, def.decimals || 0);
  return Math.max(def.decimals ? 0.1 : 1, Math.round(v * p) / p);
}

// Rarer drops get a little likelier as the run goes on (`luck` ~ minutes survived).
function rollRarity(luck, minIndex = 0) {
  const pool = RARITIES.map((r, i) => ({
    r, weight: i < minIndex ? 0 : r.weight * (i >= 2 ? 1 + luck * 0.25 : 1),
  }));
  return weightedPick(pool).r;
}

function makeGear({ level = 0, minRarity = 0 } = {}) {
  const slot = choice(SLOTS);
  const rarity = rollRarity(level, minRarity);
  const stats = {};
  for (const [key, range] of Object.entries(slot.implicit)) {
    stats[key] = rollStat(key, range, rarity, level);
  }
  const extra = Object.keys(STAT_DEFS).filter((k) => !(k in stats));
  for (let i = 0; i < rarity.affixes && extra.length; i++) {
    const key = extra.splice(Math.floor(Math.random() * extra.length), 1)[0];
    stats[key] = rollStat(key, STAT_DEFS[key].range, rarity, level);
  }
  return {
    id: itemIdCounter++,
    kind: "gear",
    slot: slot.id,
    rarity: rarity.id,
    level: level + 1,
    name: `${choice(PREFIXES[rarity.id])} ${choice(slot.bases)}`,
    stats,
  };
}

function makePotion() {
  return { id: itemIdCounter++, kind: "potion", slot: null, rarity: "common", name: "Health Potion", heal: 0.35, stats: {} };
}

function itemColor(item) {
  return item.kind === "potion" ? "#ff5a5a" : RARITY_BY_ID[item.rarity].color;
}

function statLines(stats) {
  return Object.entries(stats).map(([k, v]) => STAT_DEFS[k].label(v));
}

// ---------------------------------------------------------------------------
// Pixel icons (16x16) — drawn once per slot+rarity, reused by the inventory
// UI (as <canvas>) and by loot sprites in the 3D world (as textures).
// ---------------------------------------------------------------------------

const ICON_CACHE = new Map();
const ICON_TEX_CACHE = new Map();

function iconKey(item) {
  return item.kind === "potion" ? "potion" : item.slot + ":" + item.rarity;
}

function itemIcon(item) {
  const key = iconKey(item);
  if (ICON_CACHE.has(key)) return ICON_CACHE.get(key);
  const c = document.createElement("canvas");
  c.width = c.height = 16;
  const ctx = c.getContext("2d");
  const accent = itemColor(item);
  const metal = "#c8c0b0", dark = "#5a4a4a", ink = "#1a0a10";
  const px = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };

  switch (item.kind === "potion" ? "potion" : item.slot) {
    case "head":
      px(4, 3, 8, 2, ink); px(3, 5, 10, 6, ink); px(4, 4, 8, 6, metal); px(5, 4, 6, 1, "#fff");
      px(3, 10, 10, 2, accent); px(7, 5, 2, 5, dark); break;
    case "chest":
      px(2, 3, 12, 11, ink); px(3, 4, 10, 9, metal); px(3, 4, 3, 2, accent); px(10, 4, 3, 2, accent);
      px(7, 5, 2, 7, dark); px(4, 11, 8, 2, accent); break;
    case "legs":
      px(3, 2, 10, 12, ink); px(4, 3, 8, 3, metal); px(4, 6, 3, 7, metal); px(9, 6, 3, 7, metal);
      px(4, 3, 8, 1, accent); px(7, 6, 2, 7, ink); break;
    case "feet":
      px(2, 5, 6, 9, ink); px(9, 5, 6, 9, ink); px(3, 6, 4, 7, metal); px(10, 6, 4, 7, metal);
      px(3, 11, 4, 2, accent); px(10, 11, 4, 2, accent); break;
    case "ring":
      px(4, 6, 8, 7, ink); px(5, 7, 6, 5, metal); px(6, 8, 4, 3, ink); px(6, 3, 4, 4, ink); px(7, 4, 2, 2, accent); break;
    case "charm":
      px(7, 1, 2, 3, dark); px(4, 4, 8, 11, ink); px(5, 5, 6, 9, accent); px(6, 7, 4, 1, "#fff"); px(6, 9, 4, 1, "#fff"); break;
    case "potion":
      px(6, 1, 4, 3, ink); px(7, 2, 2, 2, "#c8a070"); px(4, 4, 8, 11, ink); px(5, 5, 6, 9, "#ff5a5a");
      px(5, 5, 6, 3, "#ffd0c0"); px(6, 9, 2, 3, "#ffb0a0"); break;
  }
  ICON_CACHE.set(key, c);
  return c;
}

function itemIconTexture(item) {
  const key = iconKey(item);
  if (!ICON_TEX_CACHE.has(key)) {
    const tex = new THREE.CanvasTexture(itemIcon(item));
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    ICON_TEX_CACHE.set(key, tex);
  }
  return ICON_TEX_CACHE.get(key);
}
