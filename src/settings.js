// Everything that survives between runs: settings, best-run records and the
// Armory (permanent perks bought with shards earned each run). Stored in
// localStorage; if storage is unavailable (private mode) it just isn't saved.

const STORE_KEY = "voidrunner.save.v1";

const DEFAULT_SAVE = {
  settings: { sensitivity: 1, master: 0.8, music: 0.55, sfx: 0.8, shake: true, damageNumbers: true, autoFullscreen: true, invertY: false },
  records: { bestTime: 0, bestKills: 0, bestScore: 0, bestStage: 0, runs: 0 },
  meta: { shards: 0, perks: {} },
};

function loadSave() {
  const fresh = JSON.parse(JSON.stringify(DEFAULT_SAVE));
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return fresh;
    const s = JSON.parse(raw);
    return {
      settings: { ...fresh.settings, ...s.settings },
      records: { ...fresh.records, ...s.records },
      meta: { ...fresh.meta, ...s.meta, perks: { ...(s.meta && s.meta.perks) } },
    };
  } catch (_) {
    return fresh;
  }
}

const SAVE = loadSave();

function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(SAVE)); } catch (_) { /* storage blocked */ }
}

// ---------------------------------------------------------------------------
// Armory perks — applied to the Player at the start of every run.
// ---------------------------------------------------------------------------

const PERKS = [
  { id: "vitality", name: "Vitality",    desc: "+10% max HP per rank",           costs: [20, 45, 90],
    apply: (p, r) => { p.base.maxHp *= 1 + 0.1 * r; p.hp = p.base.maxHp; } },
  { id: "power",    name: "Power",       desc: "+6% damage per rank",            costs: [25, 55, 110],
    apply: (p, r) => { p.base.damage *= 1 + 0.06 * r; } },
  { id: "endure",   name: "Endurance",   desc: "+15 max stamina per rank",       costs: [15, 35, 70],
    apply: (p, r) => { p.maxStamina += 15 * r; p.stamina = p.maxStamina; } },
  { id: "medic",    name: "Field Medic", desc: "Start with 1 potion per rank",   costs: [15, 35, 70],
    apply: (p, r) => { p.potions = Math.min(PLAYER.maxPotions, r); } },
  { id: "satchel",  name: "Satchel",     desc: "+2 backpack slots per rank",     costs: [15, 35, 70],
    apply: (p, r) => { p.backpackSlots += 2 * r; } },
  { id: "scholar",  name: "Scholar",     desc: "+10% XP per rank",               costs: [20, 45, 90],
    apply: (p, r) => { p.xpMul = 1 + 0.1 * r; } },
  { id: "arsenal",  name: "Arsenal",     desc: "Start with a 2nd weapon (better each rank)", costs: [30, 70, 140],
    apply: (p, r) => { p.addWeaponItem(makeWeapon({ rarity: ["uncommon", "rare", "epic"][r - 1] })); } },
];

const perkRank = (id) => SAVE.meta.perks[id] || 0;

function buyPerk(id) {
  const perk = PERKS.find((k) => k.id === id);
  const rank = perkRank(id);
  if (!perk || rank >= perk.costs.length) return false;
  const cost = perk.costs[rank];
  if (SAVE.meta.shards < cost) return false;
  SAVE.meta.shards -= cost;
  SAVE.meta.perks[id] = rank + 1;
  persist();
  return true;
}

function applyPerks(player) {
  for (const perk of PERKS) {
    const r = perkRank(perk.id);
    if (r > 0) perk.apply(player, r);
  }
  player.recalcGear();
}

// Shards earned by a run: a bit for everything, more for getting further.
function shardsForRun(game) {
  return Math.floor(game.score / 250 + game.player.kills / 40 + game.stageIndex * 8 + game.director.time / 30);
}

// Record a finished run; returns { shards, newBest: [field names] }.
function recordRun(game) {
  const r = SAVE.records;
  const newBest = [];
  const check = (key, value) => { if (value > r[key]) { r[key] = value; newBest.push(key); } };
  check("bestTime", Math.floor(game.director.time));
  check("bestKills", game.player.kills);
  check("bestScore", game.score);
  check("bestStage", game.stageIndex);
  r.runs += 1;
  const shards = shardsForRun(game);
  SAVE.meta.shards += shards;
  persist();
  return { shards, newBest };
}
