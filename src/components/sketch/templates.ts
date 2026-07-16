// Sketch templates & stamps — quick starters so users who can't draw
// can showcase advanced sketch editor features with one tap.
import type { TextAnnotation, StickyNoteData, BackgroundType } from './SketchTypes';

export interface TemplateCtx {
  w: number;
  h: number;
  nextTextId: () => number;
  nextStickyId: () => number;
}

export interface TemplateResult {
  textAnnotations?: TextAnnotation[];
  stickyNotes?: StickyNoteData[];
  background?: BackgroundType;
}

export interface SketchTemplate {
  id: string;
  label: string;
  emoji: string;
  description: string;
  build: (ctx: TemplateCtx) => TemplateResult;
}

const mkText = (
  id: number,
  x: number,
  y: number,
  text: string,
  opts: Partial<TextAnnotation> = {},
): TextAnnotation => ({
  id, x, y, text,
  font: '"Inter", sans-serif',
  fontSize: 20,
  color: '#111827',
  bold: false,
  italic: false,
  ...opts,
});

const mkSticky = (
  id: number,
  x: number,
  y: number,
  text: string,
  color: string,
  w = 170,
  h = 130,
): StickyNoteData => ({
  id, x, y, width: w, height: h, text, color, fontSize: 14,
});

export const SHOWCASE_TEMPLATE: SketchTemplate = {
  id: 'showcase',
  label: 'Showcase Mode',
  emoji: '✨',
  description: 'Demo the editor with rich pre-filled content',
  build: ({ w, h, nextTextId, nextStickyId }) => {
    const cw = Math.max(w, 1000);
    const ch = Math.max(h, 720);
    const texts: TextAnnotation[] = [
      mkText(nextTextId(), 60, 50, 'Flowist Sketch Studio', { fontSize: 40, bold: true, color: '#4338CA' }),
      mkText(nextTextId(), 60, 100, 'Layers • Sticky notes • Text • Templates • Brushes', {
        fontSize: 16, italic: true, color: '#6B7280',
      }),
      mkText(nextTextId(), 60, 170, 'This Week', { fontSize: 22, bold: true }),
      mkText(nextTextId(), 60, 430, 'Ideas Board', { fontSize: 22, bold: true }),
    ];
    const stickies: StickyNoteData[] = [];
    const days = [
      { d: 'Mon', c: '#BFDBFE', note: 'Kickoff review' },
      { d: 'Tue', c: '#BBF7D0', note: 'Design system audit' },
      { d: 'Wed', c: '#FDE68A', note: 'User interviews x3' },
      { d: 'Thu', c: '#FBCFE8', note: 'Ship pricing page' },
      { d: 'Fri', c: '#FED7AA', note: 'Retro + planning' },
    ];
    const startX = 60;
    const startY = 200;
    const colW = Math.min(180, (cw - 120 - 4 * 14) / 5);
    days.forEach((day, i) => {
      const x = startX + i * (colW + 14);
      texts.push(mkText(nextTextId(), x + 8, startY - 6, day.d, { fontSize: 14, bold: true }));
      stickies.push(mkSticky(nextStickyId(), x, startY, day.note, day.c, colW, 180));
    });
    const ideas = [
      { t: '💡 Add AI summaries', c: '#FEF3C7' },
      { t: '🎯 Focus timer widget', c: '#BBF7D0' },
      { t: '🗂️ Nested notebooks', c: '#BFDBFE' },
      { t: '🖌️ Custom brush packs', c: '#FBCFE8' },
    ];
    const ideasY = 460;
    const ideaW = Math.min(220, (cw - 120 - 3 * 14) / 4);
    ideas.forEach((idea, i) => {
      stickies.push(mkSticky(nextStickyId(), startX + i * (ideaW + 14), ideasY, idea.t, idea.c, ideaW, 130));
    });
    texts.push(
      mkText(nextTextId(), 60, ch - 60, '➜ Try: tap a sticky to edit, swap tools, or add a new layer.', {
        fontSize: 13, italic: true, color: '#4B5563',
      }),
    );
    return { textAnnotations: texts, stickyNotes: stickies, background: 'dotted' };
  },
};

export const SKETCH_TEMPLATES: SketchTemplate[] = [
  {
    id: 'kanban',
    label: 'Kanban Board',
    emoji: '🗂️',
    description: 'To Do / Doing / Done columns',
    build: ({ w, nextTextId, nextStickyId }) => {
      const cx = Math.max(w, 900);
      const colW = 220;
      const gap = 40;
      const totalW = colW * 3 + gap * 2;
      const startX = Math.max(60, (cx - totalW) / 2);
      const headerY = 80;
      const cardY = 140;
      const columns = [
        { title: 'To Do', color: '#FECACA', cards: ['Design landing hero', 'Write onboarding copy', 'Plan launch'] },
        { title: 'Doing', color: '#FDE68A', cards: ['Build pricing page', 'Refine tour flow'] },
        { title: 'Done', color: '#BBF7D0', cards: ['Setup auth', 'Ship mockups'] },
      ];
      const texts: TextAnnotation[] = [];
      const stickies: StickyNoteData[] = [];
      columns.forEach((col, i) => {
        const x = startX + i * (colW + gap);
        texts.push(mkText(nextTextId(), x + 12, headerY, col.title, { fontSize: 22, bold: true }));
        col.cards.forEach((card, j) => {
          stickies.push(mkSticky(nextStickyId(), x, cardY + j * 145, card, col.color, colW, 130));
        });
      });
      return { textAnnotations: texts, stickyNotes: stickies, background: 'plain' };
    },
  },
  {
    id: 'mindmap',
    label: 'Mind Map',
    emoji: '🧠',
    description: 'Central idea with 4 branches',
    build: ({ w, h, nextTextId, nextStickyId }) => {
      const cx = Math.max(w, 900) / 2;
      const cy = Math.max(h, 700) / 2;
      const texts: TextAnnotation[] = [
        mkText(nextTextId(), cx - 100, cy - 20, 'Big Idea', { fontSize: 32, bold: true, color: '#4338CA' }),
      ];
      const branches = [
        { x: cx - 340, y: cy - 220, text: 'Why', color: '#BFDBFE' },
        { x: cx + 180, y: cy - 220, text: 'What', color: '#FBCFE8' },
        { x: cx - 340, y: cy + 120, text: 'How', color: '#BBF7D0' },
        { x: cx + 180, y: cy + 120, text: 'When', color: '#FED7AA' },
      ];
      const stickies = branches.map(b => mkSticky(nextStickyId(), b.x, b.y, b.text, b.color, 160, 120));
      return { textAnnotations: texts, stickyNotes: stickies, background: 'dotted' };
    },
  },
  {
    id: 'flowchart',
    label: 'Flowchart',
    emoji: '➡️',
    description: 'Start, decide, action, end',
    build: ({ w, nextTextId, nextStickyId }) => {
      const cx = Math.max(w, 900) / 2;
      const startY = 80;
      const step = 160;
      const items = [
        { text: 'Start', color: '#BBF7D0' },
        { text: 'Collect Input', color: '#BFDBFE' },
        { text: 'Decision?', color: '#FDE68A' },
        { text: 'Take Action', color: '#FBCFE8' },
        { text: 'End', color: '#FECACA' },
      ];
      const stickies = items.map((it, i) =>
        mkSticky(nextStickyId(), cx - 90, startY + i * step, it.text, it.color, 180, 110),
      );
      const texts: TextAnnotation[] = [
        mkText(nextTextId(), cx - 100, startY - 40, 'Flow', { fontSize: 22, bold: true }),
      ];
      return { textAnnotations: texts, stickyNotes: stickies, background: 'grid-sm' };
    },
  },
  {
    id: 'sketchnote',
    label: 'Sketchnote',
    emoji: '📝',
    description: 'Title, key points, takeaway',
    build: ({ w, nextTextId, nextStickyId }) => {
      const cw = Math.max(w, 900);
      const startX = 80;
      const texts: TextAnnotation[] = [
        mkText(nextTextId(), startX, 60, 'Meeting Notes', { fontSize: 36, bold: true }),
        mkText(nextTextId(), startX, 120, 'Key insights, decisions, and next steps', {
          fontSize: 16, italic: true, color: '#6B7280',
        }),
      ];
      const stickies = [
        mkSticky(nextStickyId(), startX, 170, '💡 Idea: Simplify onboarding to 2 steps', '#FEF3C7', cw - 160, 90),
        mkSticky(nextStickyId(), startX, 280, '✅ Decision: Ship weekly pricing', '#BBF7D0', cw - 160, 90),
        mkSticky(nextStickyId(), startX, 390, '⏭️ Next: Prep launch assets by Friday', '#BFDBFE', cw - 160, 90),
      ];
      return { textAnnotations: texts, stickyNotes: stickies, background: 'ruled' };
    },
  },
  {
    id: 'weekly',
    label: 'Weekly Planner',
    emoji: '📅',
    description: '7-day plan grid',
    build: ({ w, nextTextId, nextStickyId }) => {
      const cw = Math.max(w, 1000);
      const cols = 7;
      const gap = 14;
      const startX = 40;
      const startY = 90;
      const colW = Math.max(120, (cw - startX * 2 - gap * (cols - 1)) / cols);
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const colors = ['#BFDBFE', '#BBF7D0', '#FDE68A', '#FBCFE8', '#FED7AA', '#E9D5FF', '#FECACA'];
      const texts: TextAnnotation[] = [
        mkText(nextTextId(), startX, 40, 'This Week', { fontSize: 28, bold: true }),
      ];
      const stickies: StickyNoteData[] = [];
      days.forEach((d, i) => {
        const x = startX + i * (colW + gap);
        texts.push(mkText(nextTextId(), x + 8, startY, d, { fontSize: 16, bold: true }));
        stickies.push(mkSticky(nextStickyId(), x, startY + 20, '', colors[i], colW, 220));
      });
      return { textAnnotations: texts, stickyNotes: stickies, background: 'grid-sm' };
    },
  },
];

export interface SketchStamp {
  id: string;
  label: string;
  emoji: string;
  build: (ctx: TemplateCtx) => TemplateResult;
}

const stampColors = ['#FEF3C7', '#BBF7D0', '#BFDBFE', '#FBCFE8', '#FED7AA', '#E9D5FF'];

export const SKETCH_STAMPS: SketchStamp[] = [
  {
    id: 'sticky', label: 'Sticky Note', emoji: '📌',
    build: ({ w, h, nextStickyId }) => ({
      stickyNotes: [mkSticky(nextStickyId(), w / 2 - 85, h / 2 - 65, 'New note', stampColors[0])],
    }),
  },
  {
    id: 'heading', label: 'Heading', emoji: '🔤',
    build: ({ w, h, nextTextId }) => ({
      textAnnotations: [mkText(nextTextId(), w / 2 - 120, h / 2, 'Heading', { fontSize: 40, bold: true })],
    }),
  },
  {
    id: 'todo', label: 'To-do', emoji: '☑️',
    build: ({ w, h, nextTextId }) => ({
      textAnnotations: [
        mkText(nextTextId(), w / 2 - 100, h / 2, '☐ Task one'),
        mkText(nextTextId(), w / 2 - 100, h / 2 + 30, '☐ Task two'),
        mkText(nextTextId(), w / 2 - 100, h / 2 + 60, '☐ Task three'),
      ],
    }),
  },
  {
    id: 'callout', label: 'Callout', emoji: '💬',
    build: ({ w, h, nextStickyId }) => ({
      stickyNotes: [mkSticky(nextStickyId(), w / 2 - 100, h / 2 - 60, '💡 Important', '#FDE68A', 200, 120)],
    }),
  },
];
