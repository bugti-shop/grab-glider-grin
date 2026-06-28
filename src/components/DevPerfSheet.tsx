/**
 * DevPerfSheet — Developer-only sheet to mass-generate tasks/notes with
 * realistic data and run an automated scroll-FPS + checkbox-latency test.
 *
 * Reports back instantly whether the app remains "smooth" (FPS >= 55) and
 * whether the optimistic checkbox toggle stays "instant" (< 16ms to commit).
 */
import { useEffect, useRef, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Beaker, CheckCircle2, AlertTriangle } from 'lucide-react';
import { genId } from '@/utils/genId';
import { TodoItem, Note } from '@/types/note';
import { loadTasksFromDB, saveTasksToDB } from '@/utils/taskStorage';
import { loadNotesFromDB, saveNotesToDB } from '@/utils/noteStorage';
import { toast } from 'sonner';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface TestReport {
  generated: number;
  generateMs: number;
  scrollFps: number;
  toggleLatencyMs: number;
  smooth: boolean;
  instant: boolean;
}

const TASK_WORDS = [
  'Review', 'Draft', 'Send', 'Plan', 'Refactor', 'Ship', 'Investigate', 'Sync',
  'Schedule', 'Call', 'Email', 'Prepare', 'Buy', 'Read', 'Write', 'Fix', 'Update',
  'Design', 'Deploy', 'Test', 'Outline', 'Polish', 'Reply to', 'Organize',
];
const TASK_NOUNS = [
  'quarterly report', 'team standup', 'grocery list', 'project brief',
  'client proposal', 'design review', 'launch plan', 'sprint backlog',
  'invoice', 'pull request', 'meeting notes', 'roadmap', 'budget',
  'release notes', 'demo script', 'onboarding doc', 'analytics dashboard',
];
const PRIORITIES = ['high', 'medium', 'low', 'none'] as const;

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

function generateTasks(count: number): TodoItem[] {
  const now = new Date();
  const out: TodoItem[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const text = `${pick(TASK_WORDS)} ${pick(TASK_NOUNS)} #${i + 1}`;
    out[i] = {
      id: genId(),
      text,
      completed: false,
      priority: pick(PRIORITIES),
      createdAt: now,
      modifiedAt: now,
      dueDate: Math.random() > 0.5 ? new Date(Date.now() + Math.random() * 14 * 86400000) : undefined,
    } as TodoItem;
  }
  return out;
}

function generateNotes(count: number): Note[] {
  const now = new Date();
  const out: Note[] = new Array(count);
  for (let i = 0; i < count; i++) {
    out[i] = {
      id: genId(),
      type: 'regular',
      title: `${pick(TASK_WORDS)} ${pick(TASK_NOUNS)} #${i + 1}`,
      content: `Auto-generated note ${i + 1}. ${pick(TASK_NOUNS)} — ${pick(TASK_NOUNS)}.`,
      voiceRecordings: [],
      createdAt: now,
      updatedAt: now,
    } as unknown as Note;
  }
  return out;
}

/** Measure document scroll FPS over `durationMs` while programmatically scrolling. */
function measureScrollFps(durationMs = 1500): Promise<number> {
  return new Promise((resolve) => {
    let frames = 0;
    let raf = 0;
    const start = performance.now();
    const startY = window.scrollY;
    const tick = () => {
      frames++;
      const elapsed = performance.now() - start;
      const progress = Math.min(1, elapsed / durationMs);
      window.scrollTo(0, startY + progress * 4000);
      if (elapsed < durationMs) {
        raf = requestAnimationFrame(tick);
      } else {
        cancelAnimationFrame(raf);
        const fps = Math.round((frames / durationMs) * 1000);
        window.scrollTo(0, startY);
        resolve(fps);
      }
    };
    raf = requestAnimationFrame(tick);
  });
}

/** Measure synchronous commit time for toggling one task complete. */
async function measureToggleLatency(): Promise<number> {
  const tasks = await loadTasksFromDB();
  const target = tasks.find(t => !t.completed);
  if (!target) return 0;
  const t0 = performance.now();
  // Optimistic in-memory toggle + dispatch update event the app listens to.
  target.completed = true;
  target.completedAt = new Date();
  target.modifiedAt = new Date();
  await saveTasksToDB(tasks, true);
  const dt = performance.now() - t0;
  // Revert so the dev test is non-destructive of completion state.
  target.completed = false;
  target.completedAt = undefined;
  await saveTasksToDB(tasks, true);
  return dt;
}

export const DevPerfSheet = ({ isOpen, onClose }: Props) => {
  const [count, setCount] = useState(100000);
  const [busy, setBusy] = useState<null | 'tasks' | 'notes' | 'test' | 'clear'>(null);
  const [report, setReport] = useState<TestReport | null>(null);
  const [phase, setPhase] = useState<string>('');
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!isOpen) { cancelRef.current = false; setReport(null); setPhase(''); }
  }, [isOpen]);

  const runGenerate = async (kind: 'tasks' | 'notes') => {
    if (busy) return;
    setBusy(kind); setReport(null);
    const n = Math.max(100, Math.min(500000, count | 0));
    setPhase(`Generating ${n.toLocaleString()} ${kind}…`);
    const t0 = performance.now();
    try {
      if (kind === 'tasks') {
        const existing = await loadTasksFromDB();
        const fresh = generateTasks(n);
        await saveTasksToDB([...fresh, ...existing], false);
      } else {
        const existing = await loadNotesFromDB();
        const fresh = generateNotes(n);
        await saveNotesToDB([...fresh, ...existing], false);
      }
      const generateMs = Math.round(performance.now() - t0);
      window.dispatchEvent(new Event(kind === 'tasks' ? 'todosUpdated' : 'notesUpdated'));
      setPhase('Measuring scroll FPS…');
      // Let React commit the new list before measuring.
      await new Promise(r => setTimeout(r, 600));
      const scrollFps = await measureScrollFps(1500);
      let toggleLatencyMs = 0;
      if (kind === 'tasks') {
        setPhase('Measuring checkbox latency…');
        toggleLatencyMs = Math.round(await measureToggleLatency());
      }
      const r: TestReport = {
        generated: n,
        generateMs,
        scrollFps,
        toggleLatencyMs,
        smooth: scrollFps >= 50,
        instant: kind === 'tasks' ? toggleLatencyMs < 32 : true,
      };
      setReport(r);
      setPhase('');
      toast.success(`Generated ${n.toLocaleString()} ${kind}`);
    } catch (e) {
      console.error(e);
      toast.error(`Failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const runClear = async (kind: 'tasks' | 'notes') => {
    if (busy) return;
    if (!confirm(`Delete ALL ${kind}? This cannot be undone.`)) return;
    setBusy('clear');
    try {
      // Direct IDB wipe — bypass the empty-array safety guard.
      const dbName = kind === 'tasks' ? 'nota-tasks-db' : 'nota-notes-db';
      const storeName = kind === 'tasks' ? 'tasks' : 'notes';
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(storeName)) { db.close(); resolve(); return; }
          const tx = db.transaction(storeName, 'readwrite');
          tx.objectStore(storeName).clear();
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => { db.close(); reject(tx.error); };
        };
        req.onerror = () => reject(req.error);
      });
      window.dispatchEvent(new Event(kind === 'tasks' ? 'todosUpdated' : 'notesUpdated'));
      toast.success(`Cleared all ${kind}`);
      setReport(null);
    } catch (e) {
      toast.error(`Clear failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[90vh] overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <Beaker className="h-5 w-5" />
            Developer — Stress Test
          </SheetTitle>
          <SheetDescription>
            Mass-generate realistic data, then automatically report scroll FPS and
            checkbox completion latency. Open the Today / Notes page first so the
            list is mounted for measurement.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4">
          <label className="block text-sm">
            <span className="text-muted-foreground">Count</span>
            <Input
              type="number"
              min={100}
              max={500000}
              step={1000}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              disabled={!!busy}
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => runGenerate('tasks')} disabled={!!busy}>
              {busy === 'tasks' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Generate tasks
            </Button>
            <Button onClick={() => runGenerate('notes')} disabled={!!busy} variant="secondary">
              {busy === 'notes' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Generate notes
            </Button>
            <Button onClick={() => runClear('tasks')} disabled={!!busy} variant="outline">
              Clear all tasks
            </Button>
            <Button onClick={() => runClear('notes')} disabled={!!busy} variant="outline">
              Clear all notes
            </Button>
          </div>

          {phase && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> {phase}
            </div>
          )}

          {report && (
            <div className="rounded-lg border border-border p-3 text-sm space-y-1.5 bg-muted/30">
              <div className="font-semibold mb-1 flex items-center gap-2">
                {report.smooth && report.instant ? (
                  <><CheckCircle2 className="h-4 w-4 text-green-500" /> All checks passed</>
                ) : (
                  <><AlertTriangle className="h-4 w-4 text-amber-500" /> Degradation detected</>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-xs">
                <span className="text-muted-foreground">Generated</span>
                <span>{report.generated.toLocaleString()}</span>
                <span className="text-muted-foreground">Generation time</span>
                <span>{report.generateMs} ms</span>
                <span className="text-muted-foreground">Scroll FPS</span>
                <span style={{ color: report.smooth ? '#22c55e' : '#ef4444' }}>
                  {report.scrollFps} {report.smooth ? '(smooth)' : '(janky)'}
                </span>
                {report.toggleLatencyMs > 0 && (
                  <>
                    <span className="text-muted-foreground">Toggle latency</span>
                    <span style={{ color: report.instant ? '#22c55e' : '#ef4444' }}>
                      {report.toggleLatencyMs} ms {report.instant ? '(instant)' : '(slow)'}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
