// SketchDrawing.ts — drawStroke, drawBackground, drawArrowhead, drawSelectionBox and shape fill helpers
import type { Stroke, Point, BackgroundType, BBox } from './SketchTypes';
import { DEFAULT_BRUSH_SETTINGS, isShapeTool, hexToRgba, seededRandom, HANDLE_SIZE } from './SketchTypes';
import type { DrawToolType } from './SketchTypes';
import { WASHI_PATTERNS, washiPatternCache } from './SketchWashiTape';

// --- Brush tip image cache for custom brush tips ---
const _brushTipCache = new Map<string, HTMLImageElement>();
const _preloadBrushTip = (dataUrl: string) => {
  if (_brushTipCache.has(dataUrl)) return;
  const img = new Image();
  img.src = dataUrl;
  _brushTipCache.set(dataUrl, img);
};

// --- Drawing helpers ---

export const drawArrowhead = (ctx: CanvasRenderingContext2D, from: Point, to: Point, size: number) => {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(angle - Math.PI / 6), to.y - size * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(angle + Math.PI / 6), to.y - size * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
};

// --- Fill style helper for advanced fills (gradient/pattern) ---

export const createShapeFillStyle = (
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  x: number, y: number, w: number, h: number,
): string | CanvasGradient | CanvasPattern | null => {
  const fillType = stroke.fillType || 'solid';
  const color1 = stroke.fillColor || '#3b82f6';
  const color2 = stroke.fillColor2 || '#8b5cf6';
  const opacity = stroke.fillOpacity ?? 0.3;
  const angle = stroke.fillAngle ?? 0;

  switch (fillType) {
    case 'solid':
      return hexToRgba(color1, opacity);
    case 'linear-gradient': {
      const rad = (angle * Math.PI) / 180;
      const cx = x + w / 2, cy = y + h / 2;
      const len = Math.max(w, h) / 2;
      const grad = ctx.createLinearGradient(
        cx - Math.cos(rad) * len, cy - Math.sin(rad) * len,
        cx + Math.cos(rad) * len, cy + Math.sin(rad) * len,
      );
      grad.addColorStop(0, hexToRgba(color1, opacity));
      grad.addColorStop(1, hexToRgba(color2, opacity));
      return grad;
    }
    case 'radial-gradient': {
      const cx = x + w / 2, cy = y + h / 2;
      const r = Math.max(w, h) / 2;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, hexToRgba(color1, opacity));
      grad.addColorStop(1, hexToRgba(color2, opacity));
      return grad;
    }
    case 'stripes': {
      const patCanvas = document.createElement('canvas');
      const s = 12;
      patCanvas.width = s; patCanvas.height = s;
      const pCtx = patCanvas.getContext('2d')!;
      pCtx.fillStyle = hexToRgba(color1, opacity * 0.3);
      pCtx.fillRect(0, 0, s, s);
      pCtx.strokeStyle = hexToRgba(color1, opacity);
      pCtx.lineWidth = 3;
      pCtx.beginPath(); pCtx.moveTo(0, s); pCtx.lineTo(s, 0); pCtx.stroke();
      return ctx.createPattern(patCanvas, 'repeat');
    }
    case 'dots': {
      const patCanvas = document.createElement('canvas');
      const s = 12;
      patCanvas.width = s; patCanvas.height = s;
      const pCtx = patCanvas.getContext('2d')!;
      pCtx.fillStyle = hexToRgba(color1, opacity * 0.2);
      pCtx.fillRect(0, 0, s, s);
      pCtx.fillStyle = hexToRgba(color1, opacity);
      pCtx.beginPath(); pCtx.arc(s / 2, s / 2, 2, 0, Math.PI * 2); pCtx.fill();
      return ctx.createPattern(patCanvas, 'repeat');
    }
    case 'crosshatch': {
      const patCanvas = document.createElement('canvas');
      const s = 10;
      patCanvas.width = s; patCanvas.height = s;
      const pCtx = patCanvas.getContext('2d')!;
      pCtx.fillStyle = hexToRgba(color1, opacity * 0.15);
      pCtx.fillRect(0, 0, s, s);
      pCtx.strokeStyle = hexToRgba(color1, opacity * 0.8);
      pCtx.lineWidth = 1;
      pCtx.beginPath(); pCtx.moveTo(0, s); pCtx.lineTo(s, 0); pCtx.stroke();
      pCtx.beginPath(); pCtx.moveTo(0, 0); pCtx.lineTo(s, s); pCtx.stroke();
      return ctx.createPattern(patCanvas, 'repeat');
    }
  }
  return null;
};

// --- Main drawStroke function ---

export const drawStroke = (ctx: CanvasRenderingContext2D, stroke: Stroke, asClipPath?: boolean) => {
  if (stroke.points.length < 1) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const usePressureOpacity = stroke.pressureOpacity && !asClipPath;

  if (usePressureOpacity && stroke.points.length > 0) {
    let avgPressure = 0;
    for (const p of stroke.points) avgPressure += p.pressure;
    avgPressure = Math.max(0.15, avgPressure / stroke.points.length);
    ctx.globalAlpha = avgPressure;
  }

  const start = stroke.points[0];
  const end = stroke.points[stroke.points.length - 1];

  if (stroke.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth = stroke.width;
    if (stroke.points.length < 2) { ctx.restore(); return; }
    ctx.beginPath(); ctx.moveTo(start.x, start.y);
    for (let i = 1; i < stroke.points.length; i++) ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    ctx.stroke(); ctx.restore(); return;
  }

  ctx.globalCompositeOperation = 'source-over';

  if (isShapeTool(stroke.tool)) {
    if (stroke.points.length < 2) { ctx.restore(); return; }
    ctx.strokeStyle = stroke.color; ctx.lineWidth = stroke.width;
    const hasFill = stroke.fillColor && stroke.fillOpacity && stroke.fillOpacity > 0;
    switch (stroke.tool) {
      case 'line': ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke(); break;
      case 'rect':
        if (hasFill) {
          ctx.fillStyle = hexToRgba(stroke.fillColor!, stroke.fillOpacity!);
          ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);
        }
        ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
        break;
      case 'circle': {
        const rx = Math.abs(end.x - start.x) / 2; const ry = Math.abs(end.y - start.y) / 2;
        const cx = start.x + (end.x - start.x) / 2; const cy = start.y + (end.y - start.y) / 2;
        ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
        if (hasFill) { ctx.fillStyle = hexToRgba(stroke.fillColor!, stroke.fillOpacity!); ctx.fill(); }
        ctx.stroke(); break;
      }
      case 'arrow':
        ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
        drawArrowhead(ctx, start, end, Math.max(10, stroke.width * 3)); break;
      case 'triangle': {
        const mx = (start.x + end.x) / 2;
        ctx.beginPath(); ctx.moveTo(mx, start.y); ctx.lineTo(end.x, end.y); ctx.lineTo(start.x, end.y); ctx.closePath();
        if (hasFill) { ctx.fillStyle = hexToRgba(stroke.fillColor!, stroke.fillOpacity!); ctx.fill(); }
        ctx.stroke(); break;
      }
      case 'diamond': {
        const cx = (start.x + end.x) / 2, cy = (start.y + end.y) / 2;
        ctx.beginPath(); ctx.moveTo(cx, start.y); ctx.lineTo(end.x, cy); ctx.lineTo(cx, end.y); ctx.lineTo(start.x, cy); ctx.closePath();
        if (hasFill) { ctx.fillStyle = hexToRgba(stroke.fillColor!, stroke.fillOpacity!); ctx.fill(); }
        ctx.stroke(); break;
      }
      case 'star': {
        const cx = (start.x + end.x) / 2, cy = (start.y + end.y) / 2;
        const outerR = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y)) / 2;
        const innerR = outerR * 0.4;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? outerR : innerR;
          const angle = (i * Math.PI / 5) - Math.PI / 2;
          const px = cx + r * Math.cos(angle), py = cy + r * Math.sin(angle);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        if (hasFill) { ctx.fillStyle = hexToRgba(stroke.fillColor!, stroke.fillOpacity!); ctx.fill(); }
        ctx.stroke(); break;
      }
      case 'polygon': {
        const cx = (start.x + end.x) / 2, cy = (start.y + end.y) / 2;
        const r = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y)) / 2;
        const sides = 6;
        ctx.beginPath();
        for (let i = 0; i < sides; i++) {
          const angle = (i * 2 * Math.PI / sides) - Math.PI / 2;
          const px = cx + r * Math.cos(angle), py = cy + r * Math.sin(angle);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        if (hasFill) { ctx.fillStyle = hexToRgba(stroke.fillColor!, stroke.fillOpacity!); ctx.fill(); }
        ctx.stroke(); break;
      }
      case 'pentagon': {
        const cx = (start.x + end.x) / 2, cy = (start.y + end.y) / 2;
        const r = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y)) / 2;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const angle = (i * 2 * Math.PI / 5) - Math.PI / 2;
          const px = cx + r * Math.cos(angle), py = cy + r * Math.sin(angle);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        if (hasFill) { ctx.fillStyle = hexToRgba(stroke.fillColor!, stroke.fillOpacity!); ctx.fill(); }
        ctx.stroke(); break;
      }
      case 'heart': {
        const cx = (start.x + end.x) / 2, cy = (start.y + end.y) / 2;
        const w = Math.abs(end.x - start.x) / 2, h = Math.abs(end.y - start.y) / 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy + h * 0.9);
        ctx.bezierCurveTo(cx - w * 0.1, cy + h * 0.6, cx - w, cy + h * 0.2, cx - w, cy - h * 0.2);
        ctx.bezierCurveTo(cx - w, cy - h * 0.8, cx - w * 0.4, cy - h, cx, cy - h * 0.4);
        ctx.bezierCurveTo(cx + w * 0.4, cy - h, cx + w, cy - h * 0.8, cx + w, cy - h * 0.2);
        ctx.bezierCurveTo(cx + w, cy + h * 0.2, cx + w * 0.1, cy + h * 0.6, cx, cy + h * 0.9);
        ctx.closePath();
        if (hasFill) { ctx.fillStyle = hexToRgba(stroke.fillColor!, stroke.fillOpacity!); ctx.fill(); }
        ctx.stroke(); break;
      }
      case 'moon': {
        const cx = (start.x + end.x) / 2, cy = (start.y + end.y) / 2;
        const r = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y)) / 2;
        ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, r), 0, Math.PI * 2);
        if (hasFill) { ctx.fillStyle = hexToRgba(stroke.fillColor!, stroke.fillOpacity!); ctx.fill(); }
        ctx.stroke();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath(); ctx.arc(cx + r * 0.4, cy, r * 0.75, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.beginPath(); ctx.arc(cx + r * 0.4, cy, r * 0.75, 0, Math.PI * 2);
        ctx.strokeStyle = stroke.color; ctx.stroke();
        break;
      }
      case 'cloud': {
        const cx = (start.x + end.x) / 2, cy = (start.y + end.y) / 2;
        const w = Math.abs(end.x - start.x) / 2, h = Math.abs(end.y - start.y) / 2;
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.6, cy + h * 0.5);
        ctx.quadraticCurveTo(cx - w, cy + h * 0.5, cx - w, cy);
        ctx.quadraticCurveTo(cx - w, cy - h * 0.5, cx - w * 0.5, cy - h * 0.6);
        ctx.quadraticCurveTo(cx - w * 0.3, cy - h, cx, cy - h * 0.8);
        ctx.quadraticCurveTo(cx + w * 0.3, cy - h, cx + w * 0.5, cy - h * 0.6);
        ctx.quadraticCurveTo(cx + w, cy - h * 0.5, cx + w, cy);
        ctx.quadraticCurveTo(cx + w, cy + h * 0.5, cx + w * 0.6, cy + h * 0.5);
        ctx.closePath();
        if (hasFill) { ctx.fillStyle = hexToRgba(stroke.fillColor!, stroke.fillOpacity!); ctx.fill(); }
        ctx.stroke(); break;
      }
      case 'speechBubble': {
        const x = start.x, y = start.y, w = end.x - start.x, h = end.y - start.y;
        const bodyH = h * 0.75;
        const r = Math.min(10, Math.abs(w) * 0.15, Math.abs(bodyH) * 0.15);
        ctx.beginPath();
        ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + bodyH - r);
        ctx.arcTo(x + w, y + bodyH, x + w - r, y + bodyH, r);
        ctx.lineTo(x + w * 0.4, y + bodyH);
        ctx.lineTo(x + w * 0.25, y + h);
        ctx.lineTo(x + w * 0.3, y + bodyH);
        ctx.lineTo(x + r, y + bodyH);
        ctx.arcTo(x, y + bodyH, x, y + bodyH - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
        if (hasFill) { ctx.fillStyle = hexToRgba(stroke.fillColor!, stroke.fillOpacity!); ctx.fill(); }
        ctx.stroke(); break;
      }
      case 'cylinder': {
        const x = start.x, y = start.y, w = end.x - start.x, h = end.y - start.y;
        const ellipseH = Math.abs(h) * 0.12;
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + ellipseH, Math.abs(w / 2), ellipseH, 0, 0, Math.PI * 2);
        if (hasFill) { ctx.fillStyle = hexToRgba(stroke.fillColor!, stroke.fillOpacity!); ctx.fill(); }
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y + ellipseH); ctx.lineTo(x, y + h - ellipseH);
        ctx.ellipse(x + w / 2, y + h - ellipseH, Math.abs(w / 2), ellipseH, 0, Math.PI, 0, true);
        ctx.lineTo(x + w, y + ellipseH);
        if (hasFill) {
          ctx.fillStyle = hexToRgba(stroke.fillColor!, stroke.fillOpacity! * 0.7);
          ctx.fill();
        }
        ctx.stroke(); break;
      }
      case 'trapezoid': {
        const x = start.x, y = start.y, w = end.x - start.x, h = end.y - start.y;
        const inset = Math.abs(w) * 0.2;
        ctx.beginPath();
        ctx.moveTo(x + inset, y); ctx.lineTo(x + w - inset, y);
        ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h);
        ctx.closePath();
        if (hasFill) { ctx.fillStyle = hexToRgba(stroke.fillColor!, stroke.fillOpacity!); ctx.fill(); }
        ctx.stroke(); break;
      }
      case 'cone': {
        const cx = (start.x + end.x) / 2;
        const w = Math.abs(end.x - start.x) / 2;
        const h = Math.abs(end.y - start.y);
        const bottomY = Math.max(start.y, end.y);
        const topY = Math.min(start.y, end.y);
        ctx.beginPath();
        ctx.moveTo(cx, topY);
        ctx.lineTo(cx + w, bottomY);
        ctx.ellipse(cx, bottomY, w, Math.abs(h) * 0.1, 0, 0, Math.PI);
        ctx.closePath();
        if (hasFill) { ctx.fillStyle = hexToRgba(stroke.fillColor!, stroke.fillOpacity!); ctx.fill(); }
        ctx.stroke(); break;
      }
    }
    ctx.restore();
    return;
  }

  if (stroke.points.length < 2 && stroke.tool !== 'spray') { ctx.restore(); return; }

  const bs = stroke.brushSettings || DEFAULT_BRUSH_SETTINGS[stroke.tool as DrawToolType] || DEFAULT_BRUSH_SETTINGS.pen;
  const texI = bs.textureIntensity;
  const grS = bs.grainSize;
  const wet = bs.wetness;
  const brushSpacing = bs.spacing ?? 0;
  const customTip = bs.customBrushTip;

  // Custom brush tip rendering — stamp the tip image along the stroke path
  if (customTip) {
    const tipImg = _brushTipCache.get(customTip);
    if (tipImg && tipImg.complete && tipImg.naturalWidth > 0) {
      const stampSize = stroke.width * 2;
      const spacingDist = brushSpacing > 0
        ? stampSize * (0.5 + brushSpacing * 0.05)
        : Math.max(stampSize * 0.25, 2);
      let accumulated = 0;

      // Tint the brush tip with the stroke color
      const tintCanvas = document.createElement('canvas');
      tintCanvas.width = 64;
      tintCanvas.height = 64;
      const tCtx = tintCanvas.getContext('2d')!;
      tCtx.drawImage(tipImg, 0, 0, 64, 64);
      tCtx.globalCompositeOperation = 'source-in';
      tCtx.fillStyle = stroke.color;
      tCtx.fillRect(0, 0, 64, 64);

      for (let i = 0; i < stroke.points.length; i++) {
        if (i === 0) {
          ctx.drawImage(tintCanvas, stroke.points[0].x - stampSize / 2, stroke.points[0].y - stampSize / 2, stampSize, stampSize);
          continue;
        }
        const prev = stroke.points[i - 1];
        const curr = stroke.points[i];
        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        accumulated += dist;
        while (accumulated >= spacingDist) {
          const ratio = 1 - (accumulated - spacingDist) / dist;
          const px = prev.x + dx * ratio;
          const py = prev.y + dy * ratio;
          const pressure = curr.pressure ?? 0.5;
          const size = stampSize * Math.max(0.3, pressure);
          ctx.drawImage(tintCanvas, px - size / 2, py - size / 2, size, size);
          accumulated -= spacingDist;
        }
      }
      ctx.restore();
      return;
    } else {
      // Preload the image for next render
      _preloadBrushTip(customTip);
    }
  }

  // Spacing > 0: stamp dots along the path instead of drawing lines
  if (brushSpacing > 0 && stroke.points.length >= 2) {
    const dotSize = stroke.width;
    const spacingDist = dotSize * (0.5 + brushSpacing * 0.05);
    ctx.fillStyle = stroke.color;
    let accumulated = 0;

    // Draw first dot
    ctx.beginPath();
    ctx.arc(stroke.points[0].x, stroke.points[0].y, dotSize / 2, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 1; i < stroke.points.length; i++) {
      const prev = stroke.points[i - 1];
      const curr = stroke.points[i];
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      accumulated += dist;
      while (accumulated >= spacingDist) {
        const ratio = 1 - (accumulated - spacingDist) / dist;
        const px = prev.x + dx * ratio;
        const py = prev.y + dy * ratio;
        const pressure = curr.pressure ?? 0.5;
        const r = (dotSize / 2) * Math.max(0.3, pressure);
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
        accumulated -= spacingDist;
      }
    }
    ctx.restore();
    return;
  }


  switch (stroke.tool) {
    case 'pencil': {
      ctx.strokeStyle = stroke.color; ctx.globalAlpha = 0.85;
      ctx.lineWidth = stroke.width * 0.6;
      ctx.beginPath(); ctx.moveTo(start.x, start.y);
      for (let i = 1; i < stroke.points.length - 1; i++) {
        const curr = stroke.points[i]; const next = stroke.points[i + 1];
        const pressure = Math.max(0.2, curr.pressure);
        ctx.lineWidth = stroke.width * pressure * 0.6;
        const jitterScale = texI * 1.5;
        const jx = Math.sin(i * 7.3 + curr.x * 0.1) * jitterScale;
        const jy = Math.cos(i * 5.1 + curr.y * 0.1) * jitterScale;
        ctx.quadraticCurveTo(curr.x + jx, curr.y + jy, (curr.x + next.x) / 2, (curr.y + next.y) / 2);
      }
      if (stroke.points.length >= 2) ctx.lineTo(end.x, end.y);
      ctx.stroke();
      if (texI > 0.05) {
        ctx.globalAlpha = texI * 0.5;
        ctx.lineWidth = stroke.width * 0.25 * grS;
        ctx.beginPath(); ctx.moveTo(start.x + 0.3, start.y - 0.3);
        for (let i = 1; i < stroke.points.length - 1; i++) {
          const curr = stroke.points[i]; const next = stroke.points[i + 1];
          const g = grS * 0.3;
          ctx.quadraticCurveTo(curr.x - g, curr.y + g, (curr.x + next.x) / 2 + g * 0.7, (curr.y + next.y) / 2 - g * 0.7);
        }
        if (stroke.points.length >= 2) ctx.lineTo(end.x - 0.3, end.y + 0.3);
        ctx.stroke();
      }
      break;
    }
    case 'pen': {
      ctx.strokeStyle = stroke.color;
      if (stroke.points.length === 2) {
        ctx.lineWidth = stroke.width;
        ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
      } else {
        let segStart = 0;
        const pressureThreshold = 0.15;
        const drawSegment = (fromIdx: number, toIdx: number) => {
          if (toIdx - fromIdx < 1) return;
          let avgPressure = 0;
          for (let j = fromIdx; j <= toIdx; j++) avgPressure += stroke.points[j].pressure;
          avgPressure = Math.max(0.3, avgPressure / (toIdx - fromIdx + 1));
          ctx.lineWidth = stroke.width * avgPressure;
          ctx.beginPath();
          const p0 = stroke.points[fromIdx];
          ctx.moveTo(p0.x, p0.y);
          for (let j = fromIdx + 1; j < toIdx; j++) {
            const curr = stroke.points[j]; const next = stroke.points[j + 1];
            ctx.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) / 2, (curr.y + next.y) / 2);
          }
          ctx.lineTo(stroke.points[toIdx].x, stroke.points[toIdx].y);
          ctx.stroke();
        };
        for (let i = 1; i < stroke.points.length; i++) {
          const pDiff = Math.abs(stroke.points[i].pressure - stroke.points[segStart].pressure);
          if (pDiff > pressureThreshold || i === stroke.points.length - 1) {
            drawSegment(segStart, i);
            segStart = Math.max(0, i - 1);
          }
        }
      }
      break;
    }
    case 'marker': {
      const markerWidth = stroke.width * 3;
      ctx.lineCap = 'square'; ctx.lineJoin = 'miter';
      ctx.strokeStyle = hexToRgba(stroke.color, 0.45);
      ctx.lineWidth = markerWidth;
      ctx.beginPath(); ctx.moveTo(start.x, start.y);
      for (let i = 1; i < stroke.points.length - 1; i++) {
        const curr = stroke.points[i]; const next = stroke.points[i + 1];
        ctx.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) / 2, (curr.y + next.y) / 2);
      }
      ctx.lineTo(end.x, end.y); ctx.stroke();
      break;
    }
    case 'highlighter': {
      const hlWidth = stroke.width * 4.5;
      ctx.globalCompositeOperation = 'multiply';
      ctx.lineCap = 'butt'; ctx.lineJoin = 'bevel';
      ctx.strokeStyle = hexToRgba(stroke.color, 0.3);
      ctx.lineWidth = hlWidth;
      ctx.beginPath(); ctx.moveTo(start.x, start.y);
      for (let i = 1; i < stroke.points.length - 1; i++) {
        const curr = stroke.points[i]; const next = stroke.points[i + 1];
        ctx.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) / 2, (curr.y + next.y) / 2);
      }
      if (stroke.points.length >= 2) ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.strokeStyle = hexToRgba(stroke.color, 0.12);
      ctx.lineWidth = hlWidth * 1.05;
      ctx.beginPath(); ctx.moveTo(start.x, start.y);
      for (let i = 1; i < stroke.points.length - 1; i++) {
        const curr = stroke.points[i]; const next = stroke.points[i + 1];
        ctx.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) / 2, (curr.y + next.y) / 2);
      }
      if (stroke.points.length >= 2) ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.strokeStyle = hexToRgba(stroke.color, 0.1);
      ctx.lineWidth = hlWidth * 0.5;
      ctx.beginPath(); ctx.moveTo(start.x, start.y);
      for (let i = 1; i < stroke.points.length - 1; i++) {
        const curr = stroke.points[i]; const next = stroke.points[i + 1];
        ctx.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) / 2, (curr.y + next.y) / 2);
      }
      if (stroke.points.length >= 2) ctx.lineTo(end.x, end.y);
      ctx.stroke();
      break;
    }
    case 'textHighlight': {
      if (stroke.points.length < 2) { ctx.restore(); return; }
      const hlW = stroke.width * 4;
      const hlOpacity = stroke.fillOpacity ?? 0.35;
      ctx.globalCompositeOperation = 'multiply';
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // Pressure-sensitive highlighting: draw segments with varying width & opacity
      const sens = (stroke.pressureSensitivity ?? 50) / 100; // 0=no effect, 1=max effect
      const hasPressure = stroke.points.some(p => p.pressure !== undefined && p.pressure !== 0.5);
      if (hasPressure && sens > 0) {
        for (let i = 1; i < stroke.points.length; i++) {
          const prev = stroke.points[i - 1];
          const pt = stroke.points[i];
          const p = pt.pressure ?? 0.5;
          // Sensitivity scales how much pressure affects width and opacity
          const widthMin = 1 - sens * 0.6; // sens=0 → 1.0 (no change), sens=1 → 0.4
          const widthRange = sens * 0.8;     // sens=0 → 0, sens=1 → 0.8
          const alphaMin = 1 - sens * 0.4;
          const alphaRange = sens * 0.4;
          const pressureWidth = hlW * (widthMin + p * widthRange);
          const pressureAlpha = hlOpacity * (alphaMin + p * alphaRange);
          ctx.strokeStyle = hexToRgba(stroke.color, pressureAlpha);
          ctx.lineWidth = pressureWidth;
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          const mx = (prev.x + pt.x) / 2, my = (prev.y + pt.y) / 2;
          ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
          ctx.stroke();
        }
      } else {
        // Fallback: uniform stroke (no pressure data)
        ctx.strokeStyle = hexToRgba(stroke.color, hlOpacity);
        ctx.lineWidth = hlW;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        for (let i = 1; i < stroke.points.length; i++) {
          const prev = stroke.points[i - 1];
          const pt = stroke.points[i];
          const mx = (prev.x + pt.x) / 2, my = (prev.y + pt.y) / 2;
          ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
        }
        ctx.stroke();
      }
      break;
    }
    case 'calligraphy': {
      ctx.strokeStyle = stroke.color;
      const mainPath: {x: number, y: number}[] = [];
      const subPath: {x: number, y: number}[] = [];
      let avgWidth = stroke.width * (1.2 + wet * 0.8);
      let totalSpeed = 0;
      for (let i = 1; i < stroke.points.length; i++) {
        const prev = stroke.points[i - 1]; const curr = stroke.points[i];
        const dx = curr.x - prev.x; const dy = curr.y - prev.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const dt = (curr.timestamp && prev.timestamp) ? Math.max(1, curr.timestamp - prev.timestamp) : 16;
        const speedFactor = Math.max(0.2, Math.min(1, 1 - (dist / dt) * 0.15));
        totalSpeed += speedFactor;
        const angle = Math.atan2(dy, dx);
        const nibOffset = Math.abs(Math.sin(angle)) * stroke.width * (0.2 + texI * 0.3);
        mainPath.push({x: curr.x, y: curr.y - nibOffset});
        subPath.push({x: curr.x, y: curr.y + nibOffset});
      }
      avgWidth *= Math.max(0.3, stroke.points[0].pressure) * (totalSpeed / Math.max(1, stroke.points.length - 1));
      ctx.lineWidth = avgWidth;
      ctx.beginPath(); ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 0; i < mainPath.length - 1; i++) {
        const curr = mainPath[i]; const next = mainPath[i + 1];
        ctx.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) / 2, (curr.y + next.y) / 2);
      }
      if (mainPath.length > 0) ctx.lineTo(mainPath[mainPath.length - 1].x, mainPath[mainPath.length - 1].y);
      ctx.stroke();
      if (texI > 0.05) {
        ctx.lineWidth = avgWidth * (0.15 + texI * 0.3);
        ctx.beginPath(); ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 0; i < subPath.length - 1; i++) {
          const curr = subPath[i]; const next = subPath[i + 1];
          ctx.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) / 2, (curr.y + next.y) / 2);
        }
        if (subPath.length > 0) ctx.lineTo(subPath[subPath.length - 1].x, subPath[subPath.length - 1].y);
        ctx.stroke();
      }
      break;
    }
    case 'spray': {
      ctx.fillStyle = stroke.color;
      const radius = stroke.width * (1.5 + wet * 1.5);
      const density = Math.max(3, Math.floor(stroke.width * (1 + wet)));
      for (let i = 0; i < stroke.points.length; i++) {
        const p = stroke.points[i];
        const rng = seededRandom(Math.floor(p.x * 1000 + p.y * 7 + i * 13));
        for (let j = 0; j < density; j++) {
          const a = rng() * Math.PI * 2; const r = rng() * radius;
          ctx.globalAlpha = (0.2 + rng() * 0.4) * (0.5 + texI * 0.5);
          const dotR = Math.max(0.3, rng() * grS * 1.5);
          ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, dotR, 0, Math.PI * 2); ctx.fill();
        }
      }
      break;
    }
    case 'fountain': {
      ctx.strokeStyle = stroke.color;
      const segSize = 8;
      for (let seg = 0; seg < stroke.points.length - 1; seg += Math.max(1, segSize - 2)) {
        const segEnd = Math.min(seg + segSize, stroke.points.length - 1);
        if (segEnd <= seg) break;
        let avgPressure = 0, avgDownFactor = 0;
        for (let i = seg; i <= segEnd; i++) {
          avgPressure += stroke.points[i].pressure;
          if (i > 0) {
            const dy = stroke.points[i].y - stroke.points[i - 1].y;
            avgDownFactor += Math.max(0.3, Math.min(1.5, 0.5 + (dy > 0 ? dy * 0.05 : dy * 0.02)));
          } else avgDownFactor += 0.7;
        }
        const count = segEnd - seg + 1;
        avgPressure = Math.max(0.15, avgPressure / count);
        avgDownFactor = avgDownFactor / count;
        ctx.lineWidth = stroke.width * (1.4 + wet * 0.8) * avgPressure * avgDownFactor;
        ctx.beginPath();
        ctx.moveTo(stroke.points[seg].x, stroke.points[seg].y);
        for (let i = seg + 1; i < segEnd; i++) {
          const curr = stroke.points[i]; const next = stroke.points[i + 1];
          ctx.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) / 2, (curr.y + next.y) / 2);
        }
        ctx.lineTo(stroke.points[segEnd].x, stroke.points[segEnd].y);
        ctx.stroke();
      }
      const poolAlpha = 0.2 + wet * 0.3;
      ctx.globalAlpha = poolAlpha;
      ctx.beginPath(); ctx.arc(start.x, start.y, stroke.width * (0.3 + wet * 0.4), 0, Math.PI * 2); ctx.fillStyle = stroke.color; ctx.fill();
      ctx.beginPath(); ctx.arc(end.x, end.y, stroke.width * (0.2 + wet * 0.3), 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'crayon': {
      ctx.strokeStyle = stroke.color;
      const rng2 = seededRandom(Math.floor(start.x * 100 + start.y * 7));
      const crayonPasses = Math.max(2, Math.round(2 + texI * 3));
      for (let i = 1; i < stroke.points.length; i++) {
        const prev = stroke.points[i - 1]; const curr = stroke.points[i];
        const w = stroke.width * 1.8 * Math.max(0.4, curr.pressure);
        for (let t = 0; t < crayonPasses; t++) {
          const spread = grS * 0.6;
          const ox = (rng2() - 0.5) * w * spread;
          const oy = (rng2() - 0.5) * w * spread;
          ctx.globalAlpha = (0.15 + rng2() * 0.25) * (0.5 + texI * 0.5);
          ctx.lineWidth = w * (0.2 + rng2() * 0.3) * grS;
          ctx.beginPath(); ctx.moveTo(prev.x + ox, prev.y + oy); ctx.lineTo(curr.x + ox, curr.y + oy); ctx.stroke();
        }
      }
      break;
    }
    case 'watercolor': {
      const rng3 = seededRandom(Math.floor(start.x * 100 + start.y * 7));
      const wcPasses = Math.max(2, Math.round(2 + wet * 3));
      for (let pass = 0; pass < wcPasses; pass++) {
        ctx.strokeStyle = stroke.color;
        ctx.globalAlpha = (0.05 + pass * 0.03) * (0.6 + wet * 0.4);
        ctx.lineWidth = stroke.width * (3 + wet * 3 - pass * (0.5 + wet * 0.3));
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const jitterMul = grS * (3 - pass * 0.5);
        ctx.beginPath(); ctx.moveTo(start.x + (rng3() - 0.5) * jitterMul, start.y + (rng3() - 0.5) * jitterMul);
        for (let i = 1; i < stroke.points.length; i++) {
          const p = stroke.points[i];
          ctx.lineTo(p.x + (rng3() - 0.5) * 2 * jitterMul, p.y + (rng3() - 0.5) * 2 * jitterMul);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 0.1 + texI * 0.1;
      ctx.lineWidth = stroke.width * 0.8;
      ctx.beginPath(); ctx.moveTo(start.x, start.y);
      for (let i = 1; i < stroke.points.length; i++) ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      ctx.stroke();
      break;
    }
    case 'dotpen': {
      ctx.fillStyle = stroke.color;
      const spacing = Math.max(stroke.width * (1 + (1 - wet)), 3);
      let accumulated = 0;
      for (let i = 1; i < stroke.points.length; i++) {
        const prev = stroke.points[i - 1]; const curr = stroke.points[i];
        const dx = curr.x - prev.x; const dy = curr.y - prev.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        accumulated += dist;
        while (accumulated >= spacing) {
          const ratio = 1 - (accumulated - spacing) / dist;
          const px = prev.x + dx * ratio;
          const py = prev.y + dy * ratio;
          const r = stroke.width * 0.5 * grS * Math.max(0.3, curr.pressure);
          ctx.globalAlpha = 0.6 + texI * 0.3;
          ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
          accumulated -= spacing;
        }
      }
      break;
    }
    case 'neon': {
      const neonW = stroke.width * (0.8 + wet * 0.8);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.shadowColor = stroke.color;
      ctx.shadowBlur = neonW * (4 + wet * 4);
      ctx.strokeStyle = hexToRgba(stroke.color, 0.15);
      ctx.lineWidth = neonW * 4;
      ctx.beginPath(); ctx.moveTo(start.x, start.y);
      for (let i = 1; i < stroke.points.length - 1; i++) {
        const curr = stroke.points[i]; const next = stroke.points[i + 1];
        ctx.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) / 2, (curr.y + next.y) / 2);
      }
      ctx.lineTo(end.x, end.y); ctx.stroke();
      ctx.shadowBlur = neonW * 3;
      ctx.strokeStyle = hexToRgba(stroke.color, 0.4);
      ctx.lineWidth = neonW * 2;
      ctx.beginPath(); ctx.moveTo(start.x, start.y);
      for (let i = 1; i < stroke.points.length - 1; i++) {
        const curr = stroke.points[i]; const next = stroke.points[i + 1];
        ctx.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) / 2, (curr.y + next.y) / 2);
      }
      ctx.lineTo(end.x, end.y); ctx.stroke();
      ctx.shadowBlur = neonW * 1.5;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = neonW * 0.6;
      ctx.beginPath(); ctx.moveTo(start.x, start.y);
      for (let i = 1; i < stroke.points.length - 1; i++) {
        const curr = stroke.points[i]; const next = stroke.points[i + 1];
        ctx.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) / 2, (curr.y + next.y) / 2);
      }
      ctx.lineTo(end.x, end.y); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = hexToRgba(stroke.color, 0.9);
      ctx.lineWidth = neonW * 0.9;
      ctx.beginPath(); ctx.moveTo(start.x, start.y);
      for (let i = 1; i < stroke.points.length - 1; i++) {
        const curr = stroke.points[i]; const next = stroke.points[i + 1];
        ctx.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) / 2, (curr.y + next.y) / 2);
      }
      ctx.lineTo(end.x, end.y); ctx.stroke();
      break;
    }
    case 'washi': {
      if (stroke.points.length < 2) break;
      const washiWidth = stroke.width;
      const patternId = stroke.washiPatternId;
      const pattern = WASHI_PATTERNS.find(p => p.id === patternId) || WASHI_PATTERNS[0];

      // Calculate bounding box of the stroke path
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of stroke.points) {
        if (p.x - washiWidth < minX) minX = p.x - washiWidth;
        if (p.y - washiWidth < minY) minY = p.y - washiWidth;
        if (p.x + washiWidth > maxX) maxX = p.x + washiWidth;
        if (p.y + washiWidth > maxY) maxY = p.y + washiWidth;
      }

      // Use a small fixed-size tile that repeats — much faster than per-bbox canvases
      const tileSize = 128;
      const scaleFactor = 3;
      const cacheKey = `washi_tile_${pattern.id}`;
      let cachedCanvas = washiPatternCache.get(cacheKey) as HTMLCanvasElement | undefined;
      if (!cachedCanvas) {
        cachedCanvas = document.createElement('canvas');
        cachedCanvas.width = tileSize * scaleFactor;
        cachedCanvas.height = tileSize * scaleFactor;
        const offCtx = cachedCanvas.getContext('2d')!;
        offCtx.scale(scaleFactor, scaleFactor);
        pattern.draw(offCtx, tileSize, tileSize);
        washiPatternCache.set(cacheKey, cachedCanvas);
      }

      // Create a repeating canvas pattern from the cached tile
      const canvasPattern = ctx.createPattern(cachedCanvas, 'repeat');
      if (!canvasPattern) break;

      ctx.save();
      // Scale pattern down to logical size
      const patternMatrix = new DOMMatrix();
      patternMatrix.scaleSelf(1 / scaleFactor, 1 / scaleFactor);
      canvasPattern.setTransform(patternMatrix);

      // Draw subtle shadow/edge first (behind)
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = washiWidth + 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length - 1; i++) {
        const curr = stroke.points[i];
        const next = stroke.points[i + 1];
        ctx.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) / 2, (curr.y + next.y) / 2);
      }
      ctx.lineTo(stroke.points[stroke.points.length - 1].x, stroke.points[stroke.points.length - 1].y);
      ctx.stroke();

      // Draw the thick stroke with washi pattern fill on top
      ctx.strokeStyle = canvasPattern;
      ctx.lineWidth = washiWidth;
      ctx.globalAlpha = 1.0;

      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length - 1; i++) {
        const curr = stroke.points[i];
        const next = stroke.points[i + 1];
        ctx.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) / 2, (curr.y + next.y) / 2);
      }
      ctx.lineTo(stroke.points[stroke.points.length - 1].x, stroke.points[stroke.points.length - 1].y);
      ctx.stroke();

      ctx.restore();
      break;
    }
  }

  ctx.restore();
};

// --- Background drawing ---

export const drawBackground = (
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, x1: number, y1: number,
  bg: BackgroundType,
  gridColor?: string,
  gridOpacity?: number
) => {
  ctx.save();
  const w = x1 - x0;
  const h = y1 - y0;

  if (bg === 'dark') {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(x0, y0, w, h);
    ctx.restore();
    return;
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x0, y0, w, h);

  const gOpacity = gridOpacity ?? 0.45;
  const gColor = gridColor ?? '#8c8c8c';
  const lineColor = `${gColor}${Math.round(gOpacity * 255).toString(16).padStart(2, '0')}`;
  const dotColor = `${gColor}${Math.round(Math.min(1, gOpacity + 0.1) * 255).toString(16).padStart(2, '0')}`;

  const gridStart = (origin: number, step: number) => Math.floor(origin / step) * step;

  switch (bg) {
    case 'plain': break;
    case 'grid-sm': {
      const s = 16;
      ctx.strokeStyle = lineColor; ctx.lineWidth = 0.5;
      for (let x = gridStart(x0, s); x <= x1; x += s) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke(); }
      for (let y = gridStart(y0, s); y <= y1; y += s) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
      break;
    }
    case 'grid-lg': {
      const s = 40;
      ctx.strokeStyle = lineColor; ctx.lineWidth = 0.5;
      for (let x = gridStart(x0, s); x <= x1; x += s) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke(); }
      for (let y = gridStart(y0, s); y <= y1; y += s) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
      break;
    }
    case 'dotted': {
      const s = 20;
      ctx.fillStyle = dotColor;
      for (let x = gridStart(x0, s); x <= x1; x += s) { for (let y = gridStart(y0, s); y <= y1; y += s) { ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill(); } }
      break;
    }
    case 'ruled': {
      const lineHeight = 28;
      ctx.strokeStyle = `${gColor}${Math.round(Math.min(1, gOpacity + 0.15) * 255).toString(16).padStart(2, '0')}`;
      ctx.lineWidth = 0.7;
      const startY = gridStart(y0, lineHeight);
      for (let y = startY; y <= y1; y += lineHeight) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
      break;
    }
    case 'isometric': {
      ctx.strokeStyle = lineColor; ctx.lineWidth = 0.5;
      const size = 30; const rowH = size * Math.sin(Math.PI / 3);
      const startRow = Math.floor(y0 / rowH);
      const endRow = Math.ceil(y1 / rowH) + 1;
      for (let row = startRow; row <= endRow; row++) {
        const y = row * rowH; const offset = row % 2 === 0 ? 0 : size / 2;
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
        const startX = Math.floor((x0 - size) / size) * size + offset;
        for (let x = startX; x <= x1 + size; x += size) {
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + size / 2, y + rowH); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - size / 2, y + rowH); ctx.stroke();
        }
      }
      break;
    }
    case 'dotted-grid': {
      const s = 20;
      ctx.strokeStyle = `${gColor}${Math.round(gOpacity * 0.3 * 255).toString(16).padStart(2, '0')}`;
      ctx.lineWidth = 0.3;
      for (let x = gridStart(x0, s); x <= x1; x += s) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke(); }
      for (let y = gridStart(y0, s); y <= y1; y += s) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
      ctx.fillStyle = dotColor;
      for (let x = gridStart(x0, s); x <= x1; x += s) { for (let y = gridStart(y0, s); y <= y1; y += s) { ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill(); } }
      break;
    }
    case 'graph-sm': {
      const minor = 8;
      const major = 40;
      ctx.strokeStyle = `${gColor}${Math.round(gOpacity * 0.25 * 255).toString(16).padStart(2, '0')}`;
      ctx.lineWidth = 0.3;
      for (let x = gridStart(x0, minor); x <= x1; x += minor) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke(); }
      for (let y = gridStart(y0, minor); y <= y1; y += minor) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
      ctx.strokeStyle = `${gColor}${Math.round(gOpacity * 0.6 * 255).toString(16).padStart(2, '0')}`;
      ctx.lineWidth = 0.6;
      for (let x = gridStart(x0, major); x <= x1; x += major) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke(); }
      for (let y = gridStart(y0, major); y <= y1; y += major) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
      break;
    }
    case 'music-staff': {
      const lineGap = 10;
      const staffLines = 5;
      const staffHeight = lineGap * (staffLines - 1);
      const staffSpacing = 36;
      const totalStaff = staffHeight + staffSpacing;
      ctx.strokeStyle = `${gColor}${Math.round(Math.min(1, gOpacity + 0.1) * 255).toString(16).padStart(2, '0')}`;
      ctx.lineWidth = 0.8;
      const startStaff = Math.floor(y0 / totalStaff);
      const endStaff = Math.ceil(y1 / totalStaff) + 1;
      for (let s = startStaff; s <= endStaff; s++) {
        const baseY = s * totalStaff + staffSpacing / 2;
        for (let i = 0; i < staffLines; i++) {
          const ly = baseY + i * lineGap;
          if (ly >= y0 - 10 && ly <= y1 + 10) {
            ctx.beginPath(); ctx.moveTo(x0, ly); ctx.lineTo(x1, ly); ctx.stroke();
          }
        }
      }
      break;
    }
  }
  ctx.restore();
};

// --- Selection box drawing ---

export const drawSelectionBox = (ctx: CanvasRenderingContext2D, bbox: BBox, rotation: number, zoom: number) => {
  ctx.save();
  const cx = bbox.x + bbox.w / 2;
  const cy = bbox.y + bbox.h / 2;
  if (rotation !== 0) {
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.translate(-cx, -cy);
  }
  ctx.strokeStyle = 'hsl(210 100% 50% / 0.7)';
  ctx.lineWidth = 2 / zoom;
  ctx.setLineDash([8 / zoom, 4 / zoom]);
  ctx.strokeRect(bbox.x, bbox.y, bbox.w, bbox.h);
  ctx.setLineDash([]);

  const hs = HANDLE_SIZE / zoom;
  const corners: [number, number][] = [
    [bbox.x, bbox.y], [bbox.x + bbox.w, bbox.y],
    [bbox.x, bbox.y + bbox.h], [bbox.x + bbox.w, bbox.y + bbox.h],
  ];
  for (const [hx, hy] of corners) {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'hsl(210 100% 50%)';
    ctx.lineWidth = 2 / zoom;
    ctx.fillRect(hx - hs, hy - hs, hs * 2, hs * 2);
    ctx.strokeRect(hx - hs, hy - hs, hs * 2, hs * 2);
  }

  const rotX = bbox.x + bbox.w / 2;
  const rotY = bbox.y - 24 / zoom;
  ctx.strokeStyle = 'hsl(210 100% 50% / 0.5)';
  ctx.lineWidth = 1 / zoom;
  ctx.beginPath(); ctx.moveTo(bbox.x + bbox.w / 2, bbox.y); ctx.lineTo(rotX, rotY); ctx.stroke();
  ctx.beginPath(); ctx.arc(rotX, rotY, hs, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.strokeStyle = 'hsl(210 100% 50%)'; ctx.lineWidth = 2 / zoom; ctx.stroke();
  ctx.restore();
};
