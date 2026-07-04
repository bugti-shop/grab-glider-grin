/**
 * Hydrators for editor blocks that need async rendering:
 *   - `.rt-katex`   : re-render on load (in case innerHTML was cleared)
 *   - `.rt-mermaid` : render mermaid diagram
 *   - `.rt-chess`   : render chess board as SVG
 *   - `.rt-qr`      : QR images are stored as data-URLs, no hydration needed
 */

let mermaidInitPromise: Promise<any> | null = null;
async function getMermaid() {
  if (!mermaidInitPromise) {
    mermaidInitPromise = import('mermaid').then((m) => {
      m.default.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'strict',
      });
      return m.default;
    });
  }
  return mermaidInitPromise;
}

export const hydrateExtrasIn = async (root: HTMLElement | null) => {
  if (!root) return;

  // ── KaTeX: re-render if data-latex present but innerHTML empty/missing.
  const katexNodes = root.querySelectorAll<HTMLElement>('.rt-katex[data-latex]');
  if (katexNodes.length) {
    try {
      const katex = (await import('katex')).default;
      katexNodes.forEach((el) => {
        if ((el as any).__rtKatexHydrated) return;
        (el as any).__rtKatexHydrated = true;
        const latex = el.getAttribute('data-latex') || '';
        el.setAttribute('contenteditable', 'false');
        try {
          el.innerHTML = katex.renderToString(latex, {
            throwOnError: false,
            output: 'html',
            displayMode: false,
          });
        } catch {
          el.textContent = '$' + latex + '$';
        }
      });
    } catch { /* katex load failed */ }
  }

  // ── Mermaid diagrams
  const mermaidNodes = root.querySelectorAll<HTMLElement>('.rt-mermaid[data-mermaid]');
  if (mermaidNodes.length) {
    try {
      const mermaid = await getMermaid();
      for (const el of Array.from(mermaidNodes)) {
        if ((el as any).__rtMermaidHydrated) continue;
        (el as any).__rtMermaidHydrated = true;
        el.setAttribute('contenteditable', 'false');
        const code = el.getAttribute('data-mermaid') || '';
        const target = el.querySelector<HTMLElement>('.rt-mermaid-render') || el;
        const id = 'mmd-' + Math.random().toString(36).slice(2, 10);
        try {
          const { svg } = await mermaid.render(id, code);
          target.innerHTML = svg;
        } catch (err: any) {
          target.innerHTML = `<pre style="color:hsl(var(--destructive));white-space:pre-wrap;font-size:12px">Mermaid error:\n${escapeHtml(String(err?.message || err))}</pre>`;
        }
      }
    } catch { /* mermaid load failed */ }
  }

  // ── Chess boards
  const chessNodes = root.querySelectorAll<HTMLElement>('.rt-chess[data-fen]');
  if (chessNodes.length) {
    try {
      const { Chess } = await import('chess.js');
      chessNodes.forEach((el) => {
        if ((el as any).__rtChessHydrated) return;
        (el as any).__rtChessHydrated = true;
        el.setAttribute('contenteditable', 'false');
        const fen = el.getAttribute('data-fen') || '';
        const target = el.querySelector<HTMLElement>('.rt-chess-render') || el;
        try {
          const game = new Chess(fen);
          target.innerHTML = renderChessSvg(game.board());
        } catch (err: any) {
          target.innerHTML = `<pre style="color:hsl(var(--destructive));font-size:12px">Chess FEN error: ${escapeHtml(String(err?.message || err))}</pre>`;
        }
      });
    } catch { /* chess.js load failed */ }
  }
};

/* ────────────────────────────────────────────────────────────────
 * Simple inline chess board SVG renderer (no external images).
 * ──────────────────────────────────────────────────────────────── */

const PIECE_UNICODE: Record<string, string> = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
};

type BoardSquare = { type: string; color: 'w' | 'b' } | null;

function renderChessSvg(board: BoardSquare[][]): string {
  const size = 40;
  const total = size * 8;
  const light = '#f0d9b5';
  const dark = '#b58863';
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${total}" height="${total}" style="max-width:320px;width:100%;height:auto;display:block;margin:0 auto">`);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const x = c * size;
      const y = r * size;
      const fill = (r + c) % 2 === 0 ? light : dark;
      parts.push(`<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${fill}"/>`);
      const sq = board[r][c];
      if (sq) {
        const key = sq.color + sq.type.toUpperCase();
        const glyph = PIECE_UNICODE[key] || '';
        const textColor = sq.color === 'w' ? '#ffffff' : '#000000';
        const strokeColor = sq.color === 'w' ? '#000000' : '#ffffff';
        parts.push(
          `<text x="${x + size / 2}" y="${y + size * 0.72}" text-anchor="middle" font-size="${size * 0.82}" fill="${textColor}" stroke="${strokeColor}" stroke-width="0.6" font-family="serif">${glyph}</text>`
        );
      }
    }
  }
  parts.push('</svg>');
  return parts.join('');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ));
}
