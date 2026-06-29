import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { toast as sonnerToast } from 'sonner';
import { Upload, CheckCircle2, FileText, ListTodo, FolderOpen, Paperclip, AlertTriangle, ArrowLeft, Download } from 'lucide-react';
import {
  ImportSource,
  importFromFile,
  getAcceptedFileTypes,
  ImportResult,
  ImportProgress,
  CsvColumnMap,
  parseCSVHeaders,
  autoDetectColumnMap,
} from '@/utils/importData';
import { loadNotesFromDB, saveNotesToDB, bulkPutNotesInDB } from '@/utils/noteStorage';
import { loadTodoItems, saveTodoItems } from '@/utils/todoItemsStorage';
import { bulkPutTasksInWorker } from '@/utils/taskStorage';
import { getSetting, setSetting } from '@/utils/settingsStorage';
import { loadFolders as loadTaskFolders, saveFolders as saveTaskFolders, type Folder as TaskFolder } from '@/utils/folderStorage';
import type { Folder as NotesFolder } from '@/types/note';
import { cn } from '@/lib/utils';

interface ImportDataSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const sources: { id: ImportSource; name: string; description: string; formats: string }[] = [
  { id: 'evernote', name: 'Evernote', description: 'Notebooks → folders. Notes with tags, dates & images/PDFs', formats: 'ENEX, HTML' },
  { id: 'todoist', name: 'Todoist', description: 'Tasks & sections from a Todoist CSV or REST/JSON backup', formats: 'CSV, JSON' },
  { id: 'ticktick', name: 'TickTick', description: 'Import tasks & lists from TickTick CSV backup', formats: 'CSV' },
  { id: 'notion', name: 'Notion', description: 'Database CSV/JSON exports or per-page Markdown', formats: 'CSV, JSON, MD' },
  { id: 'json', name: 'JSON', description: 'Generic JSON: array of items or { tasks, notes, folders }', formats: 'JSON' },
  { id: 'csv-tasks', name: 'CSV — Tasks', description: 'Generic CSV with column mapping', formats: 'CSV' },
  { id: 'csv-notes', name: 'CSV — Notes', description: 'Generic CSV with column mapping', formats: 'CSV' },
];

const NONE = '__none__';

// Escape a single CSV cell per RFC 4180.
const csvCell = (v: unknown): string => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const downloadPreviewCsv = (
  taskRows: { text: string; folder: string; status: string; priority: string; due: string; depth: number }[],
  noteRows: { title: string; folder: string; status: string; priority: string; due: string }[],
  fileName: string,
) => {
  const header = ['kind', 'row', 'title', 'folder', 'status', 'priority', 'due', 'depth'];
  const lines: string[] = [header.join(',')];
  taskRows.forEach((r, i) => {
    lines.push([
      'task', i + 1, r.text, r.folder, r.status, r.priority, r.due, r.depth,
    ].map(csvCell).join(','));
  });
  noteRows.forEach((r, i) => {
    lines.push([
      'note', i + 1, r.title, r.folder, r.status, r.priority, r.due, '',
    ].map(csvCell).join(','));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const base = (fileName || 'import').replace(/\.[^.]+$/, '');
  a.href = url;
  a.download = `${base}-preview-mapping.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Field labels for the column mapping UI per CSV kind.
const taskFields: { key: keyof CsvColumnMap; label: string; required?: boolean }[] = [
  { key: 'title', label: 'Title', required: true },
  { key: 'status', label: 'Status / Done' },
  { key: 'priority', label: 'Priority' },
  { key: 'dueDate', label: 'Due date' },
  { key: 'tags', label: 'Tags' },
  { key: 'description', label: 'Description / Content' },
];
const noteFields: { key: keyof CsvColumnMap; label: string; required?: boolean }[] = [
  { key: 'title', label: 'Title', required: true },
  { key: 'content', label: 'Content / Body' },
  { key: 'tags', label: 'Tags' },
  { key: 'created', label: 'Created at' },
];

export const ImportDataSheet = ({ isOpen, onClose }: ImportDataSheetProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedSource, setSelectedSource] = useState<ImportSource | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);

  // CSV mapping state
  const [csvText, setCsvText] = useState<string>('');
  const [csvFileName, setCsvFileName] = useState<string>('');
  const [csvHeaders, setCsvHeaders] = useState<string[] | null>(null);
  const [columnMap, setColumnMap] = useState<CsvColumnMap>({});

  // Preview state — populated after parsing, before committing to storage.
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [pendingText, setPendingText] = useState<string>('');
  const [pendingFileName, setPendingFileName] = useState<string>('');
  const [pendingColumnMap, setPendingColumnMap] = useState<CsvColumnMap | undefined>(undefined);

  const reset = () => {
    setSelectedSource(null);
    setResult(null);
    setProgress(null);
    setCsvText('');
    setCsvFileName('');
    setCsvHeaders(null);
    setColumnMap({});
    setPreview(null);
    setPendingText('');
    setPendingFileName('');
    setPendingColumnMap(undefined);
  };

  const handleSourceSelect = (source: ImportSource) => {
    setSelectedSource(source);
    setResult(null);
    setProgress(null);
    setCsvHeaders(null);
    setCsvText('');
    setColumnMap({});
    setPreview(null);
  };

  const handleFileSelect = () => {
    if (!selectedSource || !fileInputRef.current) return;
    fileInputRef.current.accept = getAcceptedFileTypes(selectedSource);
    fileInputRef.current.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedSource) return;

    const text = await file.text();
    if (fileInputRef.current) fileInputRef.current.value = '';

    // For generic CSV sources, show the column-mapping step first.
    if (selectedSource === 'csv-tasks' || selectedSource === 'csv-notes') {
      const headers = parseCSVHeaders(text);
      if (headers.length === 0) {
        toast({ title: t('settings.importFailed', 'Import failed'), description: 'No columns found in CSV', variant: 'destructive' });
        return;
      }
      setCsvText(text);
      setCsvFileName(file.name);
      setCsvHeaders(headers);
      setColumnMap(autoDetectColumnMap(headers, selectedSource === 'csv-tasks' ? 'tasks' : 'notes'));
      return;
    }

    await runImport(text, file.name);
  };

  // Step 1: parse the file (no writes) and surface a preview the user must confirm.
  const runImport = async (text: string, fileName: string, columnMapArg?: CsvColumnMap) => {
    if (!selectedSource) return;
    setIsImporting(true);
    setProgress({ phase: 'parsing', current: 0, total: 0 });

    try {
      const fileType = fileName.split('.').pop()?.toLowerCase() || '';
      const importResult = await importFromFile(text, selectedSource, fileType, fileName, {
        columnMap: columnMapArg,
        onProgress: (p) => setProgress(p),
      });

      if (!importResult.success) {
        toast({ title: t('settings.importFailed', 'Import failed'), description: importResult.error, variant: 'destructive' });
        setIsImporting(false);
        setProgress(null);
        return;
      }

      // Stash everything needed for the actual commit and show the preview screen.
      setPendingText(text);
      setPendingFileName(fileName);
      setPendingColumnMap(columnMapArg);
      setPreview(importResult);
      setProgress(null);
    } catch (e) {
      sonnerToast.error(t('settings.importFailed', 'Import failed'), {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setIsImporting(false);
    }
  };

  // Step 2: persist the previewed result. Re-runs the parser for fresh IDs / attachments.
  const commitImport = async () => {
    if (!selectedSource || !preview) return;
    setIsImporting(true);
    setProgress({ phase: 'saving', current: 0, total: 0 });

    try {
      const fileType = pendingFileName.split('.').pop()?.toLowerCase() || '';
      const importResult = await importFromFile(pendingText, selectedSource, fileType, pendingFileName, {
        columnMap: pendingColumnMap,
        onProgress: (p) => setProgress(p),
      });

      if (!importResult.success) {
        toast({ title: t('settings.importFailed', 'Import failed'), description: importResult.error, variant: 'destructive' });
        setIsImporting(false);
        setProgress(null);
        return;
      }

      // Resolve a dedicated destination folder so imported items never land in Inbox.
      const sourceLabel = sources.find(s => s.id === selectedSource)?.name || 'Import';
      const importFolderName = `Imported from ${sourceLabel}`;
      const nowIso = new Date();

      // ── Notes folders (Index.tsx reads from setting 'folders') ──
      const existingNoteFolders = (await getSetting<NotesFolder[]>('folders', [])) || [];
      let noteFolders = [...existingNoteFolders];
      let noteImportFolderId: string | undefined;
      if (importResult.folders && importResult.folders.length > 0) {
        noteFolders = [...noteFolders, ...importResult.folders];
      } else if (importResult.notes.length > 0) {
        const id = (crypto as any).randomUUID ? crypto.randomUUID() : `imp-notes-${Date.now()}`;
        noteImportFolderId = id;
        noteFolders.push({
          id, name: importFolderName, color: '#3b82f6', icon: 'Folder',
        } as NotesFolder);
      }
      if (noteFolders.length !== existingNoteFolders.length) {
        await setSetting('folders', noteFolders);
        window.dispatchEvent(new Event('foldersUpdated'));
      }

      // ── Task folders (folderStorage 'nota_folders') ──
      let taskImportFolderId: string | undefined;
      if (importResult.tasks.length > 0) {
        const existingTaskFolders = await loadTaskFolders();
        const id = (crypto as any).randomUUID ? crypto.randomUUID() : `imp-tasks-${Date.now()}`;
        taskImportFolderId = id;
        await saveTaskFolders([
          ...existingTaskFolders,
          { id, name: importFolderName, color: '#3b82f6', icon: 'Folder', type: 'tasks', createdAt: nowIso, updatedAt: nowIso } as TaskFolder,
        ]);
      }

      if (importResult.tasks.length > 0) {
        const tagged = importResult.tasks.map(t => ({
          ...t,
          folderId: t.folderId || taskImportFolderId,
        }));
        // Worker-backed chunked insert — keeps the UI alive at 10k+ items.
        await bulkPutTasksInWorker(tagged);
        window.dispatchEvent(new Event('tasksUpdated'));
      }
      if (importResult.notes.length > 0) {
        const tagged = importResult.notes.map(n => ({
          ...n,
          folderId: n.folderId || noteImportFolderId,
        }));
        // Chunked bulk put — does NOT re-serialise the existing store.
        await bulkPutNotesInDB(tagged as any);
        window.dispatchEvent(new Event('notesUpdated'));
      }

      setResult(importResult);
      setPreview(null);
      const s = importResult.stats;
      const imported = (s.tasks || 0) + (s.notes || 0);
      const skipped = s.failed || 0;
      const errored = importResult.errors?.length || 0;
      const parts = [
        s.tasks ? `${s.tasks} tasks` : null,
        s.notes ? `${s.notes} notes` : null,
        s.folders ? `${s.folders} folders` : null,
        s.attachments ? `${s.attachments} attachments` : null,
      ].filter(Boolean).join(' · ');
      sonnerToast.success(
        `Imported ${imported} item${imported === 1 ? '' : 's'}`,
        {
          description: [
            parts || 'No items found',
            skipped ? `${skipped} skipped` : null,
            errored && errored !== skipped ? `${errored} error${errored === 1 ? '' : 's'}` : null,
          ].filter(Boolean).join(' • '),
          duration: 6000,
        }
      );
    } catch (e) {
      sonnerToast.error(t('settings.importFailed', 'Import failed'), {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleConfirmMapping = async () => {
    if (!csvHeaders) return;
    if (!columnMap.title) {
      toast({ title: 'Mapping required', description: 'Please map a column to "Title".', variant: 'destructive' });
      return;
    }
    await runImport(csvText, csvFileName, columnMap);
  };

  const fields = selectedSource === 'csv-tasks' ? taskFields : noteFields;
  const showMapping = csvHeaders !== null && !result && !isImporting && !preview;
  const showProgress = isImporting && progress;
  const showPreview = preview !== null && !isImporting && !result;

  const progressPct = progress && progress.total > 0
    ? Math.min(100, Math.round((progress.current / progress.total) * 100))
    : 0;

  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle>{t('settings.importData', 'Import Data')}</SheetTitle>
        </SheetHeader>

        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />

        {/* ── Progress view ── */}
        {showProgress && (
          <div className="flex flex-col items-center gap-3 py-8">
            <p className="text-sm font-medium text-foreground capitalize">
              {progress.phase === 'attachments' ? 'Saving attachments…' : 'Importing…'}
            </p>
            <Progress value={progressPct} className="w-full" />
            <p className="text-xs text-muted-foreground">
              {progress.total > 0
                ? `${progress.current} / ${progress.total}${progress.message ? ` · ${progress.message}` : ''}`
                : 'Preparing…'}
            </p>
          </div>
        )}

        {/* ── Result view ── */}
        {result && !isImporting && (
          <div className="flex flex-col items-center gap-4 py-6">
            <CheckCircle2 className="h-12 w-12 text-primary" />
            <p className="text-lg font-semibold text-foreground">
              {t('settings.importComplete', 'Import Complete!')}
            </p>
            <div className="flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
              {result.stats.tasks > 0 && (
                <div className="flex items-center gap-1.5">
                  <ListTodo className="h-4 w-4" />
                  <span>{result.stats.tasks} {t('common.tasks', 'tasks')}</span>
                </div>
              )}
              {result.stats.notes > 0 && (
                <div className="flex items-center gap-1.5">
                  <FileText className="h-4 w-4" />
                  <span>{result.stats.notes} {t('common.notes', 'notes')}</span>
                </div>
              )}
              {(result.folders?.length || 0) > 0 && (
                <div className="flex items-center gap-1.5">
                  <FolderOpen className="h-4 w-4" />
                  <span>{result.folders!.length} {t('common.folders', 'folders')}</span>
                </div>
              )}
              {(result.stats.attachments || 0) > 0 && (
                <div className="flex items-center gap-1.5">
                  <Paperclip className="h-4 w-4" />
                  <span>{result.stats.attachments} attachments</span>
                </div>
              )}
              {(result.stats.failed || 0) > 0 && (
                <div className="flex items-center gap-1.5 text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <span>{result.stats.failed} skipped</span>
                </div>
              )}
            </div>

            {result.errors && result.errors.length > 0 && (
              <details className="w-full mt-2 rounded-lg border border-border bg-muted/30 p-3">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                  Show {result.errors.length} skipped row{result.errors.length === 1 ? '' : 's'}
                </summary>
                <ul className="mt-2 max-h-40 overflow-y-auto space-y-1 text-xs text-muted-foreground">
                  {result.errors.slice(0, 100).map((err, i) => (
                    <li key={i} className="font-mono">• {err}</li>
                  ))}
                  {result.errors.length > 100 && (
                    <li className="italic">…and {result.errors.length - 100} more</li>
                  )}
                </ul>
              </details>
            )}

            <Button onClick={handleClose} className="mt-2">
              {t('common.done', 'Done')}
            </Button>
          </div>
        )}

        {/* ── CSV Column Mapping view ── */}
        {showMapping && (
          <div className="space-y-4 pb-6">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => { setCsvHeaders(null); setCsvText(''); }}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <p className="font-medium text-foreground truncate">{csvFileName}</p>
                <p className="text-xs text-muted-foreground">
                  Map your CSV columns to fields below.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {fields.map(({ key, label, required }) => (
                <div key={key} className="flex items-center gap-3">
                  <label className="text-sm text-foreground w-32 shrink-0">
                    {label}
                    {required && <span className="text-destructive ml-0.5">*</span>}
                  </label>
                  <Select
                    value={columnMap[key] || NONE}
                    onValueChange={(v) =>
                      setColumnMap(m => ({ ...m, [key]: v === NONE ? undefined : v }))
                    }
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="— Not mapped —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— Not mapped —</SelectItem>
                      {csvHeaders!.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <Button onClick={handleConfirmMapping} className="w-full mt-2 gap-2" size="lg">
              <Upload className="h-4 w-4" />
              Import {csvHeaders!.length > 0 ? `(${csvHeaders!.length} columns)` : ''}
            </Button>
          </div>
        )}

        {/* ── Pre-import Preview view ── */}
        {showPreview && preview && (() => {
          const sourceLabel = sources.find(s => s.id === selectedSource)?.name || 'Import';
          const importFolderName = `Imported from ${sourceLabel}`;
          const folderNameById = new Map<string, string>();
          (preview.folders || []).forEach(f => folderNameById.set(f.id, f.name));

          // Flatten nested subtasks so the preview shows the full tree.
          type Row = { text: string; folder: string; status: string; priority: string; due: string; depth: number };
          const taskRows: Row[] = [];
          const walk = (tasks: any[], depth: number) => {
            for (const t of tasks) {
              taskRows.push({
                text: t.text || '(untitled)',
                folder: (t.folderId && folderNameById.get(t.folderId)) || importFolderName,
                status: t.completed ? 'Completed' : 'Open',
                priority: t.priority || 'none',
                due: t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—',
                depth,
              });
              if (t.subtasks?.length) walk(t.subtasks, depth + 1);
            }
          };
          walk(preview.tasks, 0);

          const noteRows = preview.notes.map(n => {
            const status = n.isDeleted ? 'Deleted' : n.isArchived ? 'Archived' : n.isPinned ? 'Pinned' : 'Active';
            const due = n.reminderEnabled && n.reminderTime
              ? new Date(n.reminderTime as any).toLocaleDateString()
              : '—';
            return {
              title: n.title || '(untitled)',
              folder: (n.folderId && folderNameById.get(n.folderId)) || importFolderName,
              status,
              priority: 'none',
              due,
            };
          });

          const MAX = 50;

          return (
            <div className="space-y-4 pb-6">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => { setPreview(null); setPendingText(''); }}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">Preview: {pendingFileName}</p>
                  <p className="text-xs text-muted-foreground">
                    Review how items will be mapped before importing.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {preview.stats.tasks > 0 && <span className="flex items-center gap-1"><ListTodo className="h-3.5 w-3.5" />{preview.stats.tasks} tasks</span>}
                {preview.stats.notes > 0 && <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" />{preview.stats.notes} notes</span>}
                {(preview.folders?.length || 0) > 0 && <span className="flex items-center gap-1"><FolderOpen className="h-3.5 w-3.5" />{preview.folders!.length} folders</span>}
                {(preview.stats.failed || 0) > 0 && <span className="flex items-center gap-1 text-destructive"><AlertTriangle className="h-3.5 w-3.5" />{preview.stats.failed} skipped</span>}
              </div>

              {preview.warnings && preview.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-1">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {preview.warnings.length} warning{preview.warnings.length === 1 ? '' : 's'}
                  </p>
                  <ul className="text-xs text-amber-800 dark:text-amber-200/90 space-y-0.5 ml-5 list-disc">
                    {preview.warnings.slice(0, 8).map((w, i) => <li key={i}>{w}</li>)}
                    {preview.warnings.length > 8 && <li className="italic">…and {preview.warnings.length - 8} more</li>}
                  </ul>
                </div>
              )}

              {taskRows.length > 0 && (
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="px-3 py-2 bg-muted/40 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <ListTodo className="h-3.5 w-3.5" /> Tasks ({taskRows.length})
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-border">
                    {taskRows.slice(0, MAX).map((r, i) => (
                      <div key={i} className="px-3 py-2 text-xs">
                        <p className="font-medium text-foreground truncate" style={{ paddingLeft: r.depth * 12 }}>
                          {r.depth > 0 && <span className="text-muted-foreground mr-1">↳</span>}{r.text}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                          <span>📁 {r.folder}</span>
                          <span>● {r.status}</span>
                          <span>⚑ {r.priority}</span>
                          <span>📅 {r.due}</span>
                        </div>
                      </div>
                    ))}
                    {taskRows.length > MAX && (
                      <div className="px-3 py-2 text-xs italic text-muted-foreground">
                        …and {taskRows.length - MAX} more tasks
                      </div>
                    )}
                  </div>
                </div>
              )}

              {noteRows.length > 0 && (
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="px-3 py-2 bg-muted/40 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" /> Notes ({noteRows.length})
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y divide-border">
                    {noteRows.slice(0, MAX).map((r, i) => (
                      <div key={i} className="px-3 py-2 text-xs">
                        <p className="font-medium text-foreground truncate">{r.title}</p>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                          <span>📁 {r.folder}</span>
                          <span>● {r.status}</span>
                          <span>⚑ {r.priority}</span>
                          <span>📅 {r.due}</span>
                        </div>
                      </div>
                    ))}
                    {noteRows.length > MAX && (
                      <div className="px-3 py-2 text-xs italic text-muted-foreground">
                        …and {noteRows.length - MAX} more notes
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setPreview(null); setPendingText(''); }} className="flex-1">
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  onClick={() => downloadPreviewCsv(taskRows, noteRows, pendingFileName)}
                  className="gap-2"
                  title="Download mapping as CSV"
                >
                  <Download className="h-4 w-4" />
                  CSV
                </Button>
                <Button onClick={commitImport} className="flex-1 gap-2">
                  <Upload className="h-4 w-4" />
                  Confirm Import
                </Button>
              </div>
            </div>
          );
        })()}

        {/* ── Source picker ── */}
        {!result && !isImporting && !showMapping && !showPreview && (
          <div className="space-y-3 pb-6">
            <p className="text-sm text-muted-foreground mb-4">
              {t('settings.importDescription', 'Select a source to import your tasks and notes from another app.')}
            </p>

            {sources.map((source) => (
              <button
                key={source.id}
                onClick={() => handleSourceSelect(source.id)}
                className={cn(
                  "w-full flex items-center justify-between gap-3 p-4 rounded-xl border-2 transition-all text-left",
                  selectedSource === source.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/30"
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{source.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{source.description}</p>
                </div>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md shrink-0">{source.formats}</span>
              </button>
            ))}

            {selectedSource && (
              <Button
                onClick={handleFileSelect}
                disabled={isImporting}
                className="w-full mt-4 gap-2"
                size="lg"
              >
                <Upload className="h-4 w-4" />
                {t('settings.selectFile', 'Select File')}
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
