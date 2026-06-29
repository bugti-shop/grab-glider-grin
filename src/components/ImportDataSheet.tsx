import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { toast as sonnerToast } from 'sonner';
import { Upload, CheckCircle2, FileText, ListTodo, FolderOpen, Paperclip, AlertTriangle, ArrowLeft } from 'lucide-react';
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
import { loadNotesFromDB, saveNotesToDB } from '@/utils/noteStorage';
import { loadTodoItems, saveTodoItems } from '@/utils/todoItemsStorage';
import { getSetting, setSetting } from '@/utils/settingsStorage';
import type { Folder as NotesFolder } from '@/types/note';
import { cn } from '@/lib/utils';

interface ImportDataSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const sources: { id: ImportSource; name: string; description: string; formats: string }[] = [
  { id: 'evernote', name: 'Evernote', description: 'Notebooks → folders. Notes with tags, dates & images/PDFs', formats: 'ENEX, HTML' },
  { id: 'todoist', name: 'Todoist', description: 'Import tasks from Todoist CSV export', formats: 'CSV' },
  { id: 'notion', name: 'Notion', description: 'Import pages & databases from Notion', formats: 'CSV, JSON' },
  { id: 'csv-tasks', name: 'CSV — Tasks', description: 'Generic CSV with column mapping', formats: 'CSV' },
  { id: 'csv-notes', name: 'CSV — Notes', description: 'Generic CSV with column mapping', formats: 'CSV' },
];

const NONE = '__none__';

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

  const reset = () => {
    setSelectedSource(null);
    setResult(null);
    setProgress(null);
    setCsvText('');
    setCsvFileName('');
    setCsvHeaders(null);
    setColumnMap({});
  };

  const handleSourceSelect = (source: ImportSource) => {
    setSelectedSource(source);
    setResult(null);
    setProgress(null);
    setCsvHeaders(null);
    setCsvText('');
    setColumnMap({});
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

      if (importResult.folders && importResult.folders.length > 0) {
        const existingFolders = await getSetting<NotesFolder[]>('folders', []);
        const merged = [...(existingFolders || []), ...importResult.folders];
        await setSetting('folders', merged);
        window.dispatchEvent(new Event('foldersUpdated'));
      }

      if (importResult.tasks.length > 0) {
        const existing = await loadTodoItems();
        await saveTodoItems([...existing, ...importResult.tasks]);
        window.dispatchEvent(new Event('tasksUpdated'));
      }
      if (importResult.notes.length > 0) {
        const existing = await loadNotesFromDB();
        await saveNotesToDB([...existing, ...importResult.notes]);
        window.dispatchEvent(new Event('notesUpdated'));
      }

      setResult(importResult);
      const parts = [
        importResult.stats.tasks ? `${importResult.stats.tasks} tasks` : null,
        importResult.stats.notes ? `${importResult.stats.notes} notes` : null,
        importResult.stats.attachments ? `${importResult.stats.attachments} attachments` : null,
        importResult.stats.failed ? `${importResult.stats.failed} skipped` : null,
      ].filter(Boolean).join(', ');
      toast({ title: t('settings.importSuccess', 'Import successful!'), description: parts || 'Done' });
    } catch {
      toast({ title: t('settings.importFailed', 'Import failed'), variant: 'destructive' });
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
  const showMapping = csvHeaders !== null && !result && !isImporting;
  const showProgress = isImporting && progress;

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

        {/* ── Source picker ── */}
        {!result && !isImporting && !showMapping && (
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
