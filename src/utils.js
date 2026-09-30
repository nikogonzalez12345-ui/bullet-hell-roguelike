function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
function dist(ax, ay, bx, by) { return Math.sqrt(dist2(ax, ay, bx, by)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
function wrapAngle(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

// Distance from point (px, py) to the segment (ax, ay)-(bx, by).
function pointSegDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1) : 0;
  return dist(px, py, ax + dx * t, ay + dy * t);
}

// Weighted pick: items = [{weight, ...}]
function weightedPick(items) {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    if (r < item.weight) return item;
    r -= item.weight;
  }
  return items[items.length - 1];
}

function circleHit(ax, ay, ar, bx, by, br) {
  return dist2(ax, ay, bx, by) <= (ar + br) * (ar + br);
}
