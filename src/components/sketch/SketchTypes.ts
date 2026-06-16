// SketchTypes.ts — All interfaces, types, and constants for the Sketch Editor
import { Pen, Eraser, Undo2, Redo2, Trash2, Palette, Minus,
  Minus as LineIcon, Square, Circle, MoveRight, Ruler,
  Pencil, PenTool, Highlighter, SprayCan, Brush,
  Layers, Eye, EyeOff, Maximize, Pipette, Grid3X3, ZoomIn,
  MousePointer2, Copy, Clipboard, Trash, RotateCw, Focus,
  Download, Share2, FileText, FileImage, FileCode, Play, Pause, Save, FolderOpen, Plus, Film, FlipHorizontal, FlipVertical, ScissorsLineDashed, Monitor, Crosshair, Sticker, BookmarkPlus, Check, ArrowRight, ArrowUpRight, Bookmark, Ribbon,
  Type, Bold, Italic, Triangle, Star, Diamond, Hexagon, Navigation,
  Droplets, CircleDot, PaintbrushVertical, PenLine, StickyNote, ImagePlus, Sparkles,
  Heart, Cloud, MessageSquare, Pentagon, Moon, Cylinder,
} from 'lucide-react';
import type { VideoBookmark } from '@/components/SketchVideoPanel';

// --- Tool Types ---

export type DrawToolType = 'pencil' | 'pen' | 'marker' | 'highlighter' | 'calligraphy' | 'spray' | 'fountain' | 'crayon' | 'watercolor' | 'dotpen' | 'neon' | 'textHighlight';
export type ShapeToolType = 'line' | 'rect' | 'circle' | 'arrow' | 'triangle' | 'star' | 'diamond' | 'polygon' | 'pentagon' | 'heart' | 'moon' | 'cloud' | 'speechBubble' | 'cylinder' | 'trapezoid' | 'cone';
export type ToolType = DrawToolType | ShapeToolType | 'eraser' | 'select' | 'text' | 'sticky' | 'image' | 'laser' | 'washi' | 'pdfTextSelect';
export type BackgroundType = 'plain' | 'grid-sm' | 'grid-lg' | 'dotted' | 'ruled' | 'isometric' | 'dark' | 'dotted-grid' | 'graph-sm' | 'music-staff';

// --- Data Interfaces ---

export interface Point {
  x: number;
  y: number;
  pressure: number;
  timestamp?: number;
}

export interface TextAnnotation {
  id: number;
  x: number;
  y: number;
  text: string;
  font: string;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
}

export interface StickyNoteData {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
  fontSize: number;
  rotation?: number;
}

export interface CanvasImageData {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;
  naturalWidth: number;
  naturalHeight: number;
}

export interface BrushSettings {
  textureIntensity: number;
  grainSize: number;
  wetness: number;
  spacing?: number; // 0-100, controls distance between brush stamps (0=continuous, 100=max spacing)
  customBrushTip?: string; // data URL of custom brush tip image (B&W)
}

export const DEFAULT_BRUSH_SETTINGS: Record<DrawToolType, BrushSettings> = {
  pencil:      { textureIntensity: 0.5, grainSize: 1, wetness: 0.3 },
  pen:         { textureIntensity: 0.1, grainSize: 1, wetness: 0.5 },
  fountain:    { textureIntensity: 0.2, grainSize: 1, wetness: 0.7 },
  marker:      { textureIntensity: 0.1, grainSize: 1, wetness: 0.5 },
  highlighter: { textureIntensity: 0.1, grainSize: 1, wetness: 0.5 },
  calligraphy: { textureIntensity: 0.3, grainSize: 1, wetness: 0.5 },
  crayon:      { textureIntensity: 0.8, grainSize: 1.5, wetness: 0.2 },
  watercolor:  { textureIntensity: 0.6, grainSize: 1.2, wetness: 0.8 },
  spray:       { textureIntensity: 0.5, grainSize: 1, wetness: 0.6 },
  dotpen:      { textureIntensity: 0.3, grainSize: 1, wetness: 0.5 },
  neon:        { textureIntensity: 0.2, grainSize: 1, wetness: 0.7 },
  textHighlight: { textureIntensity: 0.1, grainSize: 1, wetness: 0.5 },
};

export interface Stroke {
  points: Point[];
  color: string;
  width: number;
  tool: ToolType;
  fillColor?: string;
  fillOpacity?: number;
  fillType?: 'solid' | 'linear-gradient' | 'radial-gradient' | 'stripes' | 'dots' | 'crosshatch';
  fillColor2?: string;
  fillAngle?: number;
  pressureOpacity?: boolean;
  pressureSensitivity?: number; // 0-100, controls how much pressure affects width/opacity
  isClipMask?: boolean;
  audioTimestamp?: number;
  washiPatternId?: string;
  brushSettings?: BrushSettings;
  /** Firebase collab stroke ID — set on strokes received from remote collaborators */
  collabStrokeId?: string;
  /** Color of the collaborator who drew this stroke */
  collabUserColor?: string;
  /** Name of the collaborator who drew this stroke */
  collabUserName?: string;
}

export type LayerBlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'soft-light';

export const BLEND_MODE_OPTIONS: { id: LayerBlendMode; label: string; composite: GlobalCompositeOperation }[] = [
  { id: 'normal', label: 'Normal', composite: 'source-over' },
  { id: 'multiply', label: 'Multiply', composite: 'multiply' },
  { id: 'screen', label: 'Screen', composite: 'screen' },
  { id: 'overlay', label: 'Overlay', composite: 'overlay' },
  { id: 'soft-light', label: 'Soft Light', composite: 'soft-light' as GlobalCompositeOperation },
];

export interface WashiTapeData {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  patternId: string;
  opacity: number;
}

export interface Layer {
  id: number;
  name: string;
  strokes: Stroke[];
  textAnnotations: TextAnnotation[];
  stickyNotes: StickyNoteData[];
  images: CanvasImageData[];
  washiTapes: WashiTapeData[];
  opacity: number;
  visible: boolean;
  blendMode?: LayerBlendMode;
}

export interface SketchData {
  layers: Layer[];
  activeLayerId: number;
  background?: BackgroundType;
  width: number;
  height: number;
  version: 2;
  strokes?: Stroke[];
  audioRecording?: { dataUrl: string; duration: number };
  videoUrl?: string;
  videoBookmarks?: VideoBookmark[];
}

export interface BBox {
  x: number; y: number; w: number; h: number;
}

export type HandleType = 'tl' | 'tr' | 'bl' | 'br' | 'rotate' | 'body';

// --- Constants ---

export const MAX_UNDO = 50;
export const MIN_POINT_DISTANCE = 1;
export const SMOOTHING_FACTOR = 0.3;
export const PALM_REJECTION_RADIUS = 20;
export const MAX_LAYERS = 3;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 8;
export const DOUBLE_TAP_DELAY = 400;
export const MAX_RECENT_COLORS = 8;
export const HANDLE_SIZE = 8;
export const HIT_TOLERANCE = 12;

export const GRID_SIZES: Record<BackgroundType, number> = {
  'plain': 20, 'grid-sm': 16, 'grid-lg': 40, 'dotted': 20,
  'ruled': 28, 'isometric': 30, 'dark': 20,
  'dotted-grid': 20, 'graph-sm': 8, 'music-staff': 28,
};

export const snapToGrid = (val: number, gridSize: number): number =>
  Math.round(val / gridSize) * gridSize;

export const SHAPE_TOOLS: { id: ShapeToolType; icon: typeof Pen; label: string }[] = [
  { id: 'line', icon: LineIcon, label: 'Line' },
  { id: 'rect', icon: Square, label: 'Rectangle' },
  { id: 'circle', icon: Circle, label: 'Circle' },
  { id: 'arrow', icon: MoveRight, label: 'Arrow' },
  { id: 'triangle', icon: Triangle, label: 'Triangle' },
  { id: 'star', icon: Star, label: 'Star' },
  { id: 'diamond', icon: Diamond, label: 'Diamond' },
  { id: 'polygon', icon: Hexagon, label: 'Hexagon' },
  { id: 'pentagon', icon: Pentagon, label: 'Pentagon' },
  { id: 'heart', icon: Heart, label: 'Heart' },
  { id: 'moon', icon: Moon, label: 'Moon' },
  { id: 'cloud', icon: Cloud, label: 'Cloud' },
  { id: 'speechBubble', icon: MessageSquare, label: 'Speech Bubble' },
  { id: 'cylinder', icon: Cylinder, label: 'Cylinder' },
  { id: 'trapezoid', icon: Navigation, label: 'Trapezoid' },
  { id: 'cone', icon: Triangle, label: 'Cone' },
];

export const DRAW_TOOLS: { id: DrawToolType; icon: typeof Pen; label: string }[] = [
  { id: 'pencil', icon: Pencil, label: 'Pencil' },
  { id: 'pen', icon: Pen, label: 'Pen' },
  { id: 'fountain', icon: PenLine, label: 'Fountain' },
  { id: 'marker', icon: PenTool, label: 'Marker' },
  { id: 'highlighter', icon: Highlighter, label: 'Highlighter' },
  { id: 'calligraphy', icon: Brush, label: 'Calligraphy' },
  { id: 'crayon', icon: PaintbrushVertical, label: 'Crayon' },
  { id: 'watercolor', icon: Droplets, label: 'Watercolor' },
  { id: 'spray', icon: SprayCan, label: 'Spray' },
  { id: 'dotpen', icon: CircleDot, label: 'Dot Pen' },
  { id: 'neon', icon: Sparkles, label: 'Neon Glow' },
  { id: 'textHighlight', icon: Highlighter, label: 'Highlight' },
];

export const BACKGROUNDS: { id: BackgroundType; label: string }[] = [
  { id: 'plain', label: 'Plain' },
  { id: 'grid-sm', label: 'Small Grid' },
  { id: 'grid-lg', label: 'Large Grid' },
  { id: 'graph-sm', label: 'Graph Paper' },
  { id: 'dotted', label: 'Dotted' },
  { id: 'dotted-grid', label: 'Dotted Grid' },
  { id: 'ruled', label: 'Ruled' },
  { id: 'music-staff', label: 'Music Staff' },
  { id: 'isometric', label: 'Isometric' },
  { id: 'dark', label: 'Dark' },
];

export const isDrawingTool = (t: ToolType): t is DrawToolType | ShapeToolType | 'eraser' =>
  t !== 'select' && t !== 'text' && t !== 'sticky' && t !== 'image' && t !== 'laser' && t !== 'washi';

export const STICKY_COLORS = [
  '#FEF3C7', '#FBCFE8', '#BBF7D0', '#BFDBFE',
  '#E9D5FF', '#FED7AA', '#FECACA', '#D1FAE5',
];

export const isShapeTool = (t: ToolType): t is ShapeToolType =>
  ['line','rect','circle','arrow','triangle','star','diamond','polygon','pentagon','heart','moon','cloud','speechBubble','cylinder','trapezoid','cone'].includes(t);

// --- Sticker Library ---

export interface StickerElement {
  id: string;
  name: string;
  strokes: Stroke[];
  builtIn?: boolean;
}

export const mkPt = (x: number, y: number): Point => ({ x, y, pressure: 0.5 });

export const EMOJI_STICKERS: { category: string; emojis: string[] }[] = [
  { category: 'Faces', emojis: ['😀','😂','🥰','😎','🤔','😱','🥺','😤','🤩','😴','🤗','😇','🫡','🥳','😈'] },
  { category: 'Hands', emojis: ['👍','👎','👏','🙌','✌️','🤞','👋','💪','🤝','☝️','✋','🫶','🤟','👆','👇'] },
  { category: 'Hearts', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💕','💖','💗','💘','💝','❣️','💔'] },
  { category: 'Nature', emojis: ['🌸','🌺','🌻','🌹','🌷','🍀','🌿','🌴','🌈','⭐','🌙','☀️','❄️','🔥','💧'] },
  { category: 'Food', emojis: ['🍎','🍕','🍔','🍟','🌮','🍩','🍪','🎂','☕','🧋','🍿','🍰','🍫','🍇','🥑'] },
  { category: 'Objects', emojis: ['📌','📎','✏️','📝','📚','💡','🔔','🎵','🎯','🏆','🎁','🎈','🎉','🚀','💎'] },
  { category: 'Symbols', emojis: ['✅','❌','⚠️','❓','❗','💯','🔴','🟢','🔵','⬛','🟨','➡️','⬆️','⬇️','🔄'] },
  { category: 'Animals', emojis: ['🐱','🐶','🐰','🦊','🐻','🐼','🦁','🐸','🦋','🐝','🐢','🦄','🐬','🦅','🐙'] },
];

export const STICKER_STORAGE_KEY = 'sketch-sticker-library';

export const loadSavedStickers = (): StickerElement[] => {
  // Sync fallback - async load happens in component
  return [];
};

export const saveStickersToDisk = (stickers: StickerElement[]) => {
  import('@/utils/settingsStorage').then(({ setSetting }) => {
    setSetting(STICKER_STORAGE_KEY, stickers).catch(console.error);
  });
};

export type SymmetryMode = 'off' | '2' | '4' | '8';

// --- Helpers ---

export const seededRandom = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

export const hexToRgba = (hex: string, alpha: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

export const hslToHex = (h: number, s: number, l: number): string => {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * Math.max(0, Math.min(1, color)))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

export const hexToHsl = (hex: string): [number, number, number] => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return [h, s, l];
};

// --- Selection helpers ---

export const getStrokeBBox = (stroke: Stroke): BBox => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of stroke.points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const pad = stroke.width * 2;
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
};

export const getSelectionBBox = (strokes: Stroke[]): BBox | null => {
  if (strokes.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of strokes) {
    const b = getStrokeBBox(s);
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.w > maxX) maxX = b.x + b.w;
    if (b.y + b.h > maxY) maxY = b.y + b.h;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
};

export const distToSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.sqrt((px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2);
};

export const hitTestStroke = (stroke: Stroke, px: number, py: number, tolerance: number): boolean => {
  if (stroke.tool === 'eraser') return false;
  const bbox = getStrokeBBox(stroke);
  if (px < bbox.x - tolerance || px > bbox.x + bbox.w + tolerance ||
      py < bbox.y - tolerance || py > bbox.y + bbox.h + tolerance) return false;

  for (let i = 0; i < stroke.points.length - 1; i++) {
    const a = stroke.points[i], b = stroke.points[i + 1];
    if (distToSegment(px, py, a.x, a.y, b.x, b.y) < tolerance + stroke.width) return true;
  }
  if (stroke.points.length === 1) {
    const p = stroke.points[0];
    return Math.sqrt((px - p.x) ** 2 + (py - p.y) ** 2) < tolerance + stroke.width;
  }
  return false;
};

export const hitTestHandle = (px: number, py: number, bbox: BBox, zoom: number): HandleType | null => {
  const hs = HANDLE_SIZE / zoom;
  const corners: [HandleType, number, number][] = [
    ['tl', bbox.x, bbox.y], ['tr', bbox.x + bbox.w, bbox.y],
    ['bl', bbox.x, bbox.y + bbox.h], ['br', bbox.x + bbox.w, bbox.y + bbox.h],
  ];
  for (const [type, cx, cy] of corners) {
    if (Math.abs(px - cx) < hs * 1.5 && Math.abs(py - cy) < hs * 1.5) return type;
  }
  const rotX = bbox.x + bbox.w / 2;
  const rotY = bbox.y - 24 / zoom;
  if (Math.sqrt((px - rotX) ** 2 + (py - rotY) ** 2) < hs * 2) return 'rotate';
  if (px >= bbox.x && px <= bbox.x + bbox.w && py >= bbox.y && py <= bbox.y + bbox.h) return 'body';
  return null;
};

export const transformStrokes = (
  strokes: Stroke[],
  origBBox: BBox,
  newBBox: BBox,
  rotation: number,
): Stroke[] => {
  const cx = origBBox.x + origBBox.w / 2;
  const cy = origBBox.y + origBBox.h / 2;
  const ncx = newBBox.x + newBBox.w / 2;
  const ncy = newBBox.y + newBBox.h / 2;
  const sx = origBBox.w > 0 ? newBBox.w / origBBox.w : 1;
  const sy = origBBox.h > 0 ? newBBox.h / origBBox.h : 1;
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);

  return strokes.map(s => ({
    ...s,
    points: s.points.map(p => {
      let x = (p.x - cx) * sx;
      let y = (p.y - cy) * sy;
      const rx = x * cosR - y * sinR;
      const ry = x * sinR + y * cosR;
      return { ...p, x: rx + ncx, y: ry + ncy };
    }),
  }));
};

export const cloneStrokes = (strokes: Stroke[]): Stroke[] =>
  strokes.map(s => ({ ...s, points: s.points.map(p => ({ ...p })) }));
