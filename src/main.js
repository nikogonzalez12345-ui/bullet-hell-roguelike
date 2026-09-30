(function () {
  const app = document.getElementById("app");
  const view = document.getElementById("view");
  const overlay = document.getElementById("overlay");
  const renderer = new Renderer3D(view);
  const game = new Game(renderer, overlay.getContext("2d"));
  window.game = game; // handy for debugging from the console

  function fitToWindow() {
    const s = clamp(Math.min((innerWidth - 24) / CANVAS_W, (innerHeight - 24) / CANVAS_H), 0.3, 2);
    app.style.transform = `translate(-50%, -50%) scale(${s})`;
  }
  window.addEventListener("resize", fitToWindow);
  fitToWindow();

  const input = {
    up: false, down: false, left: false, right: false,
    mouseDown: false,
    dashPressed: false,
  };

  // ---- Pointer lock: mouse-look needs it; losing it (Esc) pauses. --------
  let hadLock = false;
  game.lockPointer = () => {
    if (document.pointerLockElement === app || !app.requestPointerLock) return;
    try {
      const r = app.requestPointerLock();
      if (r && r.catch) r.catch(() => {});
    } catch (_) { /* unsupported (e.g. some iframes) — mousemove fallback below */ }
  };
  game.unlockPointer = () => {
    hadLock = false;
    input.mouseDown = false;
    if (document.pointerLockElement) document.exitPointerLock();
  };
  document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement === app) {
      hadLock = true;
    } else if (hadLock) {
      hadLock = false;
      input.mouseDown = false;
      game.pause();
    }
  });

  document.addEventListener("mousemove", (e) => {
    const locked = document.pointerLockElement === app;
    // Without lock (unsupported browser), still turn while over the 3D view.
    if (locked || e.target === view) game.look(e.movementX || 0);
  });

  // ---- Keyboard ------------------------------------------------------------
  const KEY_MAP = {
    KeyW: "up", ArrowUp: "up",
    KeyS: "down", ArrowDown: "down",
    KeyA: "left", ArrowLeft: "left",
    KeyD: "right", ArrowRight: "right",
  };

  window.addEventListener("keydown", (e) => {
    const dir = KEY_MAP[e.code];
    if (dir) { input[dir] = true; e.preventDefault(); }
    if (e.code === "Space") { input.dashPressed = true; e.preventDefault(); }
    if (e.repeat) return;
    if (e.code === "Tab" || e.code === "KeyI") {
      e.preventDefault();
      if (game.state === STATE.INVENTORY) game.closeInventory(true);
      else game.openInventory();
    }
    if (e.code === "Escape" && game.state === STATE.INVENTORY) game.closeInventory(false);
    if (e.code === "KeyQ") game.usePotion();
    if (e.code === "KeyP") game.state === STATE.PAUSED ? game.resume() : game.pause();
  });
  window.addEventListener("keyup", (e) => {
    const dir = KEY_MAP[e.code];
    if (dir) { input[dir] = false; e.preventDefault(); }
    if (e.code === "Space") input.dashPressed = false;
  });
  window.addEventListener("blur", () => {
    input.up = input.down = input.left = input.right = input.mouseDown = false;
  });

  // ---- Mouse buttons ---------------------------------------------------------
  view.addEventListener("mousedown", (e) => {
    if (game.state !== STATE.PLAYING) return;
    if (document.pointerLockElement !== app) game.lockPointer();
    if (e.button === 0) input.mouseDown = true;
    if (e.button === 2) input.dashPressed = true;
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button === 0) input.mouseDown = false;
    if (e.button === 2) input.dashPressed = false;
  });
  app.addEventListener("contextmenu", (e) => e.preventDefault());

  // Roll is edge-triggered: consume the press so holding space doesn't chain-roll.
  function consumeDashPress() {
    const pressed = input.dashPressed;
    input.dashPressed = false;
    return pressed;
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    game.update(dt, { ...input, dashPressed: consumeDashPress() });
    game.render(dt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
