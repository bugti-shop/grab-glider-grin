import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, RefreshCw, Trash2, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  getQueueBacklog,
  getTotalBacklog,
  getListenerTimestamps,
  getConflicts,
  clearConflicts,
  type ConflictRecord,
} from '@/utils/cloudSync/diagnostics';
import { flushQueue } from '@/utils/cloudSync/writeQueue';
import { SYNC_TABLES } from '@/utils/cloudSync/syncTables';
import WidgetQueueCard from '@/components/WidgetQueueCard';

interface Snapshot {
  backlog: Record<string, number>;
  total: number;
  listeners: Partial<Record<string, number>>;
  conflicts: ConflictRecord[];
}

function read(): Snapshot {
  return {
    backlog: getQueueBacklog(),
    total: getTotalBacklog(),
    listeners: getListenerTimestamps(),
    conflicts: getConflicts(),
  };
}

function fmtAgo(ts?: number): string {
  if (!ts) return 'never';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function SyncDiagnostics() {
  const [snap, setSnap] = useState<Snapshot>(() => read());
  const [flushing, setFlushing] = useState(false);

  useEffect(() => {
    const tick = () => setSnap(read());
    const id = setInterval(tick, 1500);
    window.addEventListener('flowist:sync:diag-changed', tick);
    window.addEventListener('flowist:sync:change', tick as any);
    return () => {
      clearInterval(id);
      window.removeEventListener('flowist:sync:diag-changed', tick);
      window.removeEventListener('flowist:sync:change', tick as any);
    };
  }, []);

  const tables = [...SYNC_TABLES];

  const handleFlush = async () => {
    setFlushing(true);
    try { await flushQueue(); } finally {
      setFlushing(false);
      setSnap(read());
    }
  };

  const attachmentConflicts = snap.conflicts.filter(c => c.table === 'file_attachments');
  const storeConflicts = snap.conflicts.filter(c => c.table !== 'file_attachments');

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background/80 px-4 py-3 backdrop-blur">
        <Link to="/settings" aria-label="Back">
          <Button variant="ghost" size="icon"><ChevronLeft className="h-5 w-5" /></Button>
        </Link>
        <h1 className="text-lg font-semibold">Sync diagnostics</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleFlush} disabled={flushing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${flushing ? 'animate-spin' : ''}`} />
            Flush queue
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Launcher widget</h2>
          <WidgetQueueCard />
        </section>

        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Queue backlog</h2>
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm">Pending writes</span>
              <Badge variant={snap.total > 0 ? 'destructive' : 'secondary'}>{snap.total}</Badge>
            </div>
            <ul className="space-y-1.5 text-sm">
              {tables.map(t => (
                <li key={t} className="flex items-center justify-between">
                  <span className="font-mono text-xs text-muted-foreground">{t}</span>
                  <Badge variant={snap.backlog[t] ? 'destructive' : 'outline'}>{snap.backlog[t] ?? 0}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Last successful listener event</h2>
          <Card className="p-4">
            <ul className="space-y-1.5 text-sm">
              {tables.map(t => (
                <li key={t} className="flex items-center justify-between">
                  <span className="font-mono text-xs text-muted-foreground">{t}</span>
                  <span className="text-xs">{fmtAgo(snap.listeners[t])}</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              Detected conflicts ({snap.conflicts.length})
            </h2>
            {snap.conflicts.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => { clearConflicts(); setSnap(read()); }}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Clear
              </Button>
            )}
          </div>

          <Card className="p-4">
            <h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">Stores</h3>
            {storeConflicts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No conflicts.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {storeConflicts.map(c => (
                  <li key={c.id} className="flex flex-col gap-0.5 rounded border bg-muted/40 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs">{c.table}</span>
                      <Badge variant="outline" className="text-[10px]">{c.resolution}</Badge>
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground">{c.rowId}</span>
                    <span className="text-[11px] text-muted-foreground">
                      local {fmtAgo(c.localUpdatedAt)} · cloud {fmtAgo(c.cloudUpdatedAt)} · detected {fmtAgo(c.detectedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="mt-3 p-4">
            <h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">Attachments</h3>
            {attachmentConflicts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No conflicts.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {attachmentConflicts.map(c => (
                  <li key={c.id} className="flex flex-col gap-0.5 rounded border bg-muted/40 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs">{c.fileName ?? c.rowId}</span>
                      <Badge variant="outline" className="text-[10px]">{c.resolution}</Badge>
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground">parent {c.parentId}</span>
                    <span className="text-[11px] text-muted-foreground">detected {fmtAgo(c.detectedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      </main>
    </div>
  );
}
