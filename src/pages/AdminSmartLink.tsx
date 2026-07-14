import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Lock, RefreshCw, Link as LinkIcon, Smartphone, Globe, Apple, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";

const COLORS = ["#3c78f0", "#111", "#22c55e", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6", "#ef4444"];

type Row = {
  id: number;
  created_at: string;
  slug: string | null;
  target: string | null;
  reached_store: boolean | null;
  os: string | null;
  os_version: string | null;
  device_type: string | null;
  device_vendor: string | null;
  device_model: string | null;
  browser: string | null;
  language: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  referrer: string | null;
  user_agent: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
};

function countBy(rows: Row[], key: keyof Row): { name: string; value: number }[] {
  const c: Record<string, number> = {};
  for (const r of rows) {
    const v = (r[key] ?? "Unknown") as string;
    const label = String(v || "Unknown");
    c[label] = (c[label] || 0) + 1;
  }
  return Object.entries(c).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

function byDay(rows: Row[]) {
  const c: Record<string, number> = {};
  for (const r of rows) {
    const d = new Date(r.created_at).toISOString().slice(0, 10);
    c[d] = (c[d] || 0) + 1;
  }
  return Object.entries(c).map(([name, value]) => ({ name, value })).sort((a, b) => a.name.localeCompare(b.name));
}

const Stat = ({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) => (
  <Card>
    <CardContent className="p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </CardContent>
  </Card>
);

const Chart = ({ title, data, type = "bar" }: { title: string; data: { name: string; value: number }[]; type?: "bar" | "pie" | "line" }) => {
  if (!data.length) return null;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent>
        {type === "pie" ? (
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={data} dataKey="value" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        ) : type === "line" ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" fontSize={10} />
              <YAxis fontSize={10} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#3c78f0" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(220, Math.min(data.length * 32, 500))}>
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} fontSize={10} />
              <YAxis type="category" dataKey="name" width={140} fontSize={10} interval={0} />
              <Tooltip />
              <Bar dataKey="value" fill="#3c78f0" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};

export default function AdminSmartLink() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [savedPw, setSavedPw] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchData = async (pw: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-fetch-smart-link", { body: { password: pw } });
      if (error) throw error;
      setRows(((data as any)?.rows as Row[]) || []);
    } catch (e) {
      setRows([]);
    } finally { setLoading(false); }
  };

  const handleLogin = async () => {
    setError("");
    try {
      const { data, error } = await supabase.functions.invoke("verify-admin", { body: { password } });
      if (error) throw error;
      if (data?.valid) {
        setSavedPw(password);
        setAuthenticated(true);
        setPassword("");
        await fetchData(password);
      } else setError("Incorrect password");
    } catch { setError("Verification failed"); }
  };

  const stats = useMemo(() => {
    const total = rows.length;
    const ios = rows.filter(r => r.target === "ios").length;
    const android = rows.filter(r => r.target === "android").length;
    const other = rows.filter(r => r.target === "other").length;
    const reachedStore = rows.filter(r => r.reached_store).length;
    return { total, ios, android, other, reachedStore };
  }, [rows]);

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <Lock className="w-10 h-10 mx-auto text-primary mb-2" />
            <CardTitle>Smart Link Admin</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input type="password" placeholder="Admin password" value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()} autoFocus />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" onClick={handleLogin}>Unlock</Button>
            <Button variant="ghost" className="w-full" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4 mr-2" />Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const shareUrl = `${window.location.origin}/get`;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><LinkIcon className="w-6 h-6" /> Smart Link Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Share link: <code className="bg-muted px-2 py-1 rounded">{shareUrl}</code>
            <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(shareUrl)}>Copy</Button>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchData(savedPw)} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Total clicks" value={stats.total} icon={LinkIcon} />
        <Stat label="Reached a store" value={stats.reachedStore} icon={Smartphone} />
        <Stat label="→ App Store (iOS)" value={stats.ios} icon={Apple} />
        <Stat label="→ Play Store (Android)" value={stats.android} icon={PlayCircle} />
        <Stat label="Other (desktop/web)" value={stats.other} icon={Globe} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Chart title="Clicks per day" data={byDay(rows)} type="line" />
        <Chart title="Store split" data={countBy(rows, "target")} type="pie" />
        <Chart title="Country" data={countBy(rows, "country")} />
        <Chart title="Operating system" data={countBy(rows, "os")} />
        <Chart title="Device type" data={countBy(rows, "device_type")} />
        <Chart title="Browser" data={countBy(rows, "browser")} />
        <Chart title="Language" data={countBy(rows, "language")} />
        <Chart title="City" data={countBy(rows, "city")} />
        <Chart title="Region" data={countBy(rows, "region")} />
        <Chart title="Device model" data={countBy(rows, "device_model")} />
        <Chart title="Referrer" data={countBy(rows, "referrer")} />
        <Chart title="UTM source" data={countBy(rows, "utm_source")} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Recent clicks</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left border-b">
                <th className="p-2">Time</th><th className="p-2">Target</th><th className="p-2">OS</th>
                <th className="p-2">Device</th><th className="p-2">Browser</th><th className="p-2">Country</th>
                <th className="p-2">City</th><th className="p-2">Lang</th><th className="p-2">Referrer</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 200).map(r => (
                <tr key={r.id} className="border-b hover:bg-muted/40">
                  <td className="p-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="p-2">{r.target}</td>
                  <td className="p-2">{r.os}{r.os_version ? ` ${r.os_version}` : ""}</td>
                  <td className="p-2">{r.device_type}{r.device_model ? ` · ${r.device_model}` : ""}</td>
                  <td className="p-2">{r.browser}</td>
                  <td className="p-2">{r.country}</td>
                  <td className="p-2">{r.city}</td>
                  <td className="p-2">{r.language}</td>
                  <td className="p-2 max-w-[200px] truncate">{r.referrer}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="text-center text-muted-foreground py-6">No clicks yet.</p>}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Note: gender is not something we can detect from a link click — browsers &amp; the OS do not expose it. Country / city come from the visitor's IP via CDN headers (may be blank in some environments).
      </p>
    </div>
  );
}
