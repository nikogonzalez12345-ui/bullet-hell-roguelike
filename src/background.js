// Layered night-time Japanese cityscape. Static layers (stars, skyline,
// rooftop) are rasterized once to offscreen canvases; only cheap per-frame
// work (neon flicker, drifting clouds, falling petals) touches the main
// canvas every tick.

class Background {
  constructor() {
    this.time = 0;
    this.stars = getSprite("bg_stars", CANVAS_W, CANVAS_H, (ctx) => this.paintSky(ctx));
    this.skyline = getSprite("bg_skyline", CANVAS_W, CANVAS_H, (ctx) => this.paintSkyline(ctx));
    this.rooftop = getSprite("bg_rooftop", CANVAS_W, CANVAS_H, (ctx) => this.paintRooftop(ctx));
    this.signs = this.buildSigns();
    this.clouds = this.buildClouds();
    this.petals = this.buildPetals();
  }

  paintSky(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    g.addColorStop(0, "#0b0821");
    g.addColorStop(0.55, "#1a1240");
    g.addColorStop(1, "#2a1030");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // moon
    ctx.save();
    ctx.fillStyle = "#ffeecb";
    ctx.shadowColor = "#ffeecb";
    ctx.shadowBlur = 40;
    ctx.beginPath();
    ctx.arc(CANVAS_W - 130, 90, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // stars
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    for (let i = 0; i < 140; i++) {
      const x = rand(0, CANVAS_W), y = rand(0, CANVAS_H * 0.6);
      const s = Math.random() < 0.15 ? 1.6 : 0.9;
      ctx.globalAlpha = rand(0.3, 1);
      ctx.fillRect(x, y, s, s);
    }
    ctx.globalAlpha = 1;
  }

  paintSkyline(ctx) {
    // distant mountain + pagoda silhouette
    ctx.fillStyle = "#150e33";
    ctx.beginPath();
    ctx.moveTo(0, 260);
    ctx.lineTo(120, 190);
    ctx.lineTo(220, 250);
    ctx.lineTo(340, 170);
    ctx.lineTo(460, 240);
    ctx.lineTo(600, 200);
    ctx.lineTo(740, 250);
    ctx.lineTo(CANVAS_W, 210);
    ctx.lineTo(CANVAS_W, 340);
    ctx.lineTo(0, 340);
    ctx.closePath();
    ctx.fill();

    // pagoda silhouette
    this.drawPagoda(ctx, 340, 168);

    // mid skyline buildings with lit windows
    let x = -20;
    let seed = 1;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    while (x < CANVAS_W + 20) {
      const w = 40 + rnd() * 50;
      const h = 90 + rnd() * 170;
      const y = 400 - h;
      ctx.fillStyle = "#1c1440";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.strokeRect(x, y, w, h);
      // windows
      for (let wy = y + 10; wy < 390; wy += 14) {
        for (let wx = x + 6; wx < x + w - 6; wx += 12) {
          if (rnd() < 0.35) {
            ctx.fillStyle = rnd() < 0.5 ? "rgba(255,214,128,0.85)" : "rgba(125,211,255,0.7)";
            ctx.fillRect(wx, wy, 4, 5);
          }
        }
      }
      x += w + rnd() * 14;
    }
  }

  drawPagoda(ctx, cx, baseY) {
    ctx.fillStyle = "#120a2a";
    const tiers = 3;
    for (let i = 0; i < tiers; i++) {
      const w = 70 - i * 16;
      const y = baseY - i * 26;
      ctx.beginPath();
      ctx.moveTo(cx - w / 2, y);
      ctx.lineTo(cx + w / 2, y);
      ctx.lineTo(cx + w / 2 - 8, y - 14);
      ctx.lineTo(cx - w / 2 + 8, y - 14);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(cx - w / 2 + 10, y - 26, w - 20, 12);
    }
    ctx.fillRect(cx - 3, baseY - tiers * 26 - 14, 6, 16);
  }

  paintRooftop(ctx) {
    // foreground rooftop silhouette across the bottom of the arena
    ctx.fillStyle = "#0a0716";
    ctx.beginPath();
    ctx.moveTo(0, CANVAS_H);
    ctx.lineTo(0, CANVAS_H - 60);
    ctx.lineTo(90, CANVAS_H - 60);
    ctx.lineTo(90, CANVAS_H - 95);
    ctx.lineTo(230, CANVAS_H - 95);
    ctx.lineTo(230, CANVAS_H - 55);
    ctx.lineTo(420, CANVAS_H - 55);
    ctx.lineTo(420, CANVAS_H - 100);
    ctx.lineTo(600, CANVAS_H - 100);
    ctx.lineTo(600, CANVAS_H - 50);
    ctx.lineTo(800, CANVAS_H - 50);
    ctx.lineTo(800, CANVAS_H - 90);
    ctx.lineTo(CANVAS_W, CANVAS_H - 90);
    ctx.lineTo(CANVAS_W, CANVAS_H);
    ctx.closePath();
    ctx.fill();

    // water tank silhouette
    ctx.fillStyle = "#0a0716";
    ctx.fillRect(150, CANVAS_H - 130, 26, 35);
    ctx.beginPath();
    ctx.moveTo(146, CANVAS_H - 130);
    ctx.lineTo(180, CANVAS_H - 130);
    ctx.lineTo(163, CANVAS_H - 148);
    ctx.closePath();
    ctx.fill();

    // antenna
    ctx.strokeStyle = "#0a0716";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(500, CANVAS_H - 100);
    ctx.lineTo(500, CANVAS_H - 140);
    ctx.stroke();
  }

  buildSigns() {
    // Neon signboards: simple glowing blocks with a kanji-ish stroke pattern,
    // scattered along the mid skyline. Each flickers independently.
    const palette = ["#ff3b8c", "#3bf7ff", "#ffe63b", "#7dff8f", "#b56bff"];
    const signs = [];
    const positions = [
      [60, 250], [170, 300], [280, 220], [400, 290], [510, 240],
      [630, 300], [720, 230], [850, 280], [900, 200],
    ];
    for (let i = 0; i < positions.length; i++) {
      signs.push({
        x: positions[i][0], y: positions[i][1],
        w: rand(14, 22), h: rand(18, 30),
        color: palette[i % palette.length],
        phase: rand(0, Math.PI * 2),
        speed: rand(1.5, 3.5),
      });
    }
    return signs;
  }

  buildClouds() {
    const clouds = [];
    for (let i = 0; i < 5; i++) {
      clouds.push({
        x: rand(0, CANVAS_W), y: rand(20, 160),
        w: rand(80, 180), speed: rand(4, 10),
        alpha: rand(0.04, 0.1),
      });
    }
    return clouds;
  }

  buildPetals() {
    const petals = [];
    for (let i = 0; i < 26; i++) {
      petals.push({
        x: rand(0, CANVAS_W), y: rand(0, CANVAS_H),
        vx: rand(-20, -55), vy: rand(30, 60),
        size: rand(2, 4), sway: rand(0, Math.PI * 2),
        swaySpeed: rand(1, 2.2),
      });
    }
    return petals;
  }

  update(dt) {
    this.time += dt;
    for (const c of this.clouds) {
      c.x += c.speed * dt;
      if (c.x - c.w > CANVAS_W) c.x = -c.w;
    }
    for (const p of this.petals) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.sway += p.swaySpeed * dt;
      if (p.y > CANVAS_H + 10 || p.x < -10) {
        p.x = rand(CANVAS_W * 0.4, CANVAS_W + 10);
        p.y = -10;
      }
    }
  }

  draw(ctx) {
    ctx.drawImage(this.stars, 0, 0);
    ctx.drawImage(this.skyline, 0, 0);

    // drifting clouds (soft blobs, drawn live because they scroll)
    for (const c of this.clouds) {
      ctx.save();
      ctx.globalAlpha = c.alpha;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.w, c.w * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // flickering neon signs
    for (const s of this.signs) {
      const flicker = 0.65 + 0.35 * Math.sin(this.time * s.speed + s.phase);
      ctx.save();
      ctx.globalAlpha = clamp(flicker, 0.35, 1);
      ctx.fillStyle = s.color;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 14;
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = "rgba(10,7,20,0.55)";
      ctx.shadowBlur = 0;
      for (let ly = s.y + 3; ly < s.y + s.h - 2; ly += 6) {
        ctx.fillRect(s.x + 2, ly, s.w - 4, 2);
      }
      ctx.restore();
    }

    ctx.drawImage(this.rooftop, 0, 0);

    // falling cherry blossom petals (foreground, over rooftop for depth)
    ctx.save();
    ctx.fillStyle = "#ffb3d1";
    for (const p of this.petals) {
      const px = p.x + Math.sin(p.sway) * 12;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.ellipse(px, p.y, p.size, p.size * 0.6, p.sway, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
