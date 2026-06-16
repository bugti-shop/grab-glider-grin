// SketchWashiTape.ts — Washi tape patterns, rendering, and helpers
import type { WashiTapeData } from './SketchTypes';

// --- Washi tape pattern interface ---

export interface WashiTapePattern {
  id: string;
  name: string;
  color: string;
  bgColor: string;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
}

// --- Washi tape patterns ---

export const WASHI_PATTERNS: WashiTapePattern[] = [
  // 1. Clouds on sky blue
  {
    id: 'clouds-blue', name: 'Cloudy Sky', color: '#7cc4e8', bgColor: '#a8daf5',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#a8daf5'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 1;
      const drawCloud = (cx: number, cy: number, s: number) => {
        ctx.beginPath();
        ctx.arc(cx, cy, s * 1.2, 0, Math.PI * 2); ctx.fill();
        ctx.arc(cx - s, cy + s * 0.3, s * 0.85, 0, Math.PI * 2); ctx.fill();
        ctx.arc(cx + s, cy + s * 0.3, s * 0.9, 0, Math.PI * 2); ctx.fill();
        ctx.arc(cx - s * 0.5, cy + s * 0.1, s, 0, Math.PI * 2); ctx.fill();
        ctx.arc(cx + s * 0.5, cy - s * 0.1, s * 0.95, 0, Math.PI * 2); ctx.fill();
      };
      for (let x = 8; x < w; x += 28) {
        for (let y = 6; y < h; y += 16) {
          const ox = Math.floor(y / 16) % 2 ? 14 : 0;
          drawCloud(x + ox, y, 3.5);
        }
      }
      ctx.globalAlpha = 1;
    },
  },
  // 2. Pink hearts
  {
    id: 'hearts-pink', name: 'Love Hearts', color: '#f472b6', bgColor: '#fce7f3',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#fce7f3'; ctx.fillRect(0, 0, w, h);
      const drawHeart = (cx: number, cy: number, s: number, color: string) => {
        ctx.fillStyle = color; ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy + s * 0.4);
        ctx.bezierCurveTo(cx - s, cy - s * 0.3, cx - s * 0.5, cy - s, cx, cy - s * 0.4);
        ctx.bezierCurveTo(cx + s * 0.5, cy - s, cx + s, cy - s * 0.3, cx, cy + s * 0.4);
        ctx.fill();
      };
      for (let x = 7; x < w; x += 14) {
        for (let y = 7; y < h; y += 13) {
          const ox = Math.floor(y / 13) % 2 ? 7 : 0;
          const colors = ['#ec4899', '#f43f5e', '#f472b6', '#db2777'];
          drawHeart(x + ox, y, 4, colors[(Math.floor(x / 14) + Math.floor(y / 13)) % colors.length]);
        }
      }
      ctx.globalAlpha = 1;
    },
  },
  // 3. Flowers on warm yellow
  {
    id: 'flowers-yellow', name: 'Flower Garden', color: '#f59e0b', bgColor: '#fef3c7',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#fef3c7'; ctx.fillRect(0, 0, w, h);
      for (let x = 10; x < w; x += 20) {
        for (let y = 8; y < h; y += 18) {
          const ox = Math.floor(y / 18) % 2 ? 10 : 0;
          const fx = x + ox, fy = y;
          const petalColors = ['#f97316', '#ef4444', '#fb923c', '#f87171'];
          for (let a = 0; a < 5; a++) {
            const ang = (a / 5) * Math.PI * 2 - Math.PI / 2;
            const px = fx + Math.cos(ang) * 3.8, py = fy + Math.sin(ang) * 3.8;
            ctx.fillStyle = petalColors[a % petalColors.length]; ctx.globalAlpha = 1;
            ctx.beginPath(); ctx.arc(px, py, 2.8, 0, Math.PI * 2); ctx.fill();
          }
          ctx.fillStyle = '#f59e0b'; ctx.globalAlpha = 1;
          ctx.beginPath(); ctx.arc(fx, fy, 2, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.fillStyle = '#22c55e'; ctx.globalAlpha = 0.9;
      for (let x = 20; x < w; x += 20) {
        for (let y = 14; y < h; y += 18) {
          ctx.save(); ctx.translate(x, y); ctx.rotate(0.5);
          ctx.beginPath(); ctx.ellipse(0, 0, 3, 1.5, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    },
  },
  // 4. Stars on green
  {
    id: 'stars-green', name: 'Starry Meadow', color: '#22c55e', bgColor: '#86efac',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#4ade80'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 1;
      const drawStar = (cx: number, cy: number, r: number) => {
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const outerAngle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
          const innerAngle = outerAngle + Math.PI / 5;
          ctx.lineTo(cx + Math.cos(outerAngle) * r, cy + Math.sin(outerAngle) * r);
          ctx.lineTo(cx + Math.cos(innerAngle) * r * 0.45, cy + Math.sin(innerAngle) * r * 0.45);
        }
        ctx.closePath(); ctx.fill();
      };
      for (let x = 8; x < w; x += 15) {
        for (let y = 7; y < h; y += 14) {
          const ox = Math.floor(y / 14) % 2 ? 7.5 : 0;
          drawStar(x + ox, y, 4.5);
        }
      }
      ctx.globalAlpha = 1;
    },
  },
  // 5. Sparkles on coral
  {
    id: 'sparkles-coral', name: 'Coral Sparkles', color: '#f87171', bgColor: '#fca5a5',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#f87171'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 1; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      const drawSparkle = (cx: number, cy: number, s: number) => {
        ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.lineTo(cx, cy + s); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - s, cy); ctx.lineTo(cx + s, cy); ctx.stroke();
        const ds = s * 0.6;
        ctx.beginPath(); ctx.moveTo(cx - ds, cy - ds); ctx.lineTo(cx + ds, cy + ds); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + ds, cy - ds); ctx.lineTo(cx - ds, cy + ds); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, 1.2, 0, Math.PI * 2); ctx.fill();
      };
      for (let x = 10; x < w; x += 18) {
        for (let y = 8; y < h; y += 16) {
          const ox = Math.floor(y / 16) % 2 ? 9 : 0;
          drawSparkle(x + ox, y, 4);
        }
      }
      ctx.globalAlpha = 1;
    },
  },
  // 6. Suns on light blue
  {
    id: 'suns-blue', name: 'Sunny Day', color: '#3b82f6', bgColor: '#93c5fd',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#93c5fd'; ctx.fillRect(0, 0, w, h);
      const drawSun = (cx: number, cy: number, r: number) => {
        ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
        ctx.globalAlpha = 1;
        for (let a = 0; a < 8; a++) {
          const angle = (a / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(angle) * (r + 1), cy + Math.sin(angle) * (r + 1));
          ctx.lineTo(cx + Math.cos(angle) * (r + 3.5), cy + Math.sin(angle) * (r + 3.5));
          ctx.stroke();
        }
        ctx.fillStyle = '#f59e0b'; ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      };
      for (let x = 12; x < w; x += 22) {
        for (let y = 9; y < h; y += 18) {
          const ox = Math.floor(y / 18) % 2 ? 11 : 0;
          drawSun(x + ox, y, 3);
        }
      }
      ctx.globalAlpha = 1;
    },
  },
  // 7. Small flowers on sage green
  {
    id: 'flowers-sage', name: 'Sage Blossoms', color: '#22c55e', bgColor: '#6bc990',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#6bc990'; ctx.fillRect(0, 0, w, h);
      for (let x = 10; x < w; x += 18) {
        for (let y = 8; y < h; y += 16) {
          const ox = Math.floor(y / 16) % 2 ? 9 : 0;
          const fx = x + ox, fy = y;
          ctx.fillStyle = '#fef3c7'; ctx.globalAlpha = 1;
          for (let a = 0; a < 5; a++) {
            const ang = (a / 5) * Math.PI * 2 - Math.PI / 2;
            const px = fx + Math.cos(ang) * 3, py = fy + Math.sin(ang) * 3;
            ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2); ctx.fill();
          }
          ctx.fillStyle = '#f59e0b'; ctx.globalAlpha = 1;
          ctx.beginPath(); ctx.arc(fx, fy, 1.5, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    },
  },
  // 8. Rainbows on warm yellow
  {
    id: 'rainbows-yellow', name: 'Rainbow Dreams', color: '#f59e0b', bgColor: '#fef3c7',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#fde68a'; ctx.fillRect(0, 0, w, h);
      const drawRainbow = (cx: number, cy: number, s: number) => {
        const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'];
        for (let i = 0; i < colors.length; i++) {
          ctx.strokeStyle = colors[i]; ctx.lineWidth = 1.5; ctx.globalAlpha = 1;
          const r = s - i * 1.2;
          if (r > 0) {
            ctx.beginPath(); ctx.arc(cx, cy + s * 0.5, r, Math.PI, 0); ctx.stroke();
          }
        }
        ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.95;
        ctx.beginPath(); ctx.arc(cx - s + 1, cy + s * 0.5, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + s - 1, cy + s * 0.5, 2, 0, Math.PI * 2); ctx.fill();
      };
      for (let x = 12; x < w; x += 24) {
        for (let y = 8; y < h; y += 18) {
          const ox = Math.floor(y / 18) % 2 ? 12 : 0;
          drawRainbow(x + ox, y, 8);
        }
      }
      ctx.globalAlpha = 1;
    },
  },
  // 9. Leaves on pink
  {
    id: 'leaves-pink', name: 'Pink Leaves', color: '#ec4899', bgColor: '#fce7f3',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#fce7f3'; ctx.fillRect(0, 0, w, h);
      const drawLeaf = (cx: number, cy: number, s: number, angle: number, color: string) => {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle);
        ctx.fillStyle = color; ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.bezierCurveTo(s * 0.7, -s * 0.5, s * 0.5, s * 0.5, 0, s);
        ctx.bezierCurveTo(-s * 0.5, s * 0.5, -s * 0.7, -s * 0.5, 0, -s);
        ctx.fill();
        ctx.strokeStyle = '#15803d'; ctx.lineWidth = 0.8; ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.moveTo(0, -s * 0.8); ctx.lineTo(0, s * 0.8); ctx.stroke();
        ctx.restore();
      };
      for (let x = 8; x < w; x += 14) {
        for (let y = 7; y < h; y += 13) {
          const ox = Math.floor(y / 13) % 2 ? 7 : 0;
          const angle = ((x + y) * 0.7) % (Math.PI * 2);
          const colors = ['#22c55e', '#16a34a', '#4ade80'];
          drawLeaf(x + ox, y, 5, angle, colors[(Math.floor(x / 14) + Math.floor(y / 13)) % colors.length]);
        }
      }
      ctx.globalAlpha = 1;
    },
  },
  // 10. Diagonal stripes (coral + orange)
  {
    id: 'stripes-coral', name: 'Coral Stripes', color: '#f97316', bgColor: '#fb923c',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#fb923c'; ctx.fillRect(0, 0, w, h);
      ctx.lineCap = 'butt'; ctx.lineWidth = 5;
      for (let x = -h * 2; x < w + h * 2; x += 10) {
        ctx.strokeStyle = '#c2410c'; ctx.globalAlpha = 0.7;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + h, h); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
  },
  // 11. White polka dots on blue
  {
    id: 'polka-blue-white', name: 'Blue Polka', color: '#3b82f6', bgColor: '#60a5fa',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#60a5fa'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 1;
      for (let x = 6; x < w; x += 12) {
        for (let y = 5; y < h; y += 11) {
          const ox = Math.floor(y / 11) % 2 ? 6 : 0;
          ctx.beginPath(); ctx.arc(x + ox, y, 2.5, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    },
  },
  // 12. Yellow vertical stripes
  {
    id: 'stripes-yellow', name: 'Butter Stripes', color: '#eab308', bgColor: '#fde68a',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#fef3c7'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#eab308'; ctx.globalAlpha = 0.8;
      for (let x = 0; x < w; x += 8) {
        ctx.fillRect(x, 0, 4, h);
      }
      ctx.globalAlpha = 1;
    },
  },
  // 13. Scallop edge on cream/yellow
  {
    id: 'scallop-cream', name: 'Cream Scallop', color: '#f59e0b', bgColor: '#fef3c7',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#fde68a'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f59e0b'; ctx.globalAlpha = 0.6;
      const scW = 10;
      for (let x = 0; x < w + scW; x += scW) {
        ctx.beginPath(); ctx.arc(x, 0, scW / 2, 0, Math.PI); ctx.fill();
        ctx.beginPath(); ctx.arc(x, h, scW / 2, Math.PI, 0); ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  },
  // 14. Pink grid/plaid
  {
    id: 'grid-pink', name: 'Pink Plaid', color: '#ec4899', bgColor: '#fce7f3',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#fce7f3'; ctx.fillRect(0, 0, w, h);
      const spacing = 6;
      ctx.strokeStyle = '#ec4899'; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.7;
      for (let y = 0; y < h; y += spacing) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      for (let x = 0; x < w; x += spacing) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      ctx.globalAlpha = 1;
    },
  },
  // 15. Green + pink vertical stripes
  {
    id: 'stripes-green-pink', name: 'Garden Stripes', color: '#22c55e', bgColor: '#d1fae5',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
      const colors = ['#22c55e', '#ec4899', '#22c55e'];
      const stripeW = 6;
      for (let x = 0; x < w; x += stripeW) {
        ctx.fillStyle = colors[(Math.floor(x / stripeW)) % colors.length]; ctx.globalAlpha = 0.8;
        ctx.fillRect(x, 0, stripeW, h);
      }
      ctx.globalAlpha = 1;
    },
  },
  // 16. Lavender solid with subtle texture
  {
    id: 'solid-lavender', name: 'Soft Lavender', color: '#a78bfa', bgColor: '#c4b5fd',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#a78bfa'; ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 0.15;
      for (let i = 0; i < w * h * 0.01; i++) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * h, 0.8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  },
  // 17. Peach solid
  {
    id: 'solid-peach', name: 'Soft Peach', color: '#f97316', bgColor: '#fdba74',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#fb923c'; ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    },
  },
  // 18. Mint solid
  {
    id: 'solid-mint', name: 'Fresh Mint', color: '#10b981', bgColor: '#6ee7b7',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#34d399'; ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    },
  },
  // 19. Cherry blossom petals
  {
    id: 'sakura', name: 'Cherry Blossom', color: '#f43f5e', bgColor: '#fecdd3',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#fecdd3'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < Math.min(w * h * 0.005, 50); i++) {
        const px = Math.random() * w, py = Math.random() * h;
        const angle = Math.random() * Math.PI * 2;
        const size = 2 + Math.random() * 2.5;
        ctx.save(); ctx.translate(px, py); ctx.rotate(angle);
        ctx.fillStyle = ['#f43f5e', '#e11d48', '#ec4899'][Math.floor(Math.random() * 3)];
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.bezierCurveTo(size * 0.8, -size * 0.6, size * 0.8, size * 0.6, 0, size * 0.5);
        ctx.bezierCurveTo(-size * 0.8, size * 0.6, -size * 0.8, -size * 0.6, 0, -size);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },
  },
  // 20. Diagonal stripes blue + white
  {
    id: 'stripes-blue-diag', name: 'Ocean Stripes', color: '#3b82f6', bgColor: '#93c5fd',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
      ctx.lineCap = 'butt'; ctx.lineWidth = 5;
      for (let x = -h * 2; x < w + h * 2; x += 10) {
        ctx.strokeStyle = '#3b82f6'; ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + h, h); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
  },
  // 21. Red diagonal lines
  {
    id: 'lines-red', name: 'Red Lines', color: '#ef4444', bgColor: '#fecaca',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#fecaca'; ctx.fillRect(0, 0, w, h);
      ctx.lineCap = 'butt'; ctx.lineWidth = 2;
      for (let x = -h * 2; x < w + h * 2; x += 7) {
        ctx.strokeStyle = '#dc2626'; ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + h, h); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
  },
  // 22. Red horizontal stripes
  {
    id: 'stripes-red', name: 'Red Stripes', color: '#ef4444', bgColor: '#fee2e2',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ef4444'; ctx.globalAlpha = 0.85;
      for (let y = 0; y < h; y += 6) {
        ctx.fillRect(0, y, w, 3);
      }
      ctx.globalAlpha = 1;
    },
  },
  // 23. Red with hearts emoji pattern
  {
    id: 'red-hearts-emoji', name: 'Red Hearts', color: '#ef4444', bgColor: '#fee2e2',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#fee2e2'; ctx.fillRect(0, 0, w, h);
      ctx.font = '8px serif'; ctx.globalAlpha = 1;
      for (let x = 4; x < w; x += 14) {
        for (let y = 9; y < h; y += 13) {
          const ox = Math.floor(y / 13) % 2 ? 7 : 0;
          const emojis = ['❤️', '💕', '♥️', '💗'];
          ctx.fillText(emojis[(Math.floor(x / 14) + Math.floor(y / 13)) % emojis.length], x + ox, y);
        }
      }
      ctx.globalAlpha = 1;
    },
  },
  // 24. Red with star emojis
  {
    id: 'red-stars-emoji', name: 'Red Stars', color: '#dc2626', bgColor: '#fca5a5',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#fca5a5'; ctx.fillRect(0, 0, w, h);
      ctx.font = '7px serif'; ctx.globalAlpha = 1;
      for (let x = 4; x < w; x += 12) {
        for (let y = 8; y < h; y += 11) {
          const ox = Math.floor(y / 11) % 2 ? 6 : 0;
          const emojis = ['⭐', '✨', '🌟', '💫'];
          ctx.fillText(emojis[(Math.floor(x / 12) + Math.floor(y / 11)) % emojis.length], x + ox, y);
        }
      }
      ctx.globalAlpha = 1;
    },
  },
  // 25. Red with fire emojis
  {
    id: 'red-fire-emoji', name: 'Red Fire', color: '#dc2626', bgColor: '#fee2e2',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#fca5a5'; ctx.fillRect(0, 0, w, h);
      ctx.font = '8px serif'; ctx.globalAlpha = 1;
      for (let x = 4; x < w; x += 14) {
        for (let y = 9; y < h; y += 13) {
          const ox = Math.floor(y / 13) % 2 ? 7 : 0;
          const emojis = ['🔥', '❤️‍🔥', '💥', '🌹'];
          ctx.fillText(emojis[(Math.floor(x / 14) + Math.floor(y / 13)) % emojis.length], x + ox, y);
        }
      }
      ctx.globalAlpha = 1;
    },
  },
  // 26. Red double border
  {
    id: 'border-red', name: 'Red Border', color: '#ef4444', bgColor: '#fee2e2',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#fee2e2'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 2.5; ctx.globalAlpha = 1;
      ctx.strokeRect(2, 2, w - 4, h - 4);
      ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.7;
      ctx.strokeRect(5, 5, w - 10, h - 10);
      ctx.globalAlpha = 1;
    },
  },
  // 27. Red with dashed border
  {
    id: 'border-red-dashed', name: 'Red Dashed', color: '#ef4444', bgColor: '#fecaca',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#fecaca'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 2.5; ctx.globalAlpha = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(3, 3, w - 6, h - 6);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    },
  },
  // 28. Red with dotted border and center line
  {
    id: 'border-red-dotted', name: 'Red Dotted', color: '#ef4444', bgColor: '#fee2e2',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#fee2e2'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 1.8; ctx.globalAlpha = 0.9;
      ctx.setLineDash([2, 2]);
      ctx.strokeRect(2, 2, w - 4, h - 4);
      ctx.setLineDash([]);
      ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.moveTo(4, h / 2); ctx.lineTo(w - 4, h / 2); ctx.stroke();
      ctx.globalAlpha = 1;
    },
  },
  // 29. Red cross-hatch pattern
  {
    id: 'crosshatch-red', name: 'Red Crosshatch', color: '#ef4444', bgColor: '#fecaca',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#fecaca'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.75;
      for (let x = -h; x < w + h; x += 6) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + h, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + h, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
  },
  // 30. Deep red solid with gold accent border
  {
    id: 'red-gold', name: 'Red & Gold', color: '#b91c1c', bgColor: '#ef4444',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#dc2626'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2.5; ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(w, 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, h - 2); ctx.lineTo(w, h - 2); ctx.stroke();
      ctx.fillStyle = '#f59e0b'; ctx.globalAlpha = 0.8;
      for (let x = 6; x < w; x += 10) {
        ctx.beginPath(); ctx.arc(x, h / 2, 1.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  },
];

// --- Washi tape rendering ---

export const washiPatternCache = new Map<string, CanvasPattern | HTMLCanvasElement>();

export const drawTornEdge = (ctx: CanvasRenderingContext2D, x: number, y: number, height: number, direction: 1 | -1) => {
  ctx.beginPath();
  ctx.moveTo(x, y);
  const steps = Math.ceil(height / 4);
  for (let i = 0; i <= steps; i++) {
    const py = y + (i / steps) * height;
    const px = x + direction * (Math.random() * 4 + 1);
    ctx.lineTo(px, py);
  }
  ctx.lineTo(x, y + height);
};

export const drawWashiTape = (ctx: CanvasRenderingContext2D, tape: WashiTapeData, zoom: number, isSelected: boolean) => {
  const pattern = WASHI_PATTERNS.find(p => p.id === tape.patternId) || WASHI_PATTERNS[0];
  ctx.save();
  const cx = tape.x + tape.width / 2;
  const cy = tape.y + tape.height / 2;
  ctx.translate(cx, cy);
  ctx.rotate(tape.rotation);
  ctx.translate(-tape.width / 2, -tape.height / 2);

  // Shadow layer
  ctx.globalAlpha = 0.1;
  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = '#000';
  ctx.fillRect(-1, -1, tape.width + 2, tape.height + 2);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;

  // Cached pattern tile — small fixed tile that repeats, 3x resolution for crisp rendering
  const scaleFactor = 3;
  const tileSize = 128;
  const cacheKey = `washi_tape_tile_${pattern.id}`;
  let cachedTile = washiPatternCache.get(cacheKey) as HTMLCanvasElement | undefined;

  // Validate cached tile is still usable (dimensions > 0)
  if (cachedTile && (cachedTile.width === 0 || cachedTile.height === 0)) {
    washiPatternCache.delete(cacheKey);
    cachedTile = undefined;
  }

  if (!cachedTile) {
    try {
      cachedTile = document.createElement('canvas');
      cachedTile.width = tileSize * scaleFactor;
      cachedTile.height = tileSize * scaleFactor;
      const offCtx = cachedTile.getContext('2d');
      if (offCtx) {
        offCtx.scale(scaleFactor, scaleFactor);
        pattern.draw(offCtx, tileSize, tileSize);
        washiPatternCache.set(cacheKey, cachedTile);
      } else {
        cachedTile = undefined;
      }
    } catch (e) {
      console.warn('[Washi] Failed to create pattern tile:', e);
      cachedTile = undefined;
    }
  }

  // Torn edge clipping
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(tape.width, 0);
  const rSteps = Math.ceil(tape.height / 5);
  for (let i = 0; i <= rSteps; i++) {
    const py = (i / rSteps) * tape.height;
    const px = tape.width + (((i * 7 + 3) % 5) - 2) * 1.2;
    ctx.lineTo(px, py);
  }
  ctx.lineTo(0, tape.height);
  for (let i = rSteps; i >= 0; i--) {
    const py = (i / rSteps) * tape.height;
    const px = (((i * 11 + 2) % 5) - 2) * 1.2;
    ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.clip();

  ctx.globalAlpha = Math.max(tape.opacity, 0.95);

  // Try pattern fill, fallback to direct draw, then solid color
  let filled = false;
  if (cachedTile) {
    try {
      const tiledPattern = ctx.createPattern(cachedTile, 'repeat');
      if (tiledPattern) {
        const patMatrix = new DOMMatrix();
        patMatrix.scaleSelf(1 / scaleFactor, 1 / scaleFactor);
        tiledPattern.setTransform(patMatrix);
        ctx.fillStyle = tiledPattern;
        ctx.fillRect(0, 0, tape.width, tape.height);
        filled = true;
      }
    } catch (e) {
      console.warn('[Washi] createPattern failed, using fallback:', e);
    }
  }

  if (!filled) {
    // Fallback: draw the pattern directly onto the tape area
    try {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, tape.width, tape.height);
      ctx.clip();
      pattern.draw(ctx, tape.width, tape.height);
      ctx.restore();
    } catch (e) {
      // Last resort: solid color fill
      ctx.fillStyle = pattern.bgColor;
      ctx.fillRect(0, 0, tape.width, tape.height);
    }
  }

  // No gloss overlay — keep colors fully sharp and vivid

  ctx.restore();

  // Selection UI
  if (isSelected) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'hsl(210 100% 50%)';
    ctx.lineWidth = 2 / zoom;
    ctx.setLineDash([6 / zoom, 4 / zoom]);
    ctx.strokeRect(-2 / zoom, -2 / zoom, tape.width + 4 / zoom, tape.height + 4 / zoom);
    ctx.setLineDash([]);
    const hs = 6 / zoom;
    const handles = [
      [0, 0], [tape.width, 0], [0, tape.height], [tape.width, tape.height],
    ];
    for (const [hx, hy] of handles) {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'hsl(210 100% 50%)';
      ctx.lineWidth = 1.5 / zoom;
      ctx.beginPath(); ctx.arc(hx, hy, hs, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    const rotX = tape.width / 2;
    const rotY = -20 / zoom;
    ctx.beginPath(); ctx.moveTo(tape.width / 2, 0); ctx.lineTo(rotX, rotY); ctx.strokeStyle = 'hsl(210 100% 50%)'; ctx.lineWidth = 1 / zoom; ctx.stroke();
    ctx.beginPath(); ctx.arc(rotX, rotY, hs * 0.7, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = 'hsl(210 100% 50%)'; ctx.lineWidth = 1.5 / zoom; ctx.stroke();
  }

  ctx.restore();
};
