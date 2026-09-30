// Weapon firing logic. Each equipped weapon runs its own cooldown (see
// Player.update) and calls into here to actually spawn bullets — kept
// separate from Player so adding a new gun is "add a WEAPONS entry + a
// case here", not a change to the player's core update loop.

const MAX_EQUIPPED_WEAPONS = 4;

function findNearestEnemy(x, y, enemies) {
  let best = null, bestD = Infinity;
  for (const e of enemies) {
    if (!e.alive) continue;
    const d = dist2(x, y, e.x, e.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

function fireWeapon(weaponId, player, bullets, enemies) {
  const def = WEAPONS[weaponId];
  const originX = player.x + Math.cos(player.aimAngle) * (player.radius + 6);
  const originY = player.y + Math.sin(player.aimAngle) * (player.radius + 6);

  const damage = player.damage * def.damageMul;
  const speed = player.bulletSpeed * (def.speedMul || 1);
  const radius = player.bulletRadius * (def.radiusMul || 1);
  const pierce = player.pierce + (def.pierce || 0);

  switch (weaponId) {
    case "shotgun": {
      const count = def.pellets;
      const spread = def.spreadDeg * (Math.PI / 180);
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0 : i / (count - 1) - 0.5;
        const angle = player.aimAngle + t * spread + rand(-0.03, 0.03);
        bullets.push(new Bullet({
          x: originX, y: originY,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          radius, damage, pierce, owner: "player", color: def.color,
          life: def.life,
        }));
      }
      break;
    }

    case "smg": {
      const count = player.multishot;
      const spread = (count - 1) * player.spreadDeg;
      const start = player.aimAngle - (spread / 2) * (Math.PI / 180);
      for (let i = 0; i < count; i++) {
        const jitter = rand(-def.jitterDeg, def.jitterDeg) * (Math.PI / 180);
        const angle = (count === 1 ? player.aimAngle : start + i * player.spreadDeg * (Math.PI / 180)) + jitter;
        bullets.push(new Bullet({
          x: originX, y: originY,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          radius, damage, pierce, owner: "player", color: def.color,
        }));
      }
      break;
    }

    case "laser": {
      const count = player.multishot;
      const spread = (count - 1) * player.spreadDeg;
      const start = player.aimAngle - (spread / 2) * (Math.PI / 180);
      for (let i = 0; i < count; i++) {
        const angle = count === 1 ? player.aimAngle : start + i * player.spreadDeg * (Math.PI / 180);
        bullets.push(new Bullet({
          x: originX, y: originY,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          radius, damage, pierce, owner: "player", color: def.color,
          life: 3,
        }));
      }
      break;
    }

    case "missile": {
      const target = findNearestEnemy(player.x, player.y, enemies);
      const angle = target ? angleTo(player.x, player.y, target.x, target.y) : player.aimAngle;
      bullets.push(new Bullet({
        x: originX, y: originY,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        radius, damage, pierce, owner: "player", color: def.color,
        homing: def.homing, target, life: 3.5,
      }));
      break;
    }

    default: { // pistol
      const count = player.multishot;
      const spread = (count - 1) * player.spreadDeg;
      const start = player.aimAngle - (spread / 2) * (Math.PI / 180);
      for (let i = 0; i < count; i++) {
        const angle = count === 1 ? player.aimAngle : start + i * player.spreadDeg * (Math.PI / 180);
        bullets.push(new Bullet({
          x: originX, y: originY,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          radius, damage, pierce, owner: "player", color: def.color,
        }));
      }
    }
  }
}
