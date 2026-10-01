// Level-up upgrade pool. Stat upgrades change Player.base (gear bonuses stack
// on top of it via the Player getters).

const UPGRADES = [
  {
    id: "fireRate", icon: "⚡", name: "Rapid Fire", rarity: "common",
    desc: "+18% fire rate",
    apply(p) { p.base.fireRate *= 1.18; },
  },
  {
    id: "damage", icon: "🗲", name: "Sharpened Rounds", rarity: "common",
    desc: "+20% bullet damage",
    apply(p) { p.base.damage *= 1.2; },
  },
  {
    id: "speed", icon: "👟", name: "Light Feet", rarity: "common",
    desc: "+12% move speed",
    apply(p) { p.base.speed *= 1.12; },
  },
  {
    id: "maxHp", icon: "❤", name: "Vitality", rarity: "common",
    desc: "+20 max HP, heal 20",
    apply(p) { p.base.maxHp += 20; p.hp = Math.min(p.maxHp, p.hp + 20); },
  },
  {
    id: "bulletSpeed", icon: "➳", name: "Velocity Rounds", rarity: "common",
    desc: "+25% bullet speed",
    apply(p) { p.base.bulletSpeed *= 1.25; },
  },
  {
    id: "staminaRegen", icon: "◈", name: "Quick Recovery", rarity: "common",
    desc: "+25% stamina regen",
    apply(p) { p.base.staminaRegen *= 1.25; },
  },
  {
    id: "maxStamina", icon: "▲", name: "Endurance", rarity: "common",
    desc: "+20 max stamina",
    apply(p) { p.maxStamina += 20; p.stamina = p.maxStamina; },
  },
  {
    id: "magnet", icon: "◎", name: "Magnet", rarity: "common",
    desc: "+40% XP pickup range",
    apply(p) { p.base.pickupRadius *= 1.4; },
  },
  {
    id: "backpack", icon: "▣", name: "Bigger Backpack", rarity: "common",
    desc: "+2 backpack slots",
    available: (p) => p.backpackSlots < PLAYER.maxBackpackSlots,
    apply(p) { p.backpackSlots = Math.min(PLAYER.maxBackpackSlots, p.backpackSlots + 2); },
  },
  {
    id: "regen", icon: "✚", name: "Regeneration", rarity: "rare",
    desc: "Regenerate 1 HP/sec",
    apply(p) { p.base.regenPerSec += 1; },
  },
  {
    id: "multishot", icon: "☰", name: "Split Shot", rarity: "rare",
    desc: "+1 projectile per shot",
    apply(p) { p.multishot += 1; },
  },
  {
    id: "pierce", icon: "⇶", name: "Piercing Rounds", rarity: "rare",
    desc: "Bullets pierce +1 enemy",
    apply(p) { p.pierce += 1; },
  },
  {
    id: "bigDamage", icon: "☄", name: "Overcharge", rarity: "epic",
    desc: "+40% damage, -10% fire rate",
    apply(p) { p.base.damage *= 1.4; p.base.fireRate *= 0.9; },
  },
  {
    id: "glassCannonSpeed", icon: "✈", name: "Afterburner", rarity: "epic",
    desc: "+25% move speed, -10 max HP",
    apply(p) { p.base.speed *= 1.25; p.base.maxHp = Math.max(20, p.base.maxHp - 10); p.hp = Math.min(p.hp, p.maxHp); },
  },
  {
    id: "tripleShot", icon: "✺", name: "Triple Threat", rarity: "epic",
    desc: "+2 projectiles, tighter spread",
    apply(p) { p.multishot += 2; p.spreadDeg = Math.max(5, p.spreadDeg - 1); },
  },
];

const RARITY_WEIGHT = { common: 10, rare: 5, epic: 2 };

// A level-up card offering a freshly rolled weapon (mutated at higher threat).
function weaponOfferCard(threat, itemLevel) {
  const w = makeWeapon({ level: itemLevel, threat, minRarity: 1 });
  const b = WEAPON_BASES[w.base];
  const el = elementOf(w.element);
  const muts = w.mutations.map((m) => MUTATIONS[m].name).join(" + ");
  return {
    id: "weapon_" + w.id,
    weapon: w,
    icon: WEAPON_CLASSES[b.cls].glyph,
    iconColor: el.color,
    name: w.name,
    rarity: w.mutations.length ? "epic" : "rare",
    desc: `${WEAPON_CLASSES[b.cls].name} · ${el.name}${muts ? " · " + muts : ""}`,
    apply(p) { p.addWeaponItem(w); },
  };
}

// Three distinct picks. One is usually a new weapon (always, while there's
// a free weapon slot), the rest come from the stat pool.
function rollUpgrades(player, count = 3, threat = 1, itemLevel = 0) {
  const picks = [];
  const freeSlot = player.weaponSlots.includes(null);
  if (freeSlot || Math.random() < 0.45) picks.push(weaponOfferCard(threat, itemLevel));

  const pool = UPGRADES.filter((u) => !u.available || u.available(player));
  while (picks.length < count && pool.length > 0) {
    const chosen = weightedPick(pool.map((u) => ({ ...u, weight: RARITY_WEIGHT[u.rarity] })));
    picks.push(chosen);
    pool.splice(pool.findIndex((u) => u.id === chosen.id), 1);
  }
  return picks;
}
