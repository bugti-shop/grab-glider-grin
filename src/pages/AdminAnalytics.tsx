import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw } from "lucide-react";

type Event = {
  id: string;
  session_id: string;
  path: string;
  referrer: string | null;
  source: string | null;
  device: string | null;
  created_at: string;
};

const RANGES = [
  { label: "Last 15 min", ms: 15 * 60_000 },
  { label: "Last 1 hour", ms: 60 * 60_000 },
  { label: "Last 24 hours", ms: 24 * 60 * 60_000 },
  { label: "Last 7 days", ms: 7 * 24 * 60 * 60_000 },
];

const SESSION_WINDOW_MS = 30 * 60_000; // 30 min inactivity = new session
const LIVE_WINDOW_MS = 5 * 60_000; // "Current visitors" = active last 5 min

const AdminAnalytics = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [rangeMs, setRangeMs] = useState(RANGES[2].ms);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - rangeMs).toISOString();
    const { data, error } = await supabase
      .from("page_events")
      .select("id, session_id, path, referrer, source, device, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (!error && data) setEvents(data as Event[]);
    setLastFetched(new Date());
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [rangeMs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(t);
  }, [autoRefresh, rangeMs]);

  const stats = useMemo(() => {
    const now = Date.now();
    const uniqueSessions = new Set<string>();
    const liveSessions = new Set<string>();
    const pageCount = new Map<string, number>();
    const sourceCount = new Map<string, number>();
    const deviceCount = new Map<string, number>();
    const sessionEvents = new Map<string, Event[]>();

    for (const e of events) {
      uniqueSessions.add(e.session_id);
      const ts = new Date(e.created_at).getTime();
      if (now - ts <= LIVE_WINDOW_MS) liveSessions.add(e.session_id);

      pageCount.set(e.path, (pageCount.get(e.path) ?? 0) + 1);
      const src = e.source || "Direct";
      sourceCount.set(src, (sourceCount.get(src) ?? 0) + 1);
      const dev = e.device || "unknown";
      deviceCount.set(dev, (deviceCount.get(dev) ?? 0) + 1);

      const arr = sessionEvents.get(e.session_id) ?? [];
      arr.push(e);
      sessionEvents.set(e.session_id, arr);
    }

    // Session-based metrics
    let totalSessionMs = 0;
    let sessionDurCount = 0;
    let bouncedSessions = 0;
    for (const arr of sessionEvents.values()) {
      const sorted = arr.slice().sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      const first = new Date(sorted[0].created_at).getTime();
      const last = new Date(sorted[sorted.length - 1].created_at).getTime();
      const dur = last - first;
      if (sorted.length > 1) {
        totalSessionMs += dur;
        sessionDurCount++;
      }
      // Bounce = only 1 pageview in the session
      const uniquePaths = new Set(sorted.map((e) => e.path));
      if (uniquePaths.size <= 1) bouncedSessions++;
    }
    const avgSessionSec = sessionDurCount > 0 ? Math.round(totalSessionMs / sessionDurCount / 1000) : 0;
    const bounceRate = uniqueSessions.size > 0 ? Math.round((bouncedSessions / uniqueSessions.size) * 100) : 0;

    const sortEntries = (m: Map<string, number>) =>
      Array.from(m.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15);

    return {
      pageviews: events.length,
      uniqueVisitors: uniqueSessions.size,
      liveVisitors: liveSessions.size,
      avgSessionSec,
      bounceRate,
      topPages: sortEntries(pageCount),
      topSources: sortEntries(sourceCount),
      topDevices: sortEntries(deviceCount),
    };
  }, [events]);

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">In-App Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Real-time · session-based · updates every 5s
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(rangeMs)} onValueChange={(v) => setRangeMs(Number(v))}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r.ms} value={String(r.ms)}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh((v) => !v)}
          >
            {autoRefresh ? "Live" : "Paused"}
          </Button>
          <Button variant="outline" size="icon" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} size={16} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Metric label="Current visitors" value={stats.liveVisitors} accent />
        <Metric label="Unique visitors" value={stats.uniqueVisitors} />
        <Metric label="Pageviews" value={stats.pageviews} />
        <Metric label="Avg session" value={`${stats.avgSessionSec}s`} />
        <Metric label="Bounce rate" value={`${stats.bounceRate}%`} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ListCard title="Top pages" rows={stats.topPages} />
        <ListCard title="Sources" rows={stats.topSources} />
        <ListCard title="Devices" rows={stats.topDevices} />
      </div>

      {lastFetched && (
        <p className="text-xs text-muted-foreground text-center">
          Last updated {lastFetched.toLocaleTimeString()}
        </p>
      )}
    </div>
  );
};

const Metric = ({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) => (
  <Card className={`p-4 ${accent ? "bg-primary/10 border-primary/30" : ""}`}>
    <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
    <div className="text-2xl font-bold mt-1">{value}</div>
  </Card>
);

const ListCard = ({ title, rows }: { title: string; rows: [string, number][] }) => (
  <Card className="p-4">
    <h3 className="font-semibold mb-2">{title}</h3>
    {rows.length === 0 ? (
      <p className="text-sm text-muted-foreground">No data</p>
    ) : (
      <ul className="space-y-1.5">
        {rows.map(([k, v]) => (
          <li key={k} className="flex items-center justify-between text-sm gap-2">
            <span className="truncate">{k}</span>
            <span className="font-mono text-muted-foreground shrink-0">{v}</span>
          </li>
        ))}
      </ul>
    )}
  </Card>
);

export default AdminAnalytics;
