// Import parsers for Todoist, Notion, Evernote, and generic CSV exports.
// Converts external formats into app-native TodoItem and Note types.
// Evernote ENEX imports preserve notebook structure as folders and migrate
// inline image / PDF resources into IndexedDB-backed attachments.

import { TodoItem, Note, Priority, Folder, TaskAttachment } from '@/types/note';
import { saveTaskMedia } from '@/utils/taskMediaStorage';

export type ImportSource = 'todoist' | 'ticktick' | 'notion' | 'evernote' | 'csv-tasks' | 'csv-notes' | 'json';

export interface ImportProgress {
  phase: 'parsing' | 'attachments' | 'saving' | 'done';
  current: number;
  total: number;
  message?: string;
}

export interface ImportResult {
  success: boolean;
  tasks: TodoItem[];
  notes: Note[];
  /** Folders detected in the import (e.g. Evernote notebooks). Optional. */
  folders?: Folder[];
  error?: string;
  stats: {
    tasks: number;
    notes: number;
    folders?: number;
    attachments?: number;
    failed?: number;
  };
  /** Human-readable failure messages (per-row / per-resource). */
  errors?: string[];
}

/** Column-mapping for generic CSV imports. Each value is the source column name. */
export interface CsvColumnMap {
  title?: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  tags?: string;
  content?: string;
  description?: string;
  created?: string;
}

const generateId = () => `imported-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

// ─── CSV Parser ────────────────────────────────────────────
const parseCSV = (text: string): Record<string, string>[] => {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h.trim()] = (values[i] || '').trim(); });
    return row;
  });
};

const parseCSVLine = (line: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
};

/** Read just the header row from a CSV text — used to drive column mapping UI. */
export const parseCSVHeaders = (text: string): string[] => {
  const firstLine = text.split('\n')[0]?.trim() || '';
  return parseCSVLine(firstLine).map(h => h.trim()).filter(Boolean);
};

/** Best-effort auto-detection of column names → map fields. */
export const autoDetectColumnMap = (headers: string[], kind: 'tasks' | 'notes'): CsvColumnMap => {
  const lower = headers.map(h => h.toLowerCase());
  const find = (...candidates: string[]) => {
    for (const c of candidates) {
      const idx = lower.findIndex(h => h === c);
      if (idx >= 0) return headers[idx];
    }
    for (const c of candidates) {
      const idx = lower.findIndex(h => h.includes(c));
      if (idx >= 0) return headers[idx];
    }
    return undefined;
  };

  if (kind === 'tasks') {
    return {
      title: find('title', 'name', 'task', 'text', 'content', 'subject'),
      status: find('status', 'done', 'completed', 'checkbox', 'state'),
      priority: find('priority', 'importance'),
      dueDate: find('due', 'due date', 'deadline', 'date'),
      tags: find('tags', 'labels', 'categories'),
      description: find('description', 'notes', 'details', 'body'),
      created: find('created', 'created at', 'date created'),
    };
  }
  return {
    title: find('title', 'name', 'subject', 'heading'),
    content: find('content', 'body', 'notes', 'description', 'text'),
    tags: find('tags', 'labels', 'categories'),
    created: find('created', 'created at', 'date created'),
  };
};

// ─── Todoist CSV Import ────────────────────────────────────
const parseTodoistCSV = (text: string): ImportResult => {
  try {
    const rows = parseCSV(text);
    if (rows.length === 0) return { success: false, tasks: [], notes: [], error: 'No data found in CSV', stats: { tasks: 0, notes: 0 } };

    const tasks: TodoItem[] = [];
    let failed = 0;
    const errors: string[] = [];

    for (const row of rows) {
      try {
        const type = row['TYPE'] || row['type'] || '';
        const content = row['CONTENT'] || row['content'] || '';
        if (!content || type === 'section') continue;

        const priorityMap: Record<string, Priority> = { '1': 'none', '2': 'low', '3': 'medium', '4': 'high' };
        const rawPriority = row['PRIORITY'] || row['priority'] || '1';

        tasks.push({
          id: generateId(),
          text: content,
          completed: false,
          priority: priorityMap[rawPriority] || 'none',
          description: row['DESCRIPTION'] || row['description'] || undefined,
          dueDate: (row['DATE'] || row['date']) ? new Date(row['DATE'] || row['date']) : undefined,
          createdAt: new Date(),
          modifiedAt: new Date(),
        });
      } catch (e) {
        failed++;
        errors.push(`Row skipped: ${e instanceof Error ? e.message : 'unknown'}`);
      }
    }

    return { success: true, tasks, notes: [], stats: { tasks: tasks.length, notes: 0, failed }, errors: errors.length ? errors : undefined };
  } catch (e) {
    return { success: false, tasks: [], notes: [], error: `Todoist parse error: ${e instanceof Error ? e.message : 'Unknown'}`, stats: { tasks: 0, notes: 0 } };
  }
};

// ─── Notion CSV/JSON Import ────────────────────────────────
const parseNotionCSV = (text: string): ImportResult => {
  try {
    const rows = parseCSV(text);
    if (rows.length === 0) return { success: false, tasks: [], notes: [], error: 'No data found', stats: { tasks: 0, notes: 0 } };

    const tasks: TodoItem[] = [];
    const notes: Note[] = [];
    const lcRows = rows.map(r => {
      const o: Record<string, string> = {};
      Object.keys(r).forEach(k => { o[k.toLowerCase()] = r[k]; });
      return o;
    });

    const headers = Object.keys(lcRows[0]);
    const hasStatus = headers.some(h => ['status', 'done', 'completed', 'checkbox'].includes(h));
    const hasName = headers.some(h => ['name', 'title', 'task', 'to-do', 'todo'].includes(h));

    for (const row of lcRows) {
      const title = row['name'] || row['title'] || row['task'] || row['to-do'] || row['todo'] || Object.values(row)[0] || '';
      if (!title) continue;

      if (hasStatus || hasName) {
        const isDone = ['true', 'yes', 'done', 'completed', '1', 'x'].includes(
          (row['status'] || row['done'] || row['completed'] || row['checkbox'] || '').toLowerCase()
        );

        const priorityVal = (row['priority'] || '').toLowerCase();
        let priority: Priority = 'none';
        if (priorityVal.includes('high') || priorityVal.includes('urgent')) priority = 'high';
        else if (priorityVal.includes('medium') || priorityVal.includes('mid')) priority = 'medium';
        else if (priorityVal.includes('low')) priority = 'low';

        tasks.push({
          id: generateId(),
          text: title,
          completed: isDone,
          priority,
          description: row['notes'] || row['description'] || row['details'] || undefined,
          dueDate: row['due'] || row['due date'] || row['date'] ? new Date(row['due'] || row['due date'] || row['date']) : undefined,
          tags: row['tags'] ? row['tags'].split(',').map(t => t.trim()).filter(Boolean) : undefined,
          createdAt: row['created'] ? new Date(row['created']) : new Date(),
          modifiedAt: new Date(),
        });
      } else {
        notes.push({
          id: generateId(),
          type: 'regular',
          title,
          content: row['content'] || row['body'] || row['notes'] || '',
          voiceRecordings: [],
          createdAt: row['created'] ? new Date(row['created']) : new Date(),
          updatedAt: new Date(),
        });
      }
    }

    return { success: true, tasks, notes, stats: { tasks: tasks.length, notes: notes.length } };
  } catch (e) {
    return { success: false, tasks: [], notes: [], error: `Notion parse error: ${e instanceof Error ? e.message : 'Unknown'}`, stats: { tasks: 0, notes: 0 } };
  }
};

const parseNotionJSON = (text: string): ImportResult => {
  try {
    const data = JSON.parse(text);
    const items = Array.isArray(data) ? data : data.results || data.pages || [data];
    const tasks: TodoItem[] = [];
    const notes: Note[] = [];

    for (const item of items) {
      const props = item.properties || item;
      const title = extractNotionTitle(props);
      if (!title) continue;

      const hasCheckbox = Object.values(props).some((v: any) => v?.type === 'checkbox' || v?.checkbox !== undefined);

      if (hasCheckbox) {
        const checkboxProp = Object.values(props).find((v: any) => v?.type === 'checkbox' || v?.checkbox !== undefined) as any;
        tasks.push({
          id: generateId(),
          text: title,
          completed: checkboxProp?.checkbox || false,
          priority: 'none',
          createdAt: item.created_time ? new Date(item.created_time) : new Date(),
          modifiedAt: new Date(),
        });
      } else {
        notes.push({
          id: generateId(),
          type: 'regular',
          title,
          content: '',
          voiceRecordings: [],
          createdAt: item.created_time ? new Date(item.created_time) : new Date(),
          updatedAt: new Date(),
        });
      }
    }

    return { success: true, tasks, notes, stats: { tasks: tasks.length, notes: notes.length } };
  } catch (e) {
    return { success: false, tasks: [], notes: [], error: `Notion JSON parse error: ${e instanceof Error ? e.message : 'Unknown'}`, stats: { tasks: 0, notes: 0 } };
  }
};

const extractNotionTitle = (props: any): string => {
  for (const val of Object.values(props)) {
    const v = val as any;
    if (v?.type === 'title' && Array.isArray(v.title)) {
      return v.title.map((t: any) => t.plain_text || t.text?.content || '').join('');
    }
    if (typeof v === 'string') return v;
  }
  return props.name || props.title || props.Name || props.Title || '';
};

// ─── Evernote ENEX/HTML Import ──────────────────────────────
// ENEX exports are per-notebook; the file name is treated as the notebook
// name. <resource> blocks containing images/PDFs are decoded and saved to
// IndexedDB as TaskAttachments, then inline <en-media> placeholders are
// rewritten to <img>/<a> tags so RichTextEditor can render them.
const parseEvernoteExport = async (
  text: string,
  fileName?: string,
  onProgress?: (p: ImportProgress) => void,
): Promise<ImportResult> => {
  try {
    const notes: Note[] = [];
    const folders: Folder[] = [];
    const errors: string[] = [];
    let attachmentCount = 0;
    let failedCount = 0;

    const notebookName = fileName
      ? fileName.replace(/\.(enex|html?|xml)$/i, '').trim() || 'Evernote'
      : 'Evernote';

    let notebookFolder: Folder | null = null;
    const ensureFolder = (): Folder => {
      if (notebookFolder) return notebookFolder;
      notebookFolder = {
        id: generateId(),
        name: notebookName,
        isDefault: false,
        createdAt: new Date(),
      };
      folders.push(notebookFolder);
      return notebookFolder;
    };

    if (text.includes('<en-export') || text.includes('<note>')) {
      const noteMatches = text.match(/<note>([\s\S]*?)<\/note>/g) || [];
      const total = noteMatches.length;
      onProgress?.({ phase: 'parsing', current: 0, total });

      for (let i = 0; i < noteMatches.length; i++) {
        const noteXml = noteMatches[i];
        try {
          const title = (noteXml.match(/<title>([\s\S]*?)<\/title>/)?.[1] || 'Untitled').trim();
          const contentMatch = noteXml.match(/<content>([\s\S]*?)<\/content>/)?.[1] || '';
          const createdMatch = noteXml.match(/<created>([\s\S]*?)<\/created>/)?.[1];
          const tagMatches = [...noteXml.matchAll(/<tag>([\s\S]*?)<\/tag>/g)]
            .map(m => m[1].trim())
            .filter(Boolean);

          // ── Resources (attachments) ──
          const resourceMatches = [...noteXml.matchAll(/<resource>([\s\S]*?)<\/resource>/g)];
          const noteAttachments: TaskAttachment[] = [];
          const resourceData: { mime: string; name: string; dataUrl: string; isImage: boolean }[] = [];

          for (let r = 0; r < resourceMatches.length; r++) {
            const block = resourceMatches[r][1];
            const mime = (block.match(/<mime>([\s\S]*?)<\/mime>/)?.[1] || 'application/octet-stream').trim();
            const fname = (block.match(/<file-name>([\s\S]*?)<\/file-name>/)?.[1]
              || `attachment-${i + 1}-${r + 1}`).trim();
            const dataRaw = (block.match(/<data[^>]*>([\s\S]*?)<\/data>/)?.[1] || '').replace(/\s+/g, '');

            if (!dataRaw) {
              failedCount++;
              errors.push(`"${title}": attachment "${fname}" had no data`);
              continue;
            }

            const isImage = mime.startsWith('image/');
            const isPdf = mime === 'application/pdf';
            if (!isImage && !isPdf) {
              // Unsupported media type — record but don't fail the note.
              failedCount++;
              errors.push(`"${title}": skipped unsupported attachment (${mime})`);
              continue;
            }

            try {
              const dataUrl = `data:${mime};base64,${dataRaw}`;
              const id = generateId();
              const size = Math.floor(dataRaw.length * 0.75);
              const kind: 'image' | 'file' = isImage ? 'image' : 'file';
              onProgress?.({ phase: 'attachments', current: attachmentCount, total, message: fname });
              await saveTaskMedia(kind, id, dataUrl);
              noteAttachments.push({ id, name: fname, type: mime, size, ref: `idb:${kind}:${id}` });
              resourceData.push({ mime, name: fname, dataUrl, isImage });
              attachmentCount++;
            } catch (err) {
              failedCount++;
              errors.push(`"${title}": failed to save "${fname}"`);
            }
          }

          // Unwrap CDATA/ENML wrappers
          let inner = contentMatch
            .replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '')
            .replace(/<\?xml[^>]*\?>/g, '')
            .replace(/<!DOCTYPE[^>]*>/g, '')
            .replace(/<\/?en-note[^>]*>/g, '')
            .trim();

          // Replace <en-media> placeholders in order with the matching resource.
          let resIdx = 0;
          inner = inner.replace(/<en-media\b[^>]*\/?>(?:<\/en-media>)?/g, () => {
            if (resIdx >= resourceData.length) return '';
            const r = resourceData[resIdx++];
            if (r.isImage) {
              return `<img src="${r.dataUrl}" alt="${escapeAttr(r.name)}" style="max-width:100%;height:auto;" />`;
            }
            return `<a href="${r.dataUrl}" download="${escapeAttr(r.name)}">${escapeText(r.name)}</a>`;
          });

          // If we have attachments that were never referenced inline, append them.
          for (; resIdx < resourceData.length; resIdx++) {
            const r = resourceData[resIdx];
            inner += r.isImage
              ? `<p><img src="${r.dataUrl}" alt="${escapeAttr(r.name)}" style="max-width:100%;height:auto;" /></p>`
              : `<p><a href="${r.dataUrl}" download="${escapeAttr(r.name)}">${escapeText(r.name)}</a></p>`;
          }

          const createdAt = createdMatch
            ? new Date(createdMatch.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6'))
            : new Date();

          const folder = ensureFolder();
          notes.push({
            id: generateId(),
            type: 'regular',
            title,
            content: inner,
            tags: tagMatches.length ? tagMatches : undefined,
            folderId: folder.id,
            voiceRecordings: [],
            attachments: noteAttachments.length ? noteAttachments : undefined,
            createdAt,
            updatedAt: new Date(),
          } as Note);
        } catch (e) {
          failedCount++;
          errors.push(`Note ${i + 1}: ${e instanceof Error ? e.message : 'parse failed'}`);
        }

        onProgress?.({ phase: 'parsing', current: i + 1, total });
      }
    } else {
      // HTML fallback — single note
      const titleMatch = text.match(/<title>(.*?)<\/title>/i);
      const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      const inner = (bodyMatch?.[1] || text).trim();

      const folder = ensureFolder();
      notes.push({
        id: generateId(),
        type: 'regular',
        title: titleMatch?.[1] || fileName || 'Imported Note',
        content: inner,
        folderId: folder.id,
        voiceRecordings: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Note);
    }

    onProgress?.({ phase: 'done', current: notes.length, total: notes.length });

    return {
      success: true,
      tasks: [],
      notes,
      folders,
      stats: {
        tasks: 0,
        notes: notes.length,
        folders: folders.length,
        attachments: attachmentCount,
        failed: failedCount,
      },
      errors: errors.length ? errors : undefined,
    };
  } catch (e) {
    return {
      success: false, tasks: [], notes: [],
      error: `Evernote parse error: ${e instanceof Error ? e.message : 'Unknown'}`,
      stats: { tasks: 0, notes: 0 },
    };
  }
};

const escapeAttr = (s: string) => s.replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ─── Generic CSV — Tasks ───────────────────────────────────
const parseGenericTasksCSV = (
  text: string,
  columnMap?: CsvColumnMap,
  onProgress?: (p: ImportProgress) => void,
): ImportResult => {
  try {
    const rows = parseCSV(text);
    if (rows.length === 0) return { success: false, tasks: [], notes: [], error: 'No data found in CSV', stats: { tasks: 0, notes: 0 } };

    const headers = Object.keys(rows[0]);
    const map = { ...autoDetectColumnMap(headers, 'tasks'), ...(columnMap || {}) };

    const tasks: TodoItem[] = [];
    const errors: string[] = [];
    let failed = 0;
    onProgress?.({ phase: 'parsing', current: 0, total: rows.length });

    rows.forEach((row, idx) => {
      try {
        const title = (map.title && row[map.title]) || Object.values(row)[0] || '';
        if (!title) { failed++; errors.push(`Row ${idx + 2}: missing title`); return; }

        const statusRaw = (map.status ? row[map.status] : '').toLowerCase();
        const isDone = ['true', 'yes', 'done', 'completed', '1', 'x', 'closed'].includes(statusRaw);

        const priorityVal = (map.priority ? row[map.priority] : '').toLowerCase();
        let priority: Priority = 'none';
        if (priorityVal.includes('high') || priorityVal.includes('urgent') || priorityVal === '4') priority = 'high';
        else if (priorityVal.includes('medium') || priorityVal.includes('mid') || priorityVal === '3') priority = 'medium';
        else if (priorityVal.includes('low') || priorityVal === '2') priority = 'low';

        const dueRaw = map.dueDate ? row[map.dueDate] : '';
        let dueDate: Date | undefined;
        if (dueRaw) {
          const d = new Date(dueRaw);
          if (!isNaN(d.getTime())) dueDate = d;
        }

        const tagsRaw = map.tags ? row[map.tags] : '';
        const description = map.description ? row[map.description] : undefined;

        tasks.push({
          id: generateId(),
          text: title,
          completed: isDone,
          priority,
          description: description || undefined,
          dueDate,
          tags: tagsRaw ? tagsRaw.split(/[,;|]/).map(t => t.trim()).filter(Boolean) : undefined,
          createdAt: map.created && row[map.created] ? new Date(row[map.created]) : new Date(),
          modifiedAt: new Date(),
        });
      } catch (e) {
        failed++;
        errors.push(`Row ${idx + 2}: ${e instanceof Error ? e.message : 'parse error'}`);
      }
      onProgress?.({ phase: 'parsing', current: idx + 1, total: rows.length });
    });

    return {
      success: true, tasks, notes: [],
      stats: { tasks: tasks.length, notes: 0, failed },
      errors: errors.length ? errors : undefined,
    };
  } catch (e) {
    return { success: false, tasks: [], notes: [], error: `CSV parse error: ${e instanceof Error ? e.message : 'Unknown'}`, stats: { tasks: 0, notes: 0 } };
  }
};

// ─── Generic CSV — Notes ───────────────────────────────────
const parseGenericNotesCSV = (
  text: string,
  columnMap?: CsvColumnMap,
  onProgress?: (p: ImportProgress) => void,
): ImportResult => {
  try {
    const rows = parseCSV(text);
    if (rows.length === 0) return { success: false, tasks: [], notes: [], error: 'No data found in CSV', stats: { tasks: 0, notes: 0 } };

    const headers = Object.keys(rows[0]);
    const map = { ...autoDetectColumnMap(headers, 'notes'), ...(columnMap || {}) };

    const notes: Note[] = [];
    const errors: string[] = [];
    let failed = 0;
    onProgress?.({ phase: 'parsing', current: 0, total: rows.length });

    rows.forEach((row, idx) => {
      try {
        const title = (map.title && row[map.title]) || Object.values(row)[0] || '';
        const content = (map.content && row[map.content]) || '';
        if (!title && !content) { failed++; errors.push(`Row ${idx + 2}: missing title & content`); return; }

        const tagsRaw = map.tags ? row[map.tags] : '';

        notes.push({
          id: generateId(),
          type: 'regular',
          title: title || 'Untitled',
          content,
          tags: tagsRaw ? tagsRaw.split(/[,;|]/).map(t => t.trim()).filter(Boolean) : undefined,
          voiceRecordings: [],
          createdAt: map.created && row[map.created] ? new Date(row[map.created]) : new Date(),
          updatedAt: new Date(),
        } as Note);
      } catch (e) {
        failed++;
        errors.push(`Row ${idx + 2}: ${e instanceof Error ? e.message : 'parse error'}`);
      }
      onProgress?.({ phase: 'parsing', current: idx + 1, total: rows.length });
    });

    return {
      success: true, tasks: [], notes,
      stats: { tasks: 0, notes: notes.length, failed },
      errors: errors.length ? errors : undefined,
    };
  } catch (e) {
    return { success: false, tasks: [], notes: [], error: `CSV parse error: ${e instanceof Error ? e.message : 'Unknown'}`, stats: { tasks: 0, notes: 0 } };
  }
};

// ─── Generic JSON Import ───────────────────────────────────
// Accepts:
//   • An array of objects → auto-classified into tasks/notes by field presence
//   • { tasks: [], notes: [], folders: [] } shape (our own backup export shape)
const parseGenericJSON = (
  text: string,
  onProgress?: (p: ImportProgress) => void,
): ImportResult => {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch (e) {
    return { success: false, tasks: [], notes: [], error: `Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}`, stats: { tasks: 0, notes: 0 } };
  }

  const tasks: TodoItem[] = [];
  const notes: Note[] = [];
  const folders: Folder[] = [];
  const errors: string[] = [];
  let failed = 0;

  const pushItem = (item: Record<string, unknown>, idx: number) => {
    try {
      const title = String(item.title ?? item.name ?? item.text ?? '').trim();
      if (!title && !item.content && !item.body) {
        failed++; errors.push(`Item ${idx + 1}: missing title/content`); return;
      }
      // Treat as note if it has a content/body field or explicit type === 'note'
      const isNote = item.type === 'note' || 'content' in item || 'body' in item || 'markdown' in item;
      if (isNote) {
        const now = Date.now();
        notes.push({
          id: String(item.id ?? generateId()),
          title: title || 'Untitled',
          content: String(item.content ?? item.body ?? item.markdown ?? ''),
          type: 'regular',
          createdAt: Number(item.createdAt ?? item.created ?? now) || now,
          updatedAt: Number(item.updatedAt ?? item.updated ?? now) || now,
          tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
          folderId: typeof item.folderId === 'string' ? item.folderId : undefined,
        } as unknown as Note);
      } else {
        tasks.push({
          id: String(item.id ?? generateId()),
          text: title,
          completed: Boolean(item.completed ?? item.done ?? false),
          priority: (item.priority as Priority) || 'none',
          dueDate: item.dueDate ? new Date(String(item.dueDate)) : undefined,
          tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
          createdAt: Number(item.createdAt ?? Date.now()),
        } as unknown as TodoItem);
      }
    } catch (e) {
      failed++;
      errors.push(`Item ${idx + 1}: ${e instanceof Error ? e.message : 'parse error'}`);
    }
  };

  let items: Record<string, unknown>[] = [];
  if (Array.isArray(raw)) {
    items = raw as Record<string, unknown>[];
  } else if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.tasks)) (obj.tasks as Record<string, unknown>[]).forEach((t, i) => pushItem({ ...t, type: 'task' }, i));
    if (Array.isArray(obj.notes)) (obj.notes as Record<string, unknown>[]).forEach((n, i) => pushItem({ ...n, type: 'note' }, i));
    if (Array.isArray(obj.folders)) (obj.folders as Folder[]).forEach(f => { if (f && f.id && f.name) folders.push(f); });
    if (Array.isArray(obj.items)) items = obj.items as Record<string, unknown>[];
  } else {
    return { success: false, tasks: [], notes: [], error: 'JSON must be an array or an object with tasks/notes/items', stats: { tasks: 0, notes: 0 } };
  }

  const total = items.length;
  items.forEach((item, idx) => {
    pushItem(item, idx);
    if (total > 0 && (idx % 25 === 0 || idx === total - 1)) {
      onProgress?.({ phase: 'parsing', current: idx + 1, total });
    }
  });

  return {
    success: true,
    tasks,
    notes,
    folders: folders.length ? folders : undefined,
    stats: { tasks: tasks.length, notes: notes.length, folders: folders.length || undefined, failed },
    errors: errors.length ? errors : undefined,
  };
};

// ─── Main Import Function ──────────────────────────────────
export const importFromFile = async (
  text: string,
  source: ImportSource,
  fileType: string,
  fileName?: string,
  options?: { columnMap?: CsvColumnMap; onProgress?: (p: ImportProgress) => void },
): Promise<ImportResult> => {
  const onProgress = options?.onProgress;
  switch (source) {
    case 'todoist':
      return parseTodoistCSV(text);
    case 'notion':
      return fileType === 'json' ? parseNotionJSON(text) : parseNotionCSV(text);
    case 'evernote':
      return await parseEvernoteExport(text, fileName, onProgress);
    case 'csv-tasks':
      return parseGenericTasksCSV(text, options?.columnMap, onProgress);
    case 'csv-notes':
      return parseGenericNotesCSV(text, options?.columnMap, onProgress);
    case 'json':
      return parseGenericJSON(text, onProgress);
    default:
      return { success: false, tasks: [], notes: [], error: 'Unknown source', stats: { tasks: 0, notes: 0 } };
  }
};

export const getAcceptedFileTypes = (source: ImportSource): string => {
  switch (source) {
    case 'todoist': return '.csv';
    case 'notion': return '.csv,.json';
    case 'evernote': return '.enex,.html,.htm';
    case 'csv-tasks':
    case 'csv-notes': return '.csv';
    case 'json': return '.json';
  }
};

