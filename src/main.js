(function () {
  const app = document.getElementById("app");
  const view = document.getElementById("view");
  const overlay = document.getElementById("overlay");

  // Fill the whole window: the UI works in logical pixels (at least 960x600)
  // scaled up to the real window, and the 3D view matches the window's aspect.
  let renderer = null;
  function fitToWindow() {
    const s = setViewport(innerWidth, innerHeight);
    app.style.width = CANVAS_W + "px";
    app.style.height = CANVAS_H + "px";
    app.style.transform = `scale(${s})`;
    overlay.width = CANVAS_W;
    overlay.height = CANVAS_H;
    if (renderer) renderer.resize();
  }
  fitToWindow();
  renderer = new Renderer3D(view);
  renderer.resize();
  window.addEventListener("resize", fitToWindow);

  const game = new Game(renderer, overlay.getContext("2d"));
  window.game = game; // handy for debugging from the console

  // True fullscreen on New Game (must happen inside the click that starts it).
  game.enterFullscreen = () => {
    if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
    const r = document.documentElement.requestFullscreen();
    if (r && r.catch) r.catch(() => {});
  };
  game.toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else game.enterFullscreen();
  };

  // Build tag (the ?v= on this script's URL) shown on the main menu, so it's
  // obvious whether a browser is running the latest deploy.
  const build = new URL(document.currentScript.src).searchParams.get("v") || "dev";
  document.getElementById("buildTag").textContent = `BUILD ${build}`;

  const input = {
    up: false, down: false, left: false, right: false,
    mouseDown: false,
    fireQueued: false, // latched on press so even a very quick click fires once
    sprint: false,     // held
    jumpPressed: false, // edge-triggered: latched on press, cleared when the game reads it
    rollPressed: false,
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
    if (locked || e.target === view) game.look(e.movementX || 0, e.movementY || 0);
  });
  // Scroll wheel zooms the camera.
  window.addEventListener("wheel", (e) => {
    if (game.state !== STATE.PLAYING) return;
    e.preventDefault();
    game.zoom(e.deltaY);
  }, { passive: false });

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
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") input.sprint = true;
    if (e.code === "Space") e.preventDefault();
    if (e.repeat) return;
    if (e.code === "Space") input.jumpPressed = true;
    if (e.code === "Tab" || e.code === "KeyI") {
      e.preventDefault();
      if (game.state === STATE.INVENTORY) game.closeInventory(true);
      else game.openInventory();
    }
    if (e.code === "Escape" && game.state === STATE.INVENTORY) game.closeInventory(false);
    if (e.code === "KeyQ") game.usePotion();
    if (e.code === "KeyF") game.toggleAutoFire();
    if (e.code === "KeyP") game.state === STATE.PAUSED ? game.resume() : game.pause();
  });
  window.addEventListener("keyup", (e) => {
    const dir = KEY_MAP[e.code];
    if (dir) { input[dir] = false; e.preventDefault(); }
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") input.sprint = false;
  });
  window.addEventListener("blur", () => {
    input.up = input.down = input.left = input.right = input.mouseDown = input.sprint = false;
  });

  // ---- Mouse buttons ---------------------------------------------------------
  // Listen on #app, not the canvas: while the pointer is locked, the browser
  // delivers every mouse event to the lock target (#app) instead.
  app.addEventListener("mousedown", (e) => {
    if (game.state !== STATE.PLAYING) return;
    const locked = document.pointerLockElement === app;
    if (!locked && e.target !== view) return;
    if (!locked) game.lockPointer();
    if (e.button === 0) {
      input.mouseDown = true;
      input.fireQueued = true;
    }
    if (e.button === 2) input.rollPressed = true;
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button === 0) input.mouseDown = false;
  });
  app.addEventListener("contextmenu", (e) => e.preventDefault());

  // Browsers only allow audio after a user gesture.
  const unlockAudio = () => {
    SOUND.unlock();
    SOUND.music.start();
  };
  window.addEventListener("pointerdown", unlockAudio, true);
  window.addEventListener("keydown", unlockAudio, true);

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    // Hit-stop: freeze the simulation (and animation) for a few frames on
    // big impacts. One-shot inputs stay latched until play resumes.
    if (game.hitStop > 0) {
      game.hitStop -= dt;
      game.render(0);
      requestAnimationFrame(loop);
      return;
    }
    const firing = input.mouseDown || input.fireQueued || game.autoFire;
    const frameInput = { ...input, mouseDown: firing };
    // One-shot presses are consumed by exactly one frame (holding Space
    // doesn't bunny-hop, a quick tap is never missed).
    input.fireQueued = input.jumpPressed = input.rollPressed = false;
    game.update(dt, frameInput);
    game.render(dt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
