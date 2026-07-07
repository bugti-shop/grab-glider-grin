import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { App as CapApp } from '@capacitor/app';
import { getTextPreviewFromHtml } from './contentPreview';
import { loadNoteFromDB, loadNotesMetadataFromDB } from './noteStorage';
import { loadTodoItems } from './todoItemsStorage';
import { saveTodoItem } from './todoItemsStorage';
import { getSetting, setSetting } from './settingsStorage';
import { Note, NoteType, TodoItem, Folder } from '@/types/note';
import { loadFolders } from './folderStorage';
import { loadStreakData } from './streakStorage';
import { loadHabits } from './habitStorage';
import { isHabitDueOnDate } from './habitScheduler';
import { format } from 'date-fns';
import { genId } from '@/utils/genId';
import { parseNaturalLanguageTask } from '@/utils/naturalLanguageParser';

// Widget configuration types
export interface WidgetConfig {
  id: string;
  type: WidgetType;
  enabled: boolean;
  noteId?: string; // For specific note widgets
  sectionId?: string; // For section widgets
  noteType?: NoteType; // For note type widgets
}

export type WidgetType = 
  | 'section_tasks' 
  | 'specific_note';

// Widget data structures for native widgets
export interface TaskWidgetData {
  tasks: {
    id: string;
    text: string;
    completed: boolean;
    priority: string;
    dueDate?: string;
  }[];
  lastUpdated: string;
}

export interface NoteWidgetData {
  id: string;
  title: string;
  content: string; // Plain text preview
  type: NoteType;
  color?: string;
  lastUpdated: string;
}

export interface SectionWidgetData {
  sectionId: string;
  sectionName: string;
  tasks: TaskWidgetData['tasks'];
  lastUpdated: string;
}

export interface NotesListWidgetData {
  notes: {
    id: string;
    title: string;
    type: NoteType;
    preview: string;
  }[];
  lastUpdated: string;
}

// SharedPreferences keys for native widgets
const WIDGET_PREFS_PREFIX = 'flowist_widget_';
const WIDGET_TASKS_KEY = `${WIDGET_PREFS_PREFIX}tasks`;
const WIDGET_NOTES_KEY = `${WIDGET_PREFS_PREFIX}notes`;
const WIDGET_SECTIONS_KEY = `${WIDGET_PREFS_PREFIX}sections`;
const WIDGET_CONFIG_KEY = `${WIDGET_PREFS_PREFIX}config`;
const WIDGET_NOTES_BY_TYPE_KEY = `${WIDGET_PREFS_PREFIX}notes_by_type`;
const WIDGET_FOLDERS_KEY = `${WIDGET_PREFS_PREFIX}folders`;
const WIDGET_STREAK_KEY = `streak_data`;
const WIDGET_HABITS_KEY = `${WIDGET_PREFS_PREFIX}habits`;
const WIDGET_PENDING_TASKS_KEY = 'widget_pending_new_tasks';

/**
 * Widget Data Sync Manager
 * Syncs app data to SharedPreferences for native Android widgets to read
 */
class WidgetDataSyncManager {
  private static instance: WidgetDataSyncManager;
  private syncInProgress = false;
  private initialized = false;

  private constructor() {}

  static getInstance(): WidgetDataSyncManager {
    if (!WidgetDataSyncManager.instance) {
      WidgetDataSyncManager.instance = new WidgetDataSyncManager();
    }
    return WidgetDataSyncManager.instance;
  }

  /**
   * Initialize widget data sync - call on app start
   */
  async initialize(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      console.log('[WidgetSync] Not on native platform, skipping');
      return;
    }
    if (this.initialized) {
      await this.drainPendingWidgetPath();
      await this.drainPendingNewTasks();
      return;
    }
    this.initialized = true;

    // Handle widget deep-link path (set by native MainActivity on widget tap).
    // Drain once on startup AND every time the app resumes — when the app is
    // already running, onCreate doesn't fire again so we must also listen for
    // appStateChange/resume to pick up the pending path written by onNewIntent.
    await this.drainPendingWidgetPath();
    await this.drainPendingNewTasks();
    [100, 350, 900, 1600].forEach((delay) => {
      window.setTimeout(() => this.drainPendingWidgetPath().catch(() => {}), delay);
    });
    try {
      CapApp.addListener('appUrlOpen', ({ url }: { url: string }) => {
        this.openWidgetUrl(url).catch(() => {});
      });
      CapApp.addListener('appStateChange', (s: { isActive: boolean }) => {
        if (s.isActive) this.drainPendingWidgetPath().catch(() => {});
        if (s.isActive) this.drainPendingNewTasks().catch(() => {});
      });
      CapApp.addListener('resume', () => {
        this.drainPendingWidgetPath().catch(() => {});
        this.drainPendingNewTasks().catch(() => {});
      });
    } catch {}

    // Initial sync after route handling so widget taps never wait on IndexedDB.
    await this.syncAllData();

    // Listen for data changes
    window.addEventListener('notesUpdated', () => this.syncNotes());
    window.addEventListener('todoItemsChanged', () => this.syncTasks());
    window.addEventListener('tasksUpdated', () => this.syncTasks());
    window.addEventListener('sectionsUpdated', () => this.syncSections());
    window.addEventListener('foldersUpdated', () => this.syncFolders());
    window.addEventListener('streakUpdated', () => this.syncStreak());
    window.addEventListener('habitsUpdated', () => this.syncHabits());

    console.log('[WidgetSync] Initialized successfully');
  }

  private async drainPendingWidgetPath(): Promise<void> {
    try {
      const { value } = await Preferences.get({ key: 'widget_pending_path' });
      if (!value) return;
      await Preferences.remove({ key: 'widget_pending_path' });
      this.openWidgetPath(value);
    } catch {}
  }

  private draining = false;
  private async drainPendingNewTasks(): Promise<void> {
    // Guard against re-entrant drains (resume + appStateChange fire together)
    if (this.draining) return;
    this.draining = true;
    try {
      const { value } = await Preferences.get({ key: WIDGET_PENDING_TASKS_KEY });
      if (!value) return;
      let arr: Array<{ text?: string; createdAt?: number }> = [];
      try { arr = JSON.parse(value) || []; } catch { arr = []; }
      if (!Array.isArray(arr) || arr.length === 0) {
        await Preferences.remove({ key: WIDGET_PENDING_TASKS_KEY });
        return;
      }

      // CRASH-SAFE DRAIN: save first, remove ONLY successfully-saved entries.
      // If we crash mid-loop, unsaved items remain queued for the next drain.
      const remaining: typeof arr = [];
      let savedAny = false;
      for (const item of arr) {
        const text = String(item?.text || '').trim();
        if (!text) continue;
        try {
          const parsed = parseNaturalLanguageTask(text);
          const now = new Date(item.createdAt || Date.now());
          const task: TodoItem = {
            id: genId(),
            text,
            completed: false,
            priority: parsed.priority || 'none',
            dueDate: parsed.dueDate,
            reminderTime: parsed.reminderTime,
            repeatType: parsed.repeatType || 'none',
            repeatDays: parsed.repeatDays,
            advancedRepeat: parsed.advancedRepeat,
            description: parsed.description,
            location: parsed.location,
            createdAt: now,
            modifiedAt: now,
          } as TodoItem;
          await saveTodoItem(task);
          savedAny = true;
        } catch (err) {
          console.warn('[WidgetSync] Failed to save queued task, will retry', err);
          remaining.push(item);
        }
      }

      // Persist only what still needs to be drained.
      if (remaining.length === 0) {
        await Preferences.remove({ key: WIDGET_PENDING_TASKS_KEY });
      } else {
        await Preferences.set({ key: WIDGET_PENDING_TASKS_KEY, value: JSON.stringify(remaining) });
      }

      if (savedAny) {
        window.dispatchEvent(new Event('tasksUpdated'));
        window.dispatchEvent(new Event('todoItemsChanged'));
        try { window.dispatchEvent(new CustomEvent('flowist:widget:drained', { detail: { count: arr.length - remaining.length } })); } catch {}
        await this.syncTasks();
      }
    } catch (e) {
      console.warn('[WidgetSync] Pending launcher tasks drain failed', e);
    } finally {
      this.draining = false;
    }
  }

  /** Public: peek at the pending launcher-task queue (for diagnostics). */
  async peekPendingNewTasks(): Promise<Array<{ text?: string; createdAt?: number }>> {
    try {
      const { value } = await Preferences.get({ key: WIDGET_PENDING_TASKS_KEY });
      if (!value) return [];
      const arr = JSON.parse(value);
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }

  /** Public: force a drain attempt now (for diagnostics "Drain now" button). */
  async forceDrainPendingNewTasks(): Promise<void> {
    return this.drainPendingNewTasks();
  }


  private async openWidgetUrl(url: string): Promise<void> {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'codaib:' || parsed.hostname !== 'widget') return;
      this.openWidgetPath(`${parsed.pathname}${parsed.search}`);
    } catch {}
  }

  private openWidgetPath(path: string): void {
    if (typeof window === 'undefined' || !path.startsWith('/')) return;
    const current = window.location.pathname + window.location.search;
    if (path !== current) {
      window.history.pushState({}, '', path);
    }
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.dispatchEvent(new CustomEvent('widgetRouteOpen', { detail: { path } }));
  }

  /**
   * Sync all data to SharedPreferences
   */
  async syncAllData(): Promise<void> {
    if (this.syncInProgress) return;
    this.syncInProgress = true;

    try {
      await Promise.all([
        this.syncTasks(),
        this.syncNotes(),
        this.syncSections(),
        this.syncFolders(),
        this.syncStreak(),
        this.syncHabits(),
      ]);
      console.log('[WidgetSync] All data synced');
    } catch (error) {
      console.error('[WidgetSync] Sync error:', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Sync tasks to SharedPreferences
   */
  async syncTasks(): Promise<void> {
    try {
      const tasks = await loadTodoItems();
      
      // Get today's and upcoming tasks (limit for widget performance)
      const now = new Date();
      const relevantTasks = tasks
        .filter(t => !t.completed)
        .slice(0, 20) // Limit for widget
        .map(t => ({
          id: t.id,
          text: t.text,
          completed: t.completed,
          priority: t.priority || 'none',
          dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : undefined,
          sectionId: t.sectionId,
        }));

      const taskData: TaskWidgetData = {
        tasks: relevantTasks,
        lastUpdated: now.toISOString(),
      };

      await Preferences.set({
        key: WIDGET_TASKS_KEY,
        value: JSON.stringify(taskData),
      });

      // Notify native widgets to refresh
      this.notifyWidgetUpdate('tasks');
    } catch (error) {
      console.error('[WidgetSync] Task sync error:', error);
    }
  }

  /**
   * Sync notes to SharedPreferences
   */
  async syncNotes(): Promise<void> {
    try {
      const notes = await loadNotesMetadataFromDB();
      const now = new Date();

      // Group notes by type
      const notesByType: Record<NoteType, NoteWidgetData[]> = {
        regular: [],
        sticky: [],
        lined: [],
        code: [],
        
        voice: [],
        textformat: [],
        linkedin: [],
        sketch: [],
      };

      // Process notes (limit per type for widget performance)
      notes.slice(0, 50).forEach(note => {
        const preview = (note as any).__contentPreview || getTextPreviewFromHtml(note.content, 200);
        const widgetNote: NoteWidgetData = {
          id: note.id,
          title: note.title || 'Untitled',
          content: preview,
          type: note.type,
          color: note.color,
          lastUpdated: new Date(note.updatedAt).toISOString(),
        };

        if (notesByType[note.type].length < 10) {
          notesByType[note.type].push(widgetNote);
        }
      });

      await Preferences.set({
        key: WIDGET_NOTES_BY_TYPE_KEY,
        value: JSON.stringify(notesByType),
      });

      // Also save a flat list for dropdown widget
      const notesList: NotesListWidgetData = {
        notes: notes.slice(0, 30).map(n => ({
          id: n.id,
          title: n.title || 'Untitled',
          type: n.type,
          preview: (n as any).__contentPreview || getTextPreviewFromHtml(n.content, 100),
        })),
        lastUpdated: now.toISOString(),
      };

      await Preferences.set({
        key: WIDGET_NOTES_KEY,
        value: JSON.stringify(notesList),
      });

      this.notifyWidgetUpdate('notes');
    } catch (error) {
      console.error('[WidgetSync] Notes sync error:', error);
    }
  }

  /**
   * Sync sections with tasks to SharedPreferences
   */
  async syncSections(): Promise<void> {
    try {
      const sections = await getSetting<any[]>('task_sections', []);
      const tasks = await loadTodoItems();
      const now = new Date();

      const sectionData: SectionWidgetData[] = sections.slice(0, 10).map(section => ({
        sectionId: section.id,
        sectionName: section.name,
        tasks: tasks
          .filter(t => t.sectionId === section.id && !t.completed)
          .slice(0, 5)
          .map(t => ({
            id: t.id,
            text: t.text,
            completed: t.completed,
            priority: t.priority || 'none',
            dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : undefined,
          })),
        lastUpdated: now.toISOString(),
      }));

      await Preferences.set({
        key: WIDGET_SECTIONS_KEY,
        value: JSON.stringify(sectionData),
      });

      this.notifyWidgetUpdate('sections');
    } catch (error) {
      console.error('[WidgetSync] Sections sync error:', error);
    }
  }

  /**
   * Sync folders to SharedPreferences
   */
  async syncFolders(): Promise<void> {
    try {
      const folders = await loadFolders();
      const data = folders.slice(0, 20).map(f => ({
        id: f.id,
        name: f.name,
        color: (f as any).color,
      }));
      await Preferences.set({ key: WIDGET_FOLDERS_KEY, value: JSON.stringify(data) });
      this.notifyWidgetUpdate('folders');
    } catch (error) {
      console.error('[WidgetSync] Folders sync error:', error);
    }
  }

  /**
   * Sync streak data to SharedPreferences (key consumed by native StreaksWidget)
   */
  async syncStreak(): Promise<void> {
    try {
      const streak = await loadStreakData('task_completion_streak');
      await Preferences.set({
        key: WIDGET_STREAK_KEY,
        value: JSON.stringify({
          currentStreak: streak.currentStreak,
          longestStreak: streak.longestStreak,
        }),
      });
      this.notifyWidgetUpdate('streak');
    } catch (error) {
      console.error('[WidgetSync] Streak sync error:', error);
    }
  }

  /**
   * Sync today's habits to SharedPreferences for the HabitsListWidget.
   * Limits to ~15 due-today habits with a tiny payload for fast widget renders.
   */
  async syncHabits(): Promise<void> {
    try {
      const all = await loadHabits();
      const today = new Date();
      const todayKey = format(today, 'yyyy-MM-dd');
      const due = all.filter((h) => !h.isArchived && isHabitDueOnDate(h, today));

      const habits = due.slice(0, 15).map((h) => {
        const rec = h.completions.find((c) => c.date === todayKey);
        const isAmount = h.goalType === 'amount' && (h.goalAmount ?? 0) > 0;
        const done = isAmount
          ? (rec?.amount ?? 0) >= (h.goalAmount ?? 1)
          : !!rec?.completed;
        return {
          id: h.id,
          name: h.name,
          emoji: h.emoji || '✨',
          color: h.color || '#3c78f0',
          done,
          streak: h.currentStreak || 0,
          progress: isAmount ? `${rec?.amount ?? 0} / ${h.goalAmount} ${h.goalUnit || ''}`.trim() : '',
        };
      });

      const doneCount = habits.filter((h) => h.done).length;
      const payload = JSON.stringify({
        today: {
          done: doneCount,
          total: due.length,
          label: format(today, 'EEEE, MMM d'),
        },
        habits,
        lastUpdated: today.toISOString(),
      });
      await Preferences.set({ key: WIDGET_HABITS_KEY, value: payload });
      // Also mirror to the iOS App Group so the WidgetKit extension can
      // read the same payload via UserDefaults(suiteName:). No-op on Android.
      if (Capacitor.getPlatform() === 'ios') {
        try {
          await Preferences.configure({ group: 'group.com.flowist.app.shareextension' });
          await Preferences.set({ key: WIDGET_HABITS_KEY, value: payload });
        } catch {}
        try {
          await Preferences.configure({ group: 'NativeStorage' });
        } catch {}
      }
      this.notifyWidgetUpdate('habits');
    } catch (error) {
      console.error('[WidgetSync] Habits sync error:', error);
    }
  }

  /**
   * Save widget configuration
   */
  async saveWidgetConfig(configs: WidgetConfig[]): Promise<void> {
    await setSetting('widget_configs', configs);
    await Preferences.set({
      key: WIDGET_CONFIG_KEY,
      value: JSON.stringify(configs),
    });
    console.log('[WidgetSync] Widget config saved');
  }

  /**
   * Get widget configurations
   */
  async getWidgetConfigs(): Promise<WidgetConfig[]> {
    return await getSetting<WidgetConfig[]>('widget_configs', []);
  }

  /**
   * Sync a specific note for a widget
   */
  async syncSpecificNote(noteId: string): Promise<void> {
    try {
      const note = await loadNoteFromDB(noteId);
      
      if (note) {
        const noteData: NoteWidgetData = {
          id: note.id,
          title: note.title || 'Untitled',
          content: getTextPreviewFromHtml(note.content, 500),
          type: note.type,
          color: note.color,
          lastUpdated: new Date(note.updatedAt).toISOString(),
        };

        await Preferences.set({
          key: `${WIDGET_PREFS_PREFIX}note_${noteId}`,
          value: JSON.stringify(noteData),
        });

        this.notifyWidgetUpdate('specific_note');
      }
    } catch (error) {
      console.error('[WidgetSync] Specific note sync error:', error);
    }
  }

  /**
   * Notify native widgets to refresh (Android AppWidgetManager)
   */
  private notifyWidgetUpdate(type: string): void {
    // Dispatch event that can be caught by native bridge if needed
    window.dispatchEvent(new CustomEvent('widgetDataUpdated', {
      detail: { type, timestamp: Date.now() }
    }));
  }

  /**
   * Strip HTML tags from content
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }
}

export const widgetDataSync = WidgetDataSyncManager.getInstance();

/**
 * Available widget types for settings UI
 */
export const WIDGET_TYPES: { type: WidgetType; label: string; icon: string; description: string }[] = [
  { type: 'specific_note', label: 'Notes Widget', icon: '📝', description: 'Display any note you created on home screen' },
  { type: 'section_tasks', label: 'Section Tasks', icon: '📋', description: 'Show all tasks from a section with checkboxes' },
];
