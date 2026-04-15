import { PX, GRID_PX, SNAP_D, AXIS_SNAP, WALL_BUF } from "./constants.js";

export const uid = () => "p_" + Math.random().toString(36).slice(2, 9);
export const dist = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
export const snapV = (v) => { const s = Math.round(v / GRID_PX) * GRID_PX; return Math.abs(v - s) < SNAP_D ? s : v; };
export const snapPt = (x, y) => ({ x: snapV(x), y: snapV(y) });
export const wallLen = (a, b) => Math.round(Math.sqrt(((a.x - b.x) / PX) ** 2 + ((a.y - b.y) / PX) ** 2));
export const polyPath = (pts) => pts.length < 2 ? "" : pts.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ") + " Z";

export function pointInPoly(px, py, pts) {
  let ins = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}

export function polyBounds(pts) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const p of pts) { a = Math.min(a, p.x); b = Math.min(b, p.y); c = Math.max(c, p.x); d = Math.max(d, p.y); }
  return { minX: a, minY: b, maxX: c, maxY: d };
}

export function aabb(p) {
  if (p.shape === "circle") return { w: p.pw, h: p.pw };
  const r = (p.rot * Math.PI) / 180;
  return { w: Math.ceil(Math.abs(p.pw * Math.cos(r)) + Math.abs(p.ph * Math.sin(r))), h: Math.ceil(Math.abs(p.pw * Math.sin(r)) + Math.abs(p.ph * Math.cos(r))) };
}

export function axisSnap(raw, pts, th = AXIS_SNAP) {
  let x = raw.x, y = raw.y, g = [];
  for (const p of pts) {
    if (Math.abs(raw.x - p.x) < th) { x = p.x; g.push({ axis: "x", val: p.x }); }
    if (Math.abs(raw.y - p.y) < th) { y = p.y; g.push({ axis: "y", val: p.y }); }
  }
  return { x, y, guides: g };
}

export function closestPtOnSeg(ax, ay, bx, by, px, py) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  if (l2 === 0) return { x: ax, y: ay, t: 0 };
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return { x: ax + t * dx, y: ay + t * dy, t };
}

export function ptSegDist(ax, ay, bx, by, px, py) {
  const c = closestPtOnSeg(ax, ay, bx, by, px, py);
  return Math.sqrt((px - c.x) ** 2 + (py - c.y) ** 2);
}

export function segSeg(ax, ay, bx, by, cx, cy, dx, dy) {
  const s1x = bx - ax, s1y = by - ay, s2x = dx - cx, s2y = dy - cy;
  const d2 = -s2x * s1y + s1x * s2y;
  if (Math.abs(d2) < 0.001) return false;
  const s = (-s1y * (ax - cx) + s1x * (ay - cy)) / d2;
  const t = (s2x * (ay - cy) - s2y * (ax - cx)) / d2;
  return s >= 0 && s <= 1 && t >= 0 && t <= 1;
}

export function rectCorners(p) {
  const bb = aabb(p), cx = p.x + bb.w / 2, cy = p.y + bb.h / 2;
  const r = (p.rot * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
  const hw = p.pw / 2, hh = p.ph / 2;
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([lx, ly]) => ({ x: cx + lx * cos - ly * sin, y: cy + lx * sin + ly * cos }));
}

export function samplePts(pc) {
  const bb = aabb(pc), cx = pc.x + bb.w / 2, cy = pc.y + bb.h / 2;
  if (pc.shape === "circle") {
    const r = pc.pw / 2, pts = [{ x: cx, y: cy }];
    for (let i = 0; i < 12; i++) { const a = (i * Math.PI * 2) / 12; pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }); }
    return pts;
  }
  const c = rectCorners(pc), pts = [{ x: cx, y: cy }];
  for (let j = 0; j < 4; j++) { pts.push(c[j]); pts.push({ x: (c[j].x + c[(j + 1) % 4].x) / 2, y: (c[j].y + c[(j + 1) % 4].y) / 2 }); }
  return pts;
}

export function hitsWall(pc, walls) {
  const pts = samplePts(pc), corners = pc.shape !== "circle" ? rectCorners(pc) : null;
  for (let i = 0; i < walls.length; i++) {
    const a = walls[i], b = walls[(i + 1) % walls.length];
    for (const sp of pts) { if (ptSegDist(a.x, a.y, b.x, b.y, sp.x, sp.y) < WALL_BUF) return true; }
    if (corners) { for (let j = 0; j < 4; j++) { const c1 = corners[j], c2 = corners[(j + 1) % 4]; if (segSeg(a.x, a.y, b.x, b.y, c1.x, c1.y, c2.x, c2.y)) return true; } }
  }
  return false;
}

export function piecesOverlap(a, b) {
  const bbA = aabb(a), bbB = aabb(b);
  const cxA = a.x + bbA.w / 2, cyA = a.y + bbA.h / 2, cxB = b.x + bbB.w / 2, cyB = b.y + bbB.h / 2;
  if (a.shape === "circle" && b.shape === "circle") return dist({ x: cxA, y: cyA }, { x: cxB, y: cyB }) < (a.pw + b.pw) / 2;
  if (a.shape === "circle") {
    const corners = rectCorners(b);
    for (let i = 0; i < 4; i++) { if (ptSegDist(corners[i].x, corners[i].y, corners[(i + 1) % 4].x, corners[(i + 1) % 4].y, cxA, cyA) < a.pw / 2) return true; }
    return pointInPoly(cxA, cyA, corners);
  }
  if (b.shape === "circle") return piecesOverlap(b, a);
  const cA = rectCorners(a), cB = rectCorners(b);
  const axes = c => c.map((_, i) => { const p = c[i], q = c[(i + 1) % c.length]; const dx = q.x - p.x, dy = q.y - p.y, l = Math.sqrt(dx * dx + dy * dy) || 1; return { x: -dy / l, y: dx / l }; });
  const proj = (c, ax) => { let mn = Infinity, mx = -Infinity; for (const p of c) { const d = p.x * ax.x + p.y * ax.y; mn = Math.min(mn, d); mx = Math.max(mx, d); } return { mn, mx }; };
  for (const ax of [...axes(cA), ...axes(cB)]) { const pA = proj(cA, ax), pB = proj(cB, ax); if (pA.mx <= pB.mn || pB.mx <= pA.mn) return false; }
  return true;
}

export function hitsOtherPiece(cand, pieces, ignoreId) {
  for (const p of pieces) { if (p.id !== ignoreId && piecesOverlap(cand, p)) return true; }
  return false;
}
