// Upgrade pool offered between waves. Each upgrade mutates the live Player
// instance directly — simple and easy to reason about for a jam-scale game.

const UPGRADES = [
  {
    id: "fireRate", icon: "⚡", name: "Rapid Fire", rarity: "common",
    desc: "+18% fire rate",
    apply(p) { p.fireRate *= 1.18; },
  },
  {
    id: "damage", icon: "🗲", name: "Sharpened Rounds", rarity: "common",
    desc: "+20% bullet damage",
    apply(p) { p.damage *= 1.2; },
  },
  {
    id: "speed", icon: "👟", name: "Light Feet", rarity: "common",
    desc: "+12% move speed",
    apply(p) { p.speed *= 1.12; },
  },
  {
    id: "maxHp", icon: "❤", name: "Vitality", rarity: "common",
    desc: "+20 max HP, heal 20",
    apply(p) { p.maxHp += 20; p.hp = Math.min(p.maxHp, p.hp + 20); },
  },
  {
    id: "bulletSpeed", icon: "➳", name: "Velocity Rounds", rarity: "common",
    desc: "+25% bullet speed",
    apply(p) { p.bulletSpeed *= 1.25; },
  },
  {
    id: "dashCooldown", icon: "◈", name: "Quick Recovery", rarity: "common",
    desc: "-20% dash cooldown",
    apply(p) { p.dashCooldown *= 0.8; },
  },
  {
    id: "regen", icon: "✚", name: "Regeneration", rarity: "rare",
    desc: "Regenerate 1 HP/sec",
    apply(p) { p.regenPerSec += 1; },
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
    apply(p) { p.damage *= 1.4; p.fireRate *= 0.9; },
  },
  {
    id: "glassCannonSpeed", icon: "✈", name: "Afterburner", rarity: "epic",
    desc: "+25% move speed, -10 max HP",
    apply(p) { p.speed *= 1.25; p.maxHp = Math.max(20, p.maxHp - 10); p.hp = Math.min(p.hp, p.maxHp); },
  },
  {
    id: "tripleShot", icon: "✺", name: "Triple Threat", rarity: "epic",
    desc: "+2 projectiles, tighter spread",
    apply(p) { p.multishot += 2; p.spreadDeg = Math.max(5, p.spreadDeg - 1); },
  },
];

// Weapon-unlock cards — filtered out of the pool once owned or once the
// player has hit MAX_EQUIPPED_WEAPONS (see rollUpgrades).
const WEAPON_UPGRADES = [
  {
    id: "unlock_shotgun", weaponId: "shotgun", icon: WEAPONS.shotgun.icon, name: "Unlock: Shotgun", rarity: "rare",
    desc: "5-pellet close-range spread, fires alongside your other guns",
    apply(p) { p.addWeapon("shotgun"); },
  },
  {
    id: "unlock_smg", weaponId: "smg", icon: WEAPONS.smg.icon, name: "Unlock: SMG", rarity: "rare",
    desc: "Very fast, lower damage, slight spray",
    apply(p) { p.addWeapon("smg"); },
  },
  {
    id: "unlock_laser", weaponId: "laser", icon: WEAPONS.laser.icon, name: "Unlock: Laser", rarity: "epic",
    desc: "Fast piercing beam shots (+3 pierce)",
    apply(p) { p.addWeapon("laser"); },
  },
  {
    id: "unlock_missile", weaponId: "missile", icon: WEAPONS.missile.icon, name: "Unlock: Missile Launcher", rarity: "epic",
    desc: "Slow homing missiles, heavy damage",
    apply(p) { p.addWeapon("missile"); },
  },
];

const RARITY_WEIGHT = { common: 10, rare: 5, epic: 2 };

function rollUpgrades(player, count = 3) {
  const weaponCards = WEAPON_UPGRADES.filter(
    (u) => player.weapons.length < MAX_EQUIPPED_WEAPONS && !player.weapons.includes(u.weaponId)
  );
  const pool = [...UPGRADES, ...weaponCards];
  const picks = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const weighted = pool.map((u) => ({ ...u, weight: RARITY_WEIGHT[u.rarity] }));
    const chosen = weightedPick(weighted);
    picks.push(chosen);
    const idx = pool.findIndex((u) => u.id === chosen.id);
    pool.splice(idx, 1);
  }
  return picks;
}
