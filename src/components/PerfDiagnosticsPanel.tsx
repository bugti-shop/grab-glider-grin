/**
 * PerfDiagnosticsPanel — lightweight floating overlay showing live FPS,
 * total render count, virtualized DOM-row count, and long-task warnings.
 *
 * Toggle: press Ctrl/Cmd + Shift + P, or set
 *   localStorage.setItem('perf:panel','1')
 * Read-only: never mutates app state, safe to leave running.
 */
import { useEffect, useRef, useState } from 'react';
import { getRecentPerfEvents, startScrollJankMonitor, subscribePerfLog } from '@/utils/perfLogger';

interface Stats {
  fps: number;
  renders: number;
  virtRows: number;
  longTasks: number;
  lastLongTaskMs: number;
  lastBulkAddMs: number;
  lastBulkAddCount: number;
  lastBulkAddVia: string;
  scrollJankCount: number;
  lastScrollJankMs: number;
  noteFps: number;
  taskFps: number;
  lastReorderMs: number;
  lastReorderOk: boolean | null;
}

const STORAGE_KEY = 'perf:panel';

export function PerfDiagnosticsPanel() {
  const [visible, setVisible] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  });
  const [stats, setStats] = useState<Stats>({ fps: 0, renders: 0, virtRows: 0, longTasks: 0, lastLongTaskMs: 0, lastBulkAddMs: 0, lastBulkAddCount: 0, lastBulkAddVia: '', scrollJankCount: 0, lastScrollJankMs: 0, noteFps: 0, taskFps: 0, lastReorderMs: 0, lastReorderOk: null });
  const renderCountRef = useRef(0);

  // Toggle hotkey
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        e.preventDefault();
        setVisible(v => {
          const nv = !v;
          try { nv ? localStorage.setItem(STORAGE_KEY, '1') : localStorage.removeItem(STORAGE_KEY); } catch {}
          return nv;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Count every React commit anywhere in the tree by hooking MutationObserver
  // on the body — cheap proxy for "DOM changed".
  useEffect(() => {
    if (!visible) return;
    const obs = new MutationObserver(() => { renderCountRef.current += 1; });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [visible]);

  // FPS + virtualized row count sampler
  useEffect(() => {
    if (!visible) return;
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const loop = () => {
      frames++;
      const now = performance.now();
      if (now - last >= 1000) {
        const virtRows = document.querySelectorAll('[data-index]').length;
        setStats(s => ({ ...s, fps: frames, virtRows, renders: renderCountRef.current }));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  // Long-task observer
  useEffect(() => {
    if (!visible) return;
    if (typeof PerformanceObserver === 'undefined') return;
    let po: PerformanceObserver | null = null;
    try {
      po = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 50) {
            setStats(s => ({ ...s, longTasks: s.longTasks + 1, lastLongTaskMs: Math.round(entry.duration) }));
          }
        }
      });
      po.observe({ entryTypes: ['longtask'] });
    } catch {}
    return () => { try { po?.disconnect(); } catch {} };
  }, [visible]);

  // Perf-logger subscription — surface bulkAdd + scrollJank events live.
  useEffect(() => {
    if (!visible) return;
    startScrollJankMonitor();
    // Seed from existing history so the panel isn't empty on open.
    const recentBulk = getRecentPerfEvents('bulkAdd', 1)[0];
    const recentJank = getRecentPerfEvents('scrollJank', 1)[0];
    setStats((s) => ({
      ...s,
      lastBulkAddMs: recentBulk?.data?.ms ?? s.lastBulkAddMs,
      lastBulkAddCount: recentBulk?.data?.count ?? s.lastBulkAddCount,
      lastBulkAddVia: recentBulk?.data?.via ?? s.lastBulkAddVia,
      lastScrollJankMs: recentJank?.data?.gapMs ?? s.lastScrollJankMs,
    }));
    const unsub = subscribePerfLog((ev) => {
      if (ev.kind === 'bulkAdd') {
        setStats((s) => ({
          ...s,
          lastBulkAddMs: ev.data.ms ?? 0,
          lastBulkAddCount: ev.data.count ?? 0,
          lastBulkAddVia: ev.data.via ?? '',
        }));
      } else if (ev.kind === 'scrollJank') {
        setStats((s) => ({
          ...s,
          scrollJankCount: s.scrollJankCount + 1,
          lastScrollJankMs: ev.data.gapMs ?? 0,
        }));
      } else if (ev.kind === 'fps') {
        setStats((s) => ({
          ...s,
          noteFps: ev.data.label === 'NotesVirtualGrid' ? (ev.data.fps ?? 0) : s.noteFps,
          taskFps: ev.data.label === 'FlatTaskList' ? (ev.data.fps ?? 0) : s.taskFps,
        }));
      } else if (ev.kind === 'reorder') {
        setStats((s) => ({
          ...s,
          lastReorderMs: ev.data.ms ?? 0,
          lastReorderOk: ev.data.ok ?? null,
        }));
      }
    });
    return unsub;
  }, [visible]);

  if (!visible) return null;

  const fpsColor = stats.fps >= 55 ? '#22c55e' : stats.fps >= 30 ? '#eab308' : '#ef4444';

  return (
    <div
      role="status"
      aria-label="Performance diagnostics"
      style={{
        position: 'fixed', bottom: 12, right: 12, zIndex: 99999,
        background: 'rgba(15,23,42,0.92)', color: '#fff',
        font: '11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
        padding: '8px 10px', borderRadius: 8, minWidth: 160,
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)', pointerEvents: 'auto',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <strong>perf</strong>
        <button
          onClick={() => { setVisible(false); try { localStorage.removeItem(STORAGE_KEY); } catch {} }}
          style={{ background: 'transparent', color: '#94a3b8', border: 0, cursor: 'pointer', padding: 0 }}
          aria-label="Close performance panel"
        >×</button>
      </div>
      <div>FPS: <span style={{ color: fpsColor }}>{stats.fps}</span></div>
      <div>Notes FPS: {stats.noteFps || '—'}</div>
      <div>Tasks FPS: {stats.taskFps || '—'}</div>
      <div>Virt rows: {stats.virtRows}</div>
      <div>DOM mutations: {stats.renders}</div>
      <div>Long tasks: {stats.longTasks}{stats.lastLongTaskMs ? ` (${stats.lastLongTaskMs}ms)` : ''}</div>
      <div>Reorder: {stats.lastReorderOk == null ? '—' : stats.lastReorderOk ? `ok ${stats.lastReorderMs}ms` : 'failed'}</div>
      <div>Scroll jank: {stats.scrollJankCount}{stats.lastScrollJankMs ? ` (${stats.lastScrollJankMs}ms)` : ''}</div>
      <div>
        Bulk add: {stats.lastBulkAddCount
          ? `${stats.lastBulkAddCount} in ${stats.lastBulkAddMs}ms${stats.lastBulkAddVia ? ` (${stats.lastBulkAddVia})` : ''}`
          : '—'}
      </div>
      <div style={{ marginTop: 4, color: '#94a3b8' }}>⌘/Ctrl+Shift+P</div>
    </div>
  );
}
