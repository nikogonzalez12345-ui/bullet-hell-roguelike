// DOM screens: main menu, pause, level-up, gear/backpack, game over.
// Pixel styling lives in style.css; this file only builds markup and wires
// clicks back to the Game.

const STAT_ROWS = [
  ["MAX HP", (p) => p.maxHp],
  ["ARMOR", (p) => `${Math.round(p.armor)} (-${Math.round((1 - 100 / (100 + p.armor)) * 100)}% DMG)`],
  ["DAMAGE", (p) => p.damage.toFixed(1)],
  ["FIRE RATE", (p) => `${p.fireRate.toFixed(1)}/S`],
  ["MOVE SPEED", (p) => Math.round(p.speed)],
  ["ROLL CD", (p) => `${p.rollCooldown.toFixed(2)}S`],
  ["REGEN", (p) => `${p.regenPerSec.toFixed(1)}/S`],
  ["PICKUP", (p) => Math.round(p.pickupRadius)],
];

class GameUI {
  constructor(game) {
    this.game = game;
    const $ = (id) => document.getElementById(id);
    this.screens = {
      mainMenu: $("mainMenu"),
      pauseMenu: $("pauseMenu"),
      levelUp: $("levelUpScreen"),
      inventory: $("inventoryScreen"),
      gameOver: $("gameOverScreen"),
    };
    this.el = {
      controls: $("controlsPanel"),
      cards: $("upgradeCards"),
      levelUpSub: $("levelUpSub"),
      equip: $("equipSlots"),
      weapons: $("weaponSlots"),
      affinity: $("affinityPanel"),
      stats: $("statsPanel"),
      bag: $("bagGrid"),
      bagTitle: $("bagTitle"),
      tooltip: $("tooltip"),
      finalStats: $("finalStats"),
      seedLabel: $("seedLabel"),
    };

    document.getElementById("app").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const a = btn.dataset.action;
      if (a === "new") game.newGame();
      else if (a === "controls") this.el.controls.classList.toggle("hidden");
      else if (a === "resume") game.resume();
      else if (a === "menu") game.toMainMenu();
      else if (a === "closeInv") game.closeInventory(true);
      else if (a === "fullscreen") game.toggleFullscreen();
    });
  }

  show(name) {
    for (const [key, el] of Object.entries(this.screens)) el.classList.toggle("hidden", key !== name);
    this.hideTooltip();
  }

  // ---- Level up ------------------------------------------------------------

  showLevelUp(picks, level, pending) {
    this.el.levelUpSub.textContent = pending > 1 ? `LEVEL ${level} · ${pending} PICKS LEFT` : `LEVEL ${level}`;
    this.el.cards.innerHTML = "";
    for (const u of picks) {
      const card = document.createElement("button");
      card.className = `card rarity-${u.rarity}` + (u.weapon ? " weapon-card" : "");
      card.innerHTML = `
        <div class="icon" ${u.iconColor ? `style="color:${u.iconColor}"` : ""}>${u.icon}</div>
        <div class="name">${u.name}</div>
        <div class="desc">${u.desc}</div>
        <div class="tag">${u.rarity.toUpperCase()}</div>`;
      card.addEventListener("click", () => this.game.chooseUpgrade(u));
      this.el.cards.appendChild(card);
    }
    this.show("levelUp");
  }

  // ---- Inventory -----------------------------------------------------------

  iconEl(item) {
    const c = document.createElement("canvas");
    c.width = c.height = 16;
    c.className = "item-icon";
    c.getContext("2d").drawImage(itemIcon(item), 0, 0);
    return c;
  }

  renderInventory() {
    const p = this.game.player;

    this.el.weapons.innerHTML = "";
    p.weaponSlots.forEach((item, i) => {
      const cell = document.createElement("div");
      cell.className = "slot weapon" + (item ? " filled" : "");
      cell.innerHTML = `<span class="slot-label">${i === 0 ? "HAND" : "W" + (i + 1)}</span>`;
      if (item) {
        cell.style.setProperty("--rc", itemColor(item));
        cell.appendChild(this.iconEl(item));
        cell.addEventListener("click", () => {
          if (!p.unequipWeapon(i)) this.game.hud.toast(p.backpackFull ? "BACKPACK FULL" : "KEEP AT LEAST ONE WEAPON", UI.hp.light);
          this.renderInventory();
        });
        this.bindTooltip(cell, item, null, "CLICK: UNEQUIP");
      }
      this.el.weapons.appendChild(cell);
    });

    this.el.affinity.innerHTML = ELEMENT_IDS.map((id) => {
      const el = ELEMENTS[id];
      const n = p.affinity[id];
      const tier = affinityTier(n);
      const bonuses = AFFINITY_TEXT[id].map((t, k) =>
        `<div class="aff-bonus ${k < tier ? "on" : ""}">${AFFINITY_TIERS[k]}: ${t.toUpperCase()}</div>`).join("");
      return `<div class="aff ${n ? "" : "dim"}" style="--ec:${el.color}">
        <div class="aff-head"><span class="aff-name">${el.name.toUpperCase()}</span><span>${n}</span></div>${bonuses}</div>`;
    }).join("");

    this.el.equip.innerHTML = "";
    for (const slot of EQUIP_SLOTS) {
      const item = p.equipped[slot];
      const cell = document.createElement("div");
      cell.className = "slot" + (item ? " filled" : "");
      if (item) cell.style.setProperty("--rc", itemColor(item));
      cell.innerHTML = `<span class="slot-label">${SLOT_BY_ID[slot].name.toUpperCase()}</span>`;
      if (item) {
        cell.appendChild(this.iconEl(item));
        cell.addEventListener("click", () => {
          if (!p.unequip(slot)) this.game.hud.toast("BACKPACK FULL", UI.hp.light);
          this.renderInventory();
        });
        this.bindTooltip(cell, item, null, "CLICK: UNEQUIP");
      }
      this.el.equip.appendChild(cell);
    }

    this.el.stats.innerHTML = STAT_ROWS.map(([k, f]) => `<div class="row"><span>${k}</span><span>${f(p)}</span></div>`).join("");

    this.el.bagTitle.textContent = `BACKPACK ${p.backpack.length}/${p.backpackSlots}`;
    this.el.bag.innerHTML = "";
    for (let i = 0; i < PLAYER.maxBackpackSlots; i++) {
      const cell = document.createElement("div");
      const item = p.backpack[i];
      const locked = i >= p.backpackSlots;
      cell.className = "slot" + (locked ? " locked" : "") + (item ? " filled" : "");
      if (item) {
        cell.style.setProperty("--rc", itemColor(item));
        cell.appendChild(this.iconEl(item));
        cell.addEventListener("click", () => {
          if (item.kind === "potion") {
            if (!p.drinkPotion(i)) this.game.hud.toast("ALREADY AT FULL HP", UI.muted);
          } else if (p.equipFromBackpack(i) === "slots-full") {
            this.game.hud.toast("WEAPON SLOTS FULL - UNEQUIP ONE FIRST", UI.hp.light);
          } else {
            this.game.autoSalvage(); // the swapped-out piece may now be outclassed
          }
          this.renderInventory();
        });
        cell.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          p.discard(i);
          this.renderInventory();
        });
        const current = item.kind === "gear" ? p.equipped[item.slot] : null;
        const action = item.kind === "potion" ? "DRINK" : current ? "SWAP" : "EQUIP";
        if (item.kind === "weapon") cell.classList.add("weapon");
        this.bindTooltip(cell, item, current, `CLICK: ${action} · RMB: DROP`);
      }
      this.el.bag.appendChild(cell);
    }
    this.hideTooltip();
  }

  itemHtml(item) {
    if (item.kind === "potion") {
      return `<div class="tt-name" style="color:${itemColor(item)}">${item.name.toUpperCase()}</div>
        <div class="tt-sub">CONSUMABLE</div><div class="tt-stat">RESTORES ${Math.round(item.heal * 100)}% HP</div>`;
    }
    const r = RARITY_BY_ID[item.rarity];
    const el = elementOf(item.element);
    const elLine = item.element && item.element !== "none"
      ? `<div class="tt-el" style="color:${el.color}">◆ ${el.name.toUpperCase()}</div>` : "";
    if (item.kind === "weapon") {
      const b = WEAPON_BASES[item.base];
      const p = this.game.player;
      const muts = item.mutations.map((m) =>
        `<div class="tt-mut">✦ ${MUTATIONS[m].name.toUpperCase()}: ${MUTATIONS[m].desc.toUpperCase()}</div>`).join("");
      return `<div class="tt-name" style="color:${r.color}">${item.name.toUpperCase()}</div>
        <div class="tt-sub">${r.name.toUpperCase()} ${WEAPON_CLASSES[b.cls].name.toUpperCase()} · ILVL ${item.level}</div>
        ${elLine}
        <div class="tt-stat">DPS ~${Math.round(weaponDps(item, p))}</div>
        <div class="tt-stat">${b.cls === "melee" ? "SWINGS" : "ATTACKS"} ${weaponRate(item, p).toFixed(1)}/S</div>
        ${muts}`;
    }
    return `<div class="tt-name" style="color:${r.color}">${item.name.toUpperCase()}</div>
      <div class="tt-sub">${r.name.toUpperCase()} ${SLOT_BY_ID[item.slot].name.toUpperCase()} · ILVL ${item.level}</div>
      ${elLine}
      ${statLines(item.stats).map((l) => `<div class="tt-stat">${l.toUpperCase()}</div>`).join("")}`;
  }

  bindTooltip(cell, item, compare, hint) {
    cell.addEventListener("mouseenter", () => {
      let html = this.itemHtml(item);
      if (compare) html += `<div class="tt-divider">EQUIPPED</div>${this.itemHtml(compare)}`;
      html += `<div class="tt-hint">${hint}</div>`;
      this.el.tooltip.innerHTML = html;
      this.el.tooltip.classList.remove("hidden");
    });
    cell.addEventListener("mousemove", (e) => this.moveTooltip(e));
    cell.addEventListener("mouseleave", () => this.hideTooltip());
  }

  moveTooltip(e) {
    const app = document.getElementById("app").getBoundingClientRect();
    const scale = app.width / CANVAS_W;
    const tt = this.el.tooltip;
    let x = (e.clientX - app.left) / scale + 16;
    let y = (e.clientY - app.top) / scale + 16;
    if (x + tt.offsetWidth > CANVAS_W - 8) x -= tt.offsetWidth + 32;
    if (y + tt.offsetHeight > CANVAS_H - 8) y = CANVAS_H - 8 - tt.offsetHeight;
    tt.style.left = x + "px";
    tt.style.top = y + "px";
  }

  hideTooltip() {
    this.el.tooltip.classList.add("hidden");
  }

  // ---- Game over / pause ---------------------------------------------------

  showGameOver(g) {
    const p = g.player;
    this.el.finalStats.innerHTML = [
      ["SURVIVED", fmtClock(g.director.time)],
      ["LEVEL", p.level],
      ["KILLS", p.kills],
      ["SCORE", g.score],
      ["ISLAND SEED", g.seed],
    ].map(([k, v]) => `<div class="row"><span>${k}</span><span>${v}</span></div>`).join("");
    this.show("gameOver");
  }

  showPause(g) {
    this.el.seedLabel.textContent = `ISLAND SEED ${g.seed}`;
    this.show("pauseMenu");
  }
}
