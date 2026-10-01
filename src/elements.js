// Elements — the "subgroupings" every weapon and most armor belong to.
//
// Three layers create the synergies:
//   1. Each element applies a status on hit (burn, chill/freeze, shock…).
//   2. Hitting an enemy that carries another element's status triggers a
//      REACTION (fire on a frozen enemy shatters it, energy on a slimed one
//      conducts through the whole slimed group…).
//   3. Affinity: the more equipped items share an element, the stronger it
//      gets, with set bonuses at 2/4/6 items.

const ELEMENTS = {
  fire:   { id: "fire",   name: "Fire",   adj: "Ember",   color: "#ff7a2a", light: "#ffd06a", dark: "#7a2410", armor: "#8a2a14" },
  frost:  { id: "frost",  name: "Frost",  adj: "Glacial", color: "#7ad8ff", light: "#e8faff", dark: "#2a5a8a", armor: "#8ab8d0" },
  energy: { id: "energy", name: "Energy", adj: "Volt",    color: "#ffe83a", light: "#fffbd0", dark: "#8a6a0a", armor: "#3a3a4a" },
  slime:  { id: "slime",  name: "Slime",  adj: "Toxic",   color: "#6ae83a", light: "#c8ff9a", dark: "#1f5a14", armor: "#3a7a2a" },
  light:  { id: "light",  name: "Light",  adj: "Radiant", color: "#ffe9a0", light: "#ffffff", dark: "#b8903a", armor: "#e8e0c8" },
  dark:   { id: "dark",   name: "Dark",   adj: "Void",    color: "#a45aff", light: "#dab0ff", dark: "#2a0a4a", armor: "#2a1a3a" },
};
const ELEMENT_IDS = Object.keys(ELEMENTS);
const NEUTRAL = { id: "none", name: "Neutral", adj: "", color: "#d8e0e8", light: "#ffffff", dark: "#6a7080", armor: "#6a5a50" };
const elementOf = (id) => ELEMENTS[id] || NEUTRAL;

const AFFINITY_TIERS = [2, 4, 6];
const affinityTier = (count) => (count >= 6 ? 3 : count >= 4 ? 2 : count >= 2 ? 1 : 0);

const AFFINITY_TEXT = {
  fire:   ["Burn deals +50% damage", "Burning enemies explode on death", "Every hit you land ignites"],
  frost:  ["Chill slows 50% harder", "Frozen enemies take +50% damage", "Frost nova around you every 6s"],
  energy: ["Chain lightning +1 jump", "+15% attack speed", "Every 5th attack calls lightning"],
  slime:  ["Slime puddles grow bigger", "Slimed enemies take +15% more damage", "Leave a slime trail while moving"],
  light:  ["+1 pierce on every shot", "Radiant kills heal 3 HP", "2 holy orbs orbit you"],
  dark:   ["+4% lifesteal on dark damage", "Curse detonates at 6 stacks", "Kills release homing void wisps"],
};

const REACTIONS = [
  { a: "fire",   b: "frost", name: "SHATTER",      color: "#ffe0c0" },
  { a: "fire",   b: "slime", name: "BLAZE",        color: "#ffb03a" },
  { a: "energy", b: "slime", name: "CONDUCT",      color: "#d8ff5a" },
  { a: "energy", b: "frost", name: "SUPERCONDUCT", color: "#b0f0ff" },
  { a: "light",  b: "dark",  name: "ECLIPSE",      color: "#ffffff" },
  { a: "slime",  b: "dark",  name: "PLAGUE",       color: "#b0ff6a" },
];

function newStatus() {
  return { fire: 0, frost: 0, energy: 0, slime: 0, light: 0, dark: 0 };
}

// Extra damage an enemy takes from its current statuses.
function enemyDamageMult(game, e) {
  const p = game.player;
  let m = 1;
  if (e.status.slime > 0) m += 0.15 + (p.tier("slime") >= 2 ? 0.15 : 0);
  if (e.curse) m += e.curse * 0.03;
  if (e.vulnT > 0) m += 0.4;
  if (e.frozenT > 0 && p.tier("frost") >= 2) m += 0.5;
  return m;
}

// Called by Game.damageEnemy for every elemental hit.
function applyElement(game, e, el, dmg, src) {
  if (!el || !e.alive) return;
  const p = game.player;
  const pot = p.potency(el);

  // Reactions consume the other element's status instead of stacking.
  for (const r of REACTIONS) {
    const other = r.a === el ? r.b : r.b === el ? r.a : null;
    if (other && e.status[other] > 0 && game.reactionBudget > 0) {
      game.reactionBudget--;
      e.status[other] = 0;
      triggerReaction(game, r, e, dmg, pot);
      return;
    }
  }

  const tier = p.tier(el);
  switch (el) {
    case "fire":
      e.status.fire = 3;
      e.burnDps = Math.max(e.burnDps || 0, dmg * 0.35 * pot * (tier >= 1 ? 1.5 : 1));
      break;
    case "frost":
      e.status.frost = 2.4;
      e.chill = Math.min(4, (e.chill || 0) + 1);
      if (e.chill >= 4 && !e.isBoss) {
        e.frozenT = 0.9 + 0.15 * p.affinity.frost;
        e.chill = 0;
      }
      break;
    case "energy": {
      e.status.energy = 1.5;
      const chance = 0.3 + 0.05 * p.affinity.energy;
      if (Math.random() < chance) game.chain(e, 2 + (tier >= 1 ? 1 : 0), 180, dmg * 0.6 * pot, "energy");
      break;
    }
    case "slime":
      e.status.slime = 3.5;
      break;
    case "light":
      e.status.light = 3;
      break;
    case "dark":
      e.status.dark = 5;
      e.curse = Math.min(10, (e.curse || 0) + 1);
      if (tier >= 2 && e.curse >= 6) {
        e.curse = 0;
        game.popup(e, "DOOM", ELEMENTS.dark.light);
        SOUND.play("reaction", "DOOM");
        game.explode(e.x, e.y, 80, dmg * 2 * pot, null, src);
      }
      break;
  }
}

function triggerReaction(game, r, e, dmg, pot) {
  game.popup(e, r.name, r.color);
  SOUND.play("reaction", r.name);
  game.shake(0.12);
  game.freeze(0.025);
  switch (r.name) {
    case "SHATTER":
      game.spawnParticles(e.x, e.y, ELEMENTS.frost.light, 14);
      game.damageEnemy(e, dmg * 2.5 * pot, null);
      break;
    case "BLAZE":
      game.explode(e.x, e.y, 100, dmg * 1.3 * pot, "fire");
      break;
    case "CONDUCT":
      // Arcs to every slimed enemy nearby — which can set off more conducts.
      for (const o of game.enemies) {
        if (o !== e && o.alive && o.status.slime > 0 && dist(o.x, o.y, e.x, e.y) < 300) {
          game.bolt(e.x, e.y, o.x, o.y, ELEMENTS.energy.color);
          game.damageEnemy(o, dmg * 0.9 * pot, "energy");
        }
      }
      break;
    case "SUPERCONDUCT":
      e.vulnT = 4;
      game.damageEnemy(e, dmg * 0.6 * pot, null);
      break;
    case "ECLIPSE":
      game.explode(e.x, e.y, 140, dmg * 2 * pot, null);
      game.healPlayer(4);
      break;
    case "PLAGUE":
      for (const o of game.enemies) {
        if (o.alive && dist(o.x, o.y, e.x, e.y) < 170) {
          o.status.slime = 3.5;
          o.status.dark = 5;
          o.curse = Math.min(10, (o.curse || 0) + 2);
          game.spawnParticles(o.x, o.y, ELEMENTS.slime.color, 3);
        }
      }
      game.damageEnemy(e, dmg * 0.8 * pot, null);
      break;
  }
}

// Per-frame status upkeep: DoTs, slows, freezes, visual tint.
function updateEnemyStatus(game, e, dt) {
  const s = e.status;
  for (const k in s) if (s[k] > 0) s[k] -= dt;
  if (e.frozenT > 0) e.frozenT -= dt;
  if (e.vulnT > 0) e.vulnT -= dt;
  if (s.frost <= 0) e.chill = 0;
  if (s.dark <= 0) e.curse = 0;

  if (s.fire > 0 && e.burnDps > 0) {
    game.damageEnemy(e, e.burnDps * dt, null, null, true);
    if (Math.random() < dt * 8) game.spawnParticles(e.x, e.y, Math.random() < 0.5 ? "#ff7a2a" : "#ffd06a", 1);
  } else {
    e.burnDps = 0;
  }
  if (s.slime > 0 && Math.random() < dt * 4) game.spawnParticles(e.x, e.y, ELEMENTS.slime.color, 1);

  const chillSlow = Math.min(0.65, 0.13 * (e.chill || 0) * (game.player.tier("frost") >= 1 ? 1.5 : 1));
  e.slowMul = e.frozenT > 0 ? 0 : (1 - chillSlow) * (s.slime > 0 ? 0.85 : 1);

  // Tint for the renderer: strongest active status wins.
  if (e.frozenT > 0) e.tint = [ELEMENTS.frost.light, 0.6];
  else if (s.fire > 0) e.tint = [ELEMENTS.fire.color, 0.25 + 0.15 * Math.sin(performance.now() / 60)];
  else if (s.energy > 0) e.tint = [ELEMENTS.energy.color, Math.random() < 0.5 ? 0.45 : 0.1];
  else if (s.frost > 0) e.tint = [ELEMENTS.frost.color, 0.3];
  else if (s.slime > 0) e.tint = [ELEMENTS.slime.color, 0.3];
  else if (s.dark > 0) e.tint = [ELEMENTS.dark.color, 0.3];
  else if (s.light > 0) e.tint = [ELEMENTS.light.color, 0.25];
  else e.tint = null;
}
