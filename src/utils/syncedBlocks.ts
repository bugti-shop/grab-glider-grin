/**
 * Synced blocks: content that mirrors across notes/pages.
 *
 * Each block is identified by an ID. Its HTML body is persisted in
 * localStorage and broadcast in real time via BroadcastChannel so every
 * editor / viewer instance updates immediately when one user edits it.
 */

const STORAGE_KEY = 'synced_blocks_v1';
const CHANNEL_NAME = 'synced_blocks_channel';

type Store = Record<string, { html: string; updatedAt: number }>;

const listeners = new Set<(id: string, html: string) => void>();

const readStore = (): Store => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
};

const writeStore = (store: Store) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* quota or disabled — ignore */
  }
};

let channel: BroadcastChannel | null = null;
const getChannel = (): BroadcastChannel | null => {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!channel) {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.addEventListener('message', (e: MessageEvent) => {
        const data = e.data as { type: string; id: string; html: string };
        if (data?.type === 'update' && data.id) {
          listeners.forEach((fn) => fn(data.id, data.html));
        }
      });
    } catch {
      channel = null;
    }
  }
  return channel;
};

export const getSyncedBlock = (id: string): string | null => {
  const store = readStore();
  return store[id]?.html ?? null;
};

export const setSyncedBlock = (id: string, html: string) => {
  const store = readStore();
  if (store[id]?.html === html) return;
  store[id] = { html, updatedAt: Date.now() };
  writeStore(store);
  // Notify same-window subscribers
  listeners.forEach((fn) => fn(id, html));
  // Notify other tabs
  try {
    getChannel()?.postMessage({ type: 'update', id, html });
  } catch {
    /* ignore */
  }
};

export const subscribeSyncedBlocks = (fn: (id: string, html: string) => void) => {
  listeners.add(fn);
  // Ensure channel is initialised
  getChannel();
  // Cross-tab via storage event as fallback
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      const next = JSON.parse(e.newValue) as Store;
      const prev = e.oldValue ? (JSON.parse(e.oldValue) as Store) : {};
      Object.keys(next).forEach((id) => {
        if (!prev[id] || prev[id].html !== next[id].html) fn(id, next[id].html);
      });
    } catch {
      /* ignore */
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
};

export interface SyncedBlockSummary {
  id: string;
  preview: string;
  updatedAt: number;
}

export const listSyncedBlocks = (): SyncedBlockSummary[] => {
  const store = readStore();
  return Object.entries(store)
    .map(([id, v]) => ({
      id,
      preview: (v.html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || '(empty)',
      updatedAt: v.updatedAt,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
};

export const createSyncedBlockId = () =>
  `sb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
