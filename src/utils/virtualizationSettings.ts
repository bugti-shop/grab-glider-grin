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

export type VirtualizationListType = 'tasks' | 'notes';

const STORAGE_KEY = 'flowist:virtualization-settings:v4';
const EVENT_NAME = 'flowist:virtualization-settings-changed';

export const DEFAULT_VIRTUALIZATION_SETTINGS: VirtualizationSettings = {
  notes: {
    overscan: 6,
    // 148px row keeps a uniform gap between cards regardless of content
    // length. Combined with `h-full` on the card itself, empty/blank notes
    // stretch to fill the row so the spacing never looks lopsided.
    rowHeight: 148,
    windowing: true,
  },
  tasks: {
    overscan: 12,
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
      rowHeight: clampNumber(input?.notes?.rowHeight, 96, 260, DEFAULT_VIRTUALIZATION_SETTINGS.notes.rowHeight),
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

export function getAdaptiveOverscan(
  baseOverscan: number,
  itemCount: number,
  listType: VirtualizationListType = 'tasks',
): number {
  // Automatic tuning for large local datasets.  At 10k–50k rows, keeping the
  // mounted DOM tiny is more important than a big offscreen buffer; otherwise
  // fast route switches and momentum scrolling can stall long enough to show a
  // blank page.  Notes are grid rows, so each overscan unit can mean 1–3 cards.
  if (listType === 'notes') {
    if (itemCount >= 50_000) return Math.min(baseOverscan, 3);
    if (itemCount >= 10_000) return Math.min(baseOverscan, 4);
    if (itemCount >= 5_000) return Math.min(baseOverscan, 5);
    if (itemCount >= 1_000) return Math.min(baseOverscan, 6);
    return Math.max(baseOverscan, 6);
  }

  if (itemCount >= 100_000) return Math.min(baseOverscan, 3);
  if (itemCount >= 50_000) return Math.min(baseOverscan, 4);
  if (itemCount >= 25_000) return Math.min(baseOverscan, 5);
  if (itemCount >= 10_000) return Math.min(baseOverscan, 6);
  if (itemCount >= 5_000) return Math.min(baseOverscan, 8);
  if (itemCount >= 1_000) return Math.min(baseOverscan, 10);
  return Math.max(baseOverscan, 14);
}

if (typeof window !== 'undefined') {
  (window as any).__flowistVirtualization = {
    get: loadVirtualizationSettings,
    set: saveVirtualizationSettings,
    reset: resetVirtualizationSettings,
  };
}