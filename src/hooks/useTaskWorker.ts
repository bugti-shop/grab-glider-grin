/**
 * useTaskWorker — React hook for communicating with the task Web Worker.
 * 
 * Provides typed methods for offloading heavy computations:
 * - filterSort: filter + sort tasks (Today page)
 * - upcomingGroup: filter + group upcoming tasks
 * - historyGroup: filter + group history tasks
 * - stats: compute productivity stats
 * 
 * Results are returned via state, so components re-render when ready.
 * Automatically cancels stale requests (only latest result is applied).
 */
import { useRef, useCallback, useEffect, useState } from 'react';

// Create worker singleton (shared across all hook instances)
let workerInstance: Worker | null = null;
let workerFailed = false;
const pendingCallbacks = new Map<string, (result: any) => void>();
const pendingErrors = new Map<string, (error: string) => void>();

function getWorker(): Worker | null {
  if (workerFailed) return null;
  if (workerInstance) return workerInstance;

  try {
    workerInstance = new Worker(
      new URL('../workers/taskWorker.ts', import.meta.url),
      { type: 'module' }
    );
    workerInstance.onmessage = (e) => {
      const { type, id, result, error } = e.data;
      if (type === 'result') {
        pendingCallbacks.get(id)?.(result);
        pendingCallbacks.delete(id);
        pendingErrors.delete(id);
      } else if (type === 'error') {
        pendingErrors.get(id)?.(error);
        pendingCallbacks.delete(id);
        pendingErrors.delete(id);
      }
    };
    workerInstance.onerror = () => {
      console.warn('Task worker failed to initialize, falling back to main thread');
      workerFailed = true;
      workerInstance = null;
    };
    return workerInstance;
  } catch {
    workerFailed = true;
    return null;
  }
}

let requestCounter = 0;

function postToWorker<T>(type: string, payload: any): Promise<T> {
  const worker = getWorker();
  const id = `${type}-${++requestCounter}`;

  if (!worker) {
    return Promise.reject(new Error('Worker unavailable'));
  }

  return new Promise<T>((resolve, reject) => {
    pendingCallbacks.set(id, resolve);
    pendingErrors.set(id, reject);
    worker.postMessage({ type, id, payload });
  });
}

// ── Serialization helpers ──
// Convert TodoItem dates to strings for worker (structured clone can't handle Date reliably across all browsers)
function serializeItems(items: any[]): any[] {
  return items.map(item => ({
    ...item,
    dueDate: item.dueDate ? new Date(item.dueDate).toISOString() : null,
    reminderTime: item.reminderTime ? new Date(item.reminderTime).toISOString() : null,
    completedAt: item.completedAt ? new Date(item.completedAt).toISOString() : null,
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
    // Strip heavy fields not needed for filtering
    voiceRecording: undefined,
    imageUrl: item.imageUrl ? 'has-image' : undefined,
    subtasks: item.subtasks ? item.subtasks.map((s: any) => ({
      id: s.id,
      text: s.text,
      completed: s.completed,
      priority: s.priority,
      status: s.status,
    })) : undefined,
  }));
}

// ── Typed public API ──

export interface FilterSortResult {
  uncompleted: any[];
  completed: any[];
  total: number;
}

export interface StatsResult {
  total: number;
  completed: number;
  completionRate: number;
  overdue: number;
  highPriority: number;
  withSubtasks: number;
  totalSubtasks: number;
  completedSubtasks: number;
}

/**
 * Hook that provides worker-powered task processing.
 * Falls back to returning null if worker is unavailable (caller should use main-thread fallback).
 */
export function useTaskWorker() {
  const latestRequestRef = useRef<Record<string, number>>({});

  // Cancel stale results by tracking latest request per type
  const makeRequest = useCallback(async <T>(type: string, payload: any): Promise<T | null> => {
    const reqId = ++requestCounter;
    latestRequestRef.current[type] = reqId;

    try {
      const result = await postToWorker<T>(type, payload);
      // Only return if this is still the latest request
      if (latestRequestRef.current[type] !== reqId) return null;
      return result;
    } catch {
      return null;
    }
  }, []);

  const filterSort = useCallback((payload: {
    items: any[];
    smartList: string;
    selectedFolderId: string | null;
    allowedFolderIds?: string[];
    priorityFilter: string;
    statusFilter: string;
    dateFilter: string;
    tagFilter: string[];
    sortBy: string;
    searchQuery: string;
    showCompleted: boolean;
  }) => {
    return makeRequest<FilterSortResult>('filterSort', {
      ...payload,
      items: serializeItems(payload.items),
    });
  }, [makeRequest]);

  const upcomingGroup = useCallback((payload: {
    items: any[];
    smartList: string;
    priorityFilter: string;
    statusFilter: string;
    selectedFolderId: string | null;
    showCompleted: boolean;
    sortOrder: 'asc' | 'desc';
    groupBy: 'week' | 'month';
  }) => {
    return makeRequest<Record<string, any[]>>('upcomingGroup', {
      ...payload,
      items: serializeItems(payload.items),
    });
  }, [makeRequest]);

  const historyGroup = useCallback((payload: {
    items: any[];
    searchQuery: string;
    filter: string;
    sortBy: string;
    dateFrom?: string | null;
    dateTo?: string | null;
    labels: { today: string; yesterday: string; thisWeek: string; month: string };
  }) => {
    return makeRequest<{ filtered: any[]; groups: Record<string, any[]> }>('historyGroup', {
      ...payload,
      items: serializeItems(payload.items),
    });
  }, [makeRequest]);

  const computeStats = useCallback((items: any[]) => {
    return makeRequest<StatsResult>('stats', { items: serializeItems(items) });
  }, [makeRequest]);

  return {
    filterSort,
    upcomingGroup,
    historyGroup,
    computeStats,
    isAvailable: !workerFailed,
  };
}
