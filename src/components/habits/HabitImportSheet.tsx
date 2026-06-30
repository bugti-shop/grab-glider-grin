import { useRef, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Upload, FileText, CheckCircle2, AlertTriangle } from 'lucide-react';
import { importHabits, type HabitImportSource } from '@/utils/habitImport';
import { saveHabitsBatch, loadHabits } from '@/utils/habitStorage';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const SOURCES: { id: Exclude<HabitImportSource, 'auto'>; label: string; hint: string }[] = [
  { id: 'loop', label: 'Loop Habit Tracker', hint: 'CSV export (Date, Habit1, Habit2…)' },
  { id: 'habitnow', label: 'HabitNow', hint: 'JSON backup file' },
  { id: 'streaks', label: 'Streaks', hint: 'CSV export' },
  { id: 'generic-csv', label: 'Generic CSV', hint: 'Columns: name, emoji, color, frequency, difficulty' },
];

export const HabitImportSheet = ({ open, onOpenChange }: Props) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [forcedSource, setForcedSource] = useState<HabitImportSource>('auto');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    count: number;
    source: string;
    warnings: string[];
  } | null>(null);

  const handleFile = async (file: File) => {
    setBusy(true);
    setResult(null);
    try {
      const text = await file.text();
      const parsed = importHabits(text, file.name, forcedSource);
      if (parsed.habits.length === 0) {
        toast.error(parsed.warnings[0] || 'No habits found.');
        setResult({ count: 0, source: parsed.source, warnings: parsed.warnings });
        return;
      }
      // Merge with existing — avoid duplicate names.
      const existing = await loadHabits();
      const existingNames = new Set(existing.map((h) => h.name.trim().toLowerCase()));
      const fresh = parsed.habits.filter(
        (h) => !existingNames.has(h.name.trim().toLowerCase())
      );
      await saveHabitsBatch(fresh);
      toast.success(`Imported ${fresh.length} habit${fresh.length === 1 ? '' : 's'}.`);
      setResult({
        count: fresh.length,
        source: parsed.source,
        warnings: parsed.warnings,
      });
    } catch (e: any) {
      toast.error(`Import failed: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Import Habits</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">
            Bring habits in from Loop, HabitNow, Streaks, or any CSV file.
          </p>

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Source
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForcedSource('auto')}
                className={`text-left rounded-xl border px-3 py-2 text-sm ${
                  forcedSource === 'auto'
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-background'
                }`}
              >
                <div className="font-semibold">Auto-detect</div>
                <div className="text-[11px] text-muted-foreground">Guess from file</div>
              </button>
              {SOURCES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setForcedSource(s.id)}
                  className={`text-left rounded-xl border px-3 py-2 text-sm ${
                    forcedSource === s.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-background'
                  }`}
                >
                  <div className="font-semibold">{s.label}</div>
                  <div className="text-[11px] text-muted-foreground">{s.hint}</div>
                </button>
              ))}
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json,text/csv,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = '';
            }}
          />

          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="w-full h-12"
          >
            <Upload className="h-4 w-4 mr-2" />
            {busy ? 'Importing…' : 'Choose file'}
          </Button>

          {result && (
            <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                {result.count > 0 ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                )}
                <span>
                  {result.count} habit{result.count === 1 ? '' : 's'} imported from{' '}
                  <span className="font-semibold">{result.source}</span>.
                </span>
              </div>
              {result.warnings.length > 0 && (
                <ul className="text-xs text-muted-foreground list-disc pl-5">
                  {result.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="text-xs text-muted-foreground flex gap-2">
            <FileText className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Loop exports a CSV called <em>Habits.csv</em> from the in-app backup.
              HabitNow ships a JSON backup. Streaks uses a wide CSV similar to Loop.
            </span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
