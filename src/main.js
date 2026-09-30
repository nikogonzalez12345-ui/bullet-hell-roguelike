(function () {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const game = new Game(ctx);
  window.game = game; // handy for debugging from the console

  const input = {
    up: false, down: false, left: false, right: false,
    mouseX: null, mouseY: null,
    mouseDown: false,
    dashPressed: false,
  };

  const KEY_MAP = {
    w: "up", ArrowUp: "up",
    s: "down", ArrowDown: "down",
    a: "left", ArrowLeft: "left",
    d: "right", ArrowRight: "right",
  };

  window.addEventListener("keydown", (e) => {
    const dir = KEY_MAP[e.key];
    if (dir) { input[dir] = true; e.preventDefault(); }
    if (e.code === "Space") { input.dashPressed = true; e.preventDefault(); }
  });

  window.addEventListener("keyup", (e) => {
    const dir = KEY_MAP[e.key];
    if (dir) { input[dir] = false; e.preventDefault(); }
    if (e.code === "Space") input.dashPressed = false;
  });

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    input.mouseX = (e.clientX - rect.left) * scaleX;
    input.mouseY = (e.clientY - rect.top) * scaleY;
  });

  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 0) input.mouseDown = true;
    if (e.button === 2) input.dashPressed = true;
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button === 0) input.mouseDown = false;
    if (e.button === 2) input.dashPressed = false;
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  // Dash is edge-triggered: consume the press so holding space doesn't chain-dash.
  function consumeDashPress() {
    const pressed = input.dashPressed;
    input.dashPressed = false;
    return pressed;
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    const frameInput = { ...input, dashPressed: consumeDashPress() };
    game.update(dt, frameInput);
    game.draw();

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
