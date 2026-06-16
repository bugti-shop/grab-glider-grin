// Shape Recognition — detects freehand circles, squares, and triangles
// and converts them to perfect geometric shapes

import type { Point } from '@/components/sketch/SketchTypes';

interface RecognizedShape {
  type: 'circle' | 'rect' | 'triangle';
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
  
  // Downsample to reduce noise
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
      // Suppress nearby corners (non-maximum suppression)
      if (corners.length === 0 || i - corners[corners.length - 1] > windowSize) {
        corners.push(i);
      }
    }
  }

  return corners;
};

/** Attempt circle recognition */
const tryCircle = (pts: Point[]): RecognizedShape | null => {
  if (pts.length < 12) return null;

  // Only treat as circle if 0-2 corners (not a rectangle/square)
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

  // Check aspect ratio — circles should be roughly 1:1
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

  if (cv < 0.18 && lengthRatio > 0.7 && lengthRatio < 1.7 && aspectRatio > 0.6) {
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
  
  // A rectangle/square must have exactly 3-5 corners (4 ideal, allow slight variance)
  if (corners.length < 3 || corners.length > 5) return null;

  // Use bounding box approach for rectangles
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

  // Check how well points follow the bounding box edges
  // For each point, compute min distance to any edge of the bbox
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

  // Also check path length vs perimeter
  const pLen = pathLength(pts);
  const perimeter = 2 * (w + h);
  const lengthRatio = pLen / perimeter;

  // Stricter fit for more accurate rectangle detection
  if (fitRatio < 0.05 && lengthRatio > 0.75 && lengthRatio < 1.5) {
    // Return bounding box points (start=top-left, end=bottom-right) for shape drawing
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
  
  // Triangle should have ~3 corners
  if (corners.length < 2 || corners.length > 5) return null;

  // Find the 3 most prominent corners (largest angles)
  // Map corners back to sampled points
  const step = Math.max(1, Math.floor(pts.length / 60));
  const sampled: Point[] = [];
  for (let i = 0; i < pts.length; i += step) sampled.push(pts[i]);

  // Get corner points in original coords
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

  // Also add start point as potential corner
  cornerAngles.push({ idx: 0, angle: 180, point: sampled[0] });

  if (cornerAngles.length < 3) return null;

  // Sort by angle (largest first) and take top 3
  cornerAngles.sort((a, b) => b.angle - a.angle);
  const top3 = cornerAngles.slice(0, 3);

  // Sort by position along path for correct winding
  top3.sort((a, b) => a.idx - b.idx);

  const [p1, p2, p3] = top3.map(c => c.point);

  // Verify triangle: check area is reasonable
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

  // Verify points follow triangle edges
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
  
  if (avgDist / diagonal < 0.08) {
    const pressure = pts[0].pressure;
    // Return bounding box points (start=top-left, end=bottom-right) for shape drawing
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
 */
export const recognizeShape = (pts: Point[]): RecognizedShape | null => {
  if (pts.length < 8) return null;

  // Must be roughly closed
  const pLen = pathLength(pts);
  if (pLen < 20) return null;
  const closedThreshold = pLen * 0.2; // 20% of path length
  if (!isClosed(pts, closedThreshold)) return null;

  // Try rectangle FIRST — only shapes with 3-5 clear corners qualify
  const rect = tryRectangle(pts);
  if (rect) return rect;

  // Try triangle
  const triangle = tryTriangle(pts);
  if (triangle) return triangle;

  // Fallback: anything with 0-2 corners tries circle
  const circle = tryCircle(pts);
  if (circle) return circle;

  return null;
};
