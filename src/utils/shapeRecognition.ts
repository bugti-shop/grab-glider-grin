// Shape Recognition — detects freehand circles, squares, triangles, lines
// and arrows and converts them to perfect geometric shapes.

import type { Point } from '@/components/sketch/SketchTypes';

export interface RecognizedShape {
  type: 'circle' | 'rect' | 'triangle' | 'line' | 'arrow';
  points: Point[];
}

/** Calculate the distance between two points */
const dist = (a: Point, b: Point) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

/** Calculate the total path length of a stroke */
const pathLength = (pts: Point[]) => {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
};

/** Get the centroid of points */
const centroid = (pts: Point[]) => {
  let sx = 0, sy = 0;
  for (const p of pts) { sx += p.x; sy += p.y; }
  return { x: sx / pts.length, y: sy / pts.length };
};

/** Check if the stroke is closed (start ≈ end) */
const isClosed = (pts: Point[], threshold: number): boolean => {
  if (pts.length < 8) return false;
  return dist(pts[0], pts[pts.length - 1]) < threshold;
};

/** Count dominant corners using angle changes */
const detectCorners = (pts: Point[], angleThreshold = 35): number[] => {
  if (pts.length < 5) return [];

  const step = Math.max(1, Math.floor(pts.length / 60));
  const sampled: Point[] = [];
  for (let i = 0; i < pts.length; i += step) sampled.push(pts[i]);
  if (sampled.length < 5) return [];

  const corners: number[] = [];
  const windowSize = Math.max(2, Math.floor(sampled.length / 12));

  for (let i = windowSize; i < sampled.length - windowSize; i++) {
    const prev = sampled[i - windowSize];
    const curr = sampled[i];
    const next = sampled[i + windowSize];

    const dx1 = curr.x - prev.x, dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x, dy2 = next.y - curr.y;

    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
    if (len1 < 1 || len2 < 1) continue;

    const dot = (dx1 * dx2 + dy1 * dy2) / (len1 * len2);
    const angle = Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);

    if (angle > angleThreshold) {
      if (corners.length === 0 || i - corners[corners.length - 1] > windowSize) {
        corners.push(i);
      }
    }
  }

  return corners;
};

/** Compute avg perpendicular distance from a set of points to the line a→b */
const avgLineDeviation = (pts: Point[], a: Point, b: Point): number => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return Infinity;
  let sum = 0;
  for (const p of pts) sum += Math.abs((dy * p.x - dx * p.y + b.x * a.y - b.y * a.x)) / len;
  return sum / pts.length;
};

/** Attempt line recognition — open stroke that is nearly straight */
const tryLine = (pts: Point[]): RecognizedShape | null => {
  if (pts.length < 4) return null;
  const start = pts[0];
  const end = pts[pts.length - 1];
  const chord = dist(start, end);
  if (chord < 15) return null;

  const pLen = pathLength(pts);
  const straightness = chord / pLen;              // 1 = perfectly straight
  if (straightness < 0.9) return null;

  const dev = avgLineDeviation(pts, start, end);
  if (dev / chord > 0.05) return null;

  const pressure = pts[0].pressure;
  return {
    type: 'line',
    points: [
      { x: start.x, y: start.y, pressure },
      { x: end.x, y: end.y, pressure },
    ],
  };
};

/**
 * Attempt arrow recognition — a mostly-straight shaft ending with a small
 * hooked "V" arrowhead. Looks at the last ~25% of the stroke for a sharp
 * doubling-back.
 */
const tryArrow = (pts: Point[]): RecognizedShape | null => {
  if (pts.length < 10) return null;

  const start = pts[0];
  const end = pts[pts.length - 1];
  const chord = dist(start, end);
  if (chord < 25) return null;

  const pLen = pathLength(pts);
  // Arrow tail extra length must be modest — accept up to ~40% overshoot
  if (pLen / chord > 1.6) return null;

  // Split into shaft (~first 70%) + head (~last 30%)
  const splitAt = Math.floor(pts.length * 0.7);
  const shaft = pts.slice(0, splitAt + 1);
  const head = pts.slice(splitAt);
  if (head.length < 3) return null;

  // Shaft must be roughly straight
  const shaftChord = dist(shaft[0], shaft[shaft.length - 1]);
  const shaftLen = pathLength(shaft);
  if (shaftChord < 15 || shaftChord / shaftLen < 0.9) return null;

  // Arrowhead detection: within `head`, find max-angle corner (the tip)
  let tipIdx = -1;
  let tipAngle = 0;
  for (let i = 1; i < head.length - 1; i++) {
    const a = head[i - 1], b = head[i], c = head[i + 1];
    const dx1 = b.x - a.x, dy1 = b.y - a.y;
    const dx2 = c.x - b.x, dy2 = c.y - b.y;
    const l1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const l2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
    if (l1 < 0.5 || l2 < 0.5) continue;
    const dot = (dx1 * dx2 + dy1 * dy2) / (l1 * l2);
    const ang = Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);
    if (ang > tipAngle) { tipAngle = ang; tipIdx = i; }
  }
  // Real arrowhead has a sharp turn (≥ ~70°)
  if (tipIdx < 0 || tipAngle < 70) return null;

  // Tip of the arrow — where the shaft ends
  const tip = head[tipIdx];

  const pressure = pts[0].pressure;
  return {
    type: 'arrow',
    points: [
      { x: start.x, y: start.y, pressure },
      { x: tip.x, y: tip.y, pressure },
    ],
  };
};

/** Attempt circle recognition */
const tryCircle = (pts: Point[]): RecognizedShape | null => {
  if (pts.length < 12) return null;

  const corners = detectCorners(pts, 40);
  if (corners.length >= 3 && corners.length <= 5) return null;

  const c = centroid(pts);

  let sumR = 0;
  const radii: number[] = [];
  for (const p of pts) {
    const r = Math.sqrt((p.x - c.x) ** 2 + (p.y - c.y) ** 2);
    radii.push(r);
    sumR += r;
  }
  const meanR = sumR / pts.length;
  if (meanR < 5) return null;

  let sumSqDev = 0;
  for (const r of radii) sumSqDev += (r - meanR) ** 2;
  const stdDev = Math.sqrt(sumSqDev / pts.length);
  const cv = stdDev / meanR;

  const pLen = pathLength(pts);
  const circumference = 2 * Math.PI * meanR;
  const lengthRatio = pLen / circumference;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const w = maxX - minX;
  const h = maxY - minY;
  const aspectRatio = Math.min(w, h) / Math.max(w, h);

  // Slightly tighter thresholds → cleaner circle recognition
  if (cv < 0.16 && lengthRatio > 0.75 && lengthRatio < 1.6 && aspectRatio > 0.65) {
    const pressure = pts[0].pressure;
    return {
      type: 'circle',
      points: [
        { x: c.x - meanR, y: c.y - meanR, pressure },
        { x: c.x + meanR, y: c.y + meanR, pressure },
      ],
    };
  }

  return null;
};

/** Attempt rectangle/square recognition */
const tryRectangle = (pts: Point[]): RecognizedShape | null => {
  if (pts.length < 10) return null;

  const corners = detectCorners(pts, 40);
  if (corners.length < 3 || corners.length > 5) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const w = maxX - minX;
  const h = maxY - minY;
  if (w < 10 || h < 10) return null;

  let totalDist = 0;
  for (const p of pts) {
    const dLeft = Math.abs(p.x - minX);
    const dRight = Math.abs(p.x - maxX);
    const dTop = Math.abs(p.y - minY);
    const dBottom = Math.abs(p.y - maxY);
    totalDist += Math.min(dLeft, dRight, dTop, dBottom);
  }
  const avgDist = totalDist / pts.length;
  const diagonal = Math.sqrt(w * w + h * h);
  const fitRatio = avgDist / diagonal;

  const pLen = pathLength(pts);
  const perimeter = 2 * (w + h);
  const lengthRatio = pLen / perimeter;

  // Slightly tighter fit
  if (fitRatio < 0.045 && lengthRatio > 0.8 && lengthRatio < 1.4) {
    const pressure = pts[0].pressure;
    return {
      type: 'rect',
      points: [
        { x: minX, y: minY, pressure },
        { x: maxX, y: maxY, pressure },
      ],
    };
  }

  return null;
};

/** Attempt triangle recognition */
const tryTriangle = (pts: Point[]): RecognizedShape | null => {
  if (pts.length < 8) return null;

  const corners = detectCorners(pts, 30);
  if (corners.length < 2 || corners.length > 5) return null;

  const step = Math.max(1, Math.floor(pts.length / 60));
  const sampled: Point[] = [];
  for (let i = 0; i < pts.length; i += step) sampled.push(pts[i]);

  const cornerAngles: { idx: number; angle: number; point: Point }[] = [];
  const windowSize = Math.max(2, Math.floor(sampled.length / 12));

  for (const ci of corners) {
    if (ci < windowSize || ci >= sampled.length - windowSize) continue;
    const prev = sampled[ci - windowSize];
    const curr = sampled[ci];
    const next = sampled[ci + windowSize];
    const dx1 = curr.x - prev.x, dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x, dy2 = next.y - curr.y;
    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
    if (len1 < 1 || len2 < 1) continue;
    const dot = (dx1 * dx2 + dy1 * dy2) / (len1 * len2);
    const angle = Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);
    cornerAngles.push({ idx: ci, angle, point: sampled[ci] });
  }

  cornerAngles.push({ idx: 0, angle: 180, point: sampled[0] });

  if (cornerAngles.length < 3) return null;

  cornerAngles.sort((a, b) => b.angle - a.angle);
  const top3 = cornerAngles.slice(0, 3);
  top3.sort((a, b) => a.idx - b.idx);

  const [p1, p2, p3] = top3.map(c => c.point);

  const area = Math.abs((p2.x - p1.x) * (p3.y - p1.y) - (p3.x - p1.x) * (p2.y - p1.y)) / 2;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const bboxArea = (maxX - minX) * (maxY - minY);
  if (bboxArea < 100 || area / bboxArea < 0.2) return null;

  const triVerts = [p1, p2, p3];
  let totalDist = 0;
  for (const p of pts) {
    let minD = Infinity;
    for (let i = 0; i < 3; i++) {
      const a = triVerts[i], b = triVerts[(i + 1) % 3];
      const dx = b.x - a.x, dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) { minD = Math.min(minD, dist(p, a)); continue; }
      let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const proj = { x: a.x + t * dx, y: a.y + t * dy, pressure: 0.5 };
      minD = Math.min(minD, dist(p, proj));
    }
    totalDist += minD;
  }
  const avgDist = totalDist / pts.length;
  const diagonal = Math.sqrt(bboxArea);

  if (avgDist / diagonal < 0.07) {
    const pressure = pts[0].pressure;
    return {
      type: 'triangle',
      points: [
        { x: minX, y: minY, pressure },
        { x: maxX, y: maxY, pressure },
      ],
    };
  }

  return null;
};

/**
 * Attempt to recognize a freehand stroke as a geometric shape.
 * Returns the recognized shape with perfect points, or null if no match.
 *
 * Order:
 *  1. Closed strokes → rectangle, triangle, circle
 *  2. Open strokes   → arrow (with head), line
 */
export const recognizeShape = (pts: Point[]): RecognizedShape | null => {
  if (pts.length < 4) return null;

  const pLen = pathLength(pts);
  if (pLen < 20) return null;

  const closedThreshold = pLen * 0.2;
  const closed = isClosed(pts, closedThreshold);

  if (closed) {
    const rect = tryRectangle(pts);
    if (rect) return rect;

    const triangle = tryTriangle(pts);
    if (triangle) return triangle;

    const circle = tryCircle(pts);
    if (circle) return circle;
  } else {
    // Open stroke: prefer arrow (has a hooked head) before line
    const arrow = tryArrow(pts);
    if (arrow) return arrow;

    const line = tryLine(pts);
    if (line) return line;
  }

  return null;
};

// ─────────────────────────────────────────────────────────────
// Connector snapping — snap arrow/line endpoints to nearby
// shape bounding boxes or text annotations for clean diagrams.
// ─────────────────────────────────────────────────────────────

export interface SnapTarget {
  /** Axis-aligned bounding box of the target element */
  bbox: { x: number; y: number; w: number; h: number };
}

/** Nearest point on an axis-aligned rect edge to point p */
const nearestPointOnRect = (
  p: Point,
  r: { x: number; y: number; w: number; h: number },
): Point => {
  const cx = Math.max(r.x, Math.min(p.x, r.x + r.w));
  const cy = Math.max(r.y, Math.min(p.y, r.y + r.h));
  // If point is inside, project to nearest edge; otherwise clamp already gives edge.
  if (cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h) {
    const dLeft = p.x - r.x;
    const dRight = r.x + r.w - p.x;
    const dTop = p.y - r.y;
    const dBottom = r.y + r.h - p.y;
    const min = Math.min(dLeft, dRight, dTop, dBottom);
    if (min === dLeft) return { x: r.x, y: p.y, pressure: p.pressure };
    if (min === dRight) return { x: r.x + r.w, y: p.y, pressure: p.pressure };
    if (min === dTop) return { x: p.x, y: r.y, pressure: p.pressure };
    return { x: p.x, y: r.y + r.h, pressure: p.pressure };
  }
  return { x: cx, y: cy, pressure: p.pressure };
};

/**
 * Snap the start and end of a 2-point connector (line/arrow) to the
 * nearest edge of any target within `threshold` world-units.
 */
export const snapConnectorEndpoints = (
  points: Point[],
  targets: SnapTarget[],
  threshold: number,
): Point[] => {
  if (points.length !== 2 || targets.length === 0) return points;
  const [start, end] = points;

  const snapOne = (p: Point): Point => {
    let best: Point = p;
    let bestD = threshold;
    for (const t of targets) {
      const cand = nearestPointOnRect(p, t.bbox);
      const d = Math.sqrt((cand.x - p.x) ** 2 + (cand.y - p.y) ** 2);
      if (d < bestD) { bestD = d; best = cand; }
    }
    return best;
  };

  return [snapOne(start), snapOne(end)];
};
