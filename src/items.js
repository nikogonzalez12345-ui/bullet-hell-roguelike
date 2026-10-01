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

// Rarer armor is more likely to carry an element (feeding set bonuses).
const ELEMENT_CHANCE = { common: 0.4, uncommon: 0.7, rare: 1, epic: 1, legendary: 1 };

function makeGear({ level = 0, minRarity = 0, element } = {}) {
  const slot = choice(SLOTS);
  const rarity = rollRarity(level, minRarity);
  const el = element || (Math.random() < ELEMENT_CHANCE[rarity.id] ? choice(ELEMENT_IDS) : "none");
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
    element: el,
    rarity: rarity.id,
    level: level + 1,
    name: `${el !== "none" ? ELEMENTS[el].adj : choice(PREFIXES[rarity.id])} ${choice(slot.bases)}`,
    stats,
  };
}

const POTION_HEAL = 0.35; // fraction of max HP

function makePotion() {
  return { id: itemIdCounter++, kind: "potion", slot: null, rarity: "common", name: "Health Potion", stats: {} };
}

function itemColor(item) {
  return item.kind === "potion" ? "#ff5a5a" : RARITY_BY_ID[item.rarity].color;
}

// ---------------------------------------------------------------------------
// Auto-salvage rules: an item is outclassed when you own another item of the
// same class (weapon class, or armor slot) that is both a higher rarity tier
// and stronger overall.
// ---------------------------------------------------------------------------

function itemTier(item) {
  return RARITIES.findIndex((r) => r.id === item.rarity);
}

function itemScore(item) {
  const mult = RARITY_BY_ID[item.rarity].mult;
  if (item.kind === "weapon") return mult * (1 + (item.level - 1) * 0.1) * (1 + 0.3 * item.mutations.length);
  return mult * (1 + (item.level - 1) * 0.12);
}

function sameClass(a, b) {
  if (a.kind !== b.kind) return false;
  if (a.kind === "weapon") return WEAPON_BASES[a.base].cls === WEAPON_BASES[b.base].cls;
  return a.kind === "gear" && a.slot === b.slot;
}

function isOutclassed(item, player) {
  if (item.kind === "potion") return false;
  const owned = [...player.weaponSlots, ...Object.values(player.equipped), ...player.backpack];
  return owned.some((o) => o && o !== item && sameClass(o, item) &&
    itemTier(o) > itemTier(item) && itemScore(o) > itemScore(item));
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
  if (item.kind === "potion") return "potion";
  const shape = item.kind === "weapon" ? "w:" + WEAPON_BASES[item.base].cls : item.slot;
  return `${shape}:${item.rarity}:${item.element || "none"}`;
}

// Elemental items use their element's colours; neutral ones fall back to
// plain metal with a rarity-coloured accent.
function iconColors(item) {
  const el = item.element && item.element !== "none" ? ELEMENTS[item.element] : null;
  return {
    accent: el ? el.color : itemColor(item),
    metal: el ? el.armor : "#c8c0b0",
    shine: el ? el.light : "#ffffff",
  };
}

function drawWeaponIcon(px, cls, metal, accent, shine, ink) {
  const wood = "#6a3e22";
  switch (cls) {
    case "pistol":
      px(3, 5, 10, 4, ink); px(4, 6, 8, 2, metal); px(4, 9, 4, 5, ink); px(5, 9, 2, 4, wood); px(10, 6, 2, 1, accent); break;
    case "ar":
      px(1, 5, 14, 4, ink); px(2, 6, 12, 2, metal); px(6, 9, 3, 4, ink); px(6, 9, 2, 3, accent); px(1, 7, 3, 4, ink); px(12, 6, 2, 1, shine); break;
    case "smg":
      px(3, 5, 10, 4, ink); px(4, 6, 8, 2, metal); px(7, 9, 3, 6, ink); px(8, 9, 1, 5, accent); px(4, 9, 2, 3, ink); break;
    case "shotgun":
      px(1, 5, 14, 5, ink); px(2, 6, 12, 1, metal); px(2, 8, 12, 1, metal); px(1, 9, 5, 4, ink); px(2, 9, 3, 3, wood); px(12, 6, 2, 3, accent); break;
    case "sniper":
      px(0, 7, 16, 3, ink); px(1, 8, 14, 1, metal); px(5, 4, 6, 3, ink); px(6, 5, 4, 1, accent); px(1, 9, 3, 4, ink); break;
    case "melee":
      for (let i = 0; i < 9; i++) px(3 + i, 11 - i, 2, 2, i < 7 ? metal : shine);
      px(2, 10, 5, 2, ink); px(3, 12, 2, 3, accent); px(12, 2, 2, 2, accent); break;
    case "throwing":
      px(7, 1, 2, 14, ink); px(1, 7, 14, 2, ink); px(7, 2, 2, 12, metal); px(2, 7, 12, 2, metal); px(6, 6, 4, 4, accent); px(7, 7, 2, 2, shine); break;
    case "launcher":
      px(1, 4, 13, 7, ink); px(2, 5, 11, 5, metal); px(13, 5, 2, 5, accent); px(5, 11, 3, 4, ink); px(3, 6, 8, 1, shine); break;
  }
}

function itemIcon(item) {
  const key = iconKey(item);
  if (ICON_CACHE.has(key)) return ICON_CACHE.get(key);
  const c = document.createElement("canvas");
  c.width = c.height = 16;
  const ctx = c.getContext("2d");
  const { accent, metal, shine } = iconColors(item);
  const dark = "#5a4a4a", ink = "#1a0a10";
  const px = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };

  if (item.kind === "weapon") {
    drawWeaponIcon(px, WEAPON_BASES[item.base].cls, metal, accent, shine, ink);
    ICON_CACHE.set(key, c);
    return c;
  }

  switch (item.kind === "potion" ? "potion" : item.slot) {
    case "head":
      px(4, 3, 8, 2, ink); px(3, 5, 10, 6, ink); px(4, 4, 8, 6, metal); px(5, 4, 6, 1, shine);
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
