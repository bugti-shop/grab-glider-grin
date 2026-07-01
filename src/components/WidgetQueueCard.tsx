import { useEffect, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Smartphone } from 'lucide-react';

/**
 * Diagnostics card that surfaces the launcher-widget "Quick Add" pending
 * task queue. Lets the user verify tasks are safe and force a drain.
 */
export default function WidgetQueueCard() {
  const [queue, setQueue] = useState<Array<{ text?: string; createdAt?: number }>>([]);
  const [busy, setBusy] = useState(false);
  const [lastDrained, setLastDrained] = useState<number | null>(null);
  const native = Capacitor.isNativePlatform();

  const refresh = useCallback(async () => {
    try {
      const { widgetDataSync } = await import('@/utils/widgetDataSync');
      const q = await widgetDataSync.peekPendingNewTasks();
      setQueue(q || []);
    } catch { /* not native or import failed */ }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2000);
    const onDrained = (e: Event) => {
      setLastDrained(Date.now());
      refresh();
    };
    window.addEventListener('flowist:widget:drained', onDrained);
    return () => { clearInterval(t); window.removeEventListener('flowist:widget:drained', onDrained); };
  }, [refresh]);

  const drainNow = async () => {
    setBusy(true);
    try {
      const { widgetDataSync } = await import('@/utils/widgetDataSync');
      await widgetDataSync.forceDrainPendingNewTasks();
      setLastDrained(Date.now());
      await refresh();
    } finally { setBusy(false); }
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Smartphone className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Quick Add widget queue</span>
        <Badge variant={queue.length > 0 ? 'destructive' : 'secondary'} className="ml-auto">
          {queue.length} pending
        </Badge>
      </div>
      {!native && (
        <p className="text-xs text-muted-foreground">Only available on the installed Android app.</p>
      )}
      {native && queue.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No queued tasks. Anything you add from the launcher widget will appear here until it's synced.
        </p>
      )}
      {native && queue.length > 0 && (
        <ul className="mb-3 max-h-40 space-y-1 overflow-auto text-sm">
          {queue.map((q, i) => (
            <li key={i} className="truncate rounded border bg-muted/40 px-2 py-1 text-xs">
              {q.text || '(empty)'}
            </li>
          ))}
        </ul>
      )}
      {native && (
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            {lastDrained ? `Drained ${Math.round((Date.now() - lastDrained) / 1000)}s ago` : 'Not drained yet this session'}
          </span>
          <Button size="sm" variant="outline" onClick={drainNow} disabled={busy}>
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
            Drain now
          </Button>
        </div>
      )}
    </Card>
  );
}
