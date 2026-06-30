import { useEffect, useState } from 'react';

export interface VirtualizationSettings {
  notes: {
    overscan: number;
    rowHeight: number;
    windowing: boolean;
  };
  tasks: {
    overscan: number;
    rowHeight: number;
    compactRowHeight: number;
    windowing: boolean;
  };
}

const STORAGE_KEY = 'flowist:virtualization-settings';
const EVENT_NAME = 'flowist:virtualization-settings-changed';

export const DEFAULT_VIRTUALIZATION_SETTINGS: VirtualizationSettings = {
  notes: {
    overscan: 6,
    // Tuned to the natural NoteCard height (title + 2-line preview + footer
    // chip + 16px internal padding ≈ 116-120px). Keeping the row tight
    // eliminates the large white gap between cards while still leaving room
    // for the 8px inter-row padding rendered inside the row container.
    rowHeight: 124,
    windowing: true,
  },
  tasks: {
    overscan: 18,
    rowHeight: 58,
    compactRowHeight: 44,
    windowing: true,
  },
};


const clampNumber = (value: unknown, min: number, max: number, fallback: number) => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
};

export function normalizeVirtualizationSettings(input: Partial<VirtualizationSettings> | null | undefined): VirtualizationSettings {
  return {
    notes: {
      overscan: clampNumber(input?.notes?.overscan, 2, 24, DEFAULT_VIRTUALIZATION_SETTINGS.notes.overscan),
      rowHeight: clampNumber(input?.notes?.rowHeight, 120, 260, DEFAULT_VIRTUALIZATION_SETTINGS.notes.rowHeight),
      windowing: input?.notes?.windowing !== false,
    },
    tasks: {
      overscan: clampNumber(input?.tasks?.overscan, 4, 36, DEFAULT_VIRTUALIZATION_SETTINGS.tasks.overscan),
      rowHeight: clampNumber(input?.tasks?.rowHeight, 46, 88, DEFAULT_VIRTUALIZATION_SETTINGS.tasks.rowHeight),
      compactRowHeight: clampNumber(input?.tasks?.compactRowHeight, 36, 64, DEFAULT_VIRTUALIZATION_SETTINGS.tasks.compactRowHeight),
      windowing: input?.tasks?.windowing !== false,
    },
  };
}

export function loadVirtualizationSettings(): VirtualizationSettings {
  if (typeof window === 'undefined') return DEFAULT_VIRTUALIZATION_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return normalizeVirtualizationSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_VIRTUALIZATION_SETTINGS;
  }
}

export function saveVirtualizationSettings(next: VirtualizationSettings): VirtualizationSettings {
  const normalized = normalizeVirtualizationSettings(next);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: normalized }));
    } catch {}
  }
  return normalized;
}

export function resetVirtualizationSettings(): VirtualizationSettings {
  if (typeof window !== 'undefined') {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch {}
  }
  return saveVirtualizationSettings(DEFAULT_VIRTUALIZATION_SETTINGS);
}

export function subscribeVirtualizationSettings(listener: (settings: VirtualizationSettings) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onChange = (event: Event) => {
    const detail = (event as CustomEvent<VirtualizationSettings>).detail;
    listener(detail ? normalizeVirtualizationSettings(detail) : loadVirtualizationSettings());
  };
  window.addEventListener(EVENT_NAME, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT_NAME, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useVirtualizationSettings(): [VirtualizationSettings, (next: VirtualizationSettings) => void] {
  const [settings, setSettings] = useState<VirtualizationSettings>(() => loadVirtualizationSettings());

  useEffect(() => subscribeVirtualizationSettings(setSettings), []);

  const update = (next: VirtualizationSettings) => setSettings(saveVirtualizationSettings(next));
  return [settings, update];
}

export function getAdaptiveOverscan(baseOverscan: number, itemCount: number): number {
  // Bias toward larger overscan on small/medium lists (smoother fast-scroll,
  // no blank bands), trim it on very large lists to cap DOM cost.
  if (itemCount >= 100_000) return Math.min(baseOverscan, 6);
  if (itemCount >= 25_000) return Math.min(baseOverscan, 10);
  if (itemCount >= 5_000) return Math.min(baseOverscan, 16);
  return Math.max(baseOverscan, 20);
}

if (typeof window !== 'undefined') {
  (window as any).__flowistVirtualization = {
    get: loadVirtualizationSettings,
    set: saveVirtualizationSettings,
    reset: resetVirtualizationSettings,
  };
}