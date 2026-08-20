import React, { useEffect, useState } from "react";
import { getHost } from "@eversync/plugin-host";

type Stats = {
  totalRequests: number;
  totalTokensSaved: number;
  avgSavingsPct: number;
  avgDurationMs: number;
  totalSkipped?: number;
  validationFallbacks: number;
  byMode: Record<string, { count: number; tokensSaved: number; avgSavingsPct: number; skipped?: number }>;
  byProvider: Record<string, { count: number; tokensSaved: number }>;
};

const ranges = ["24h", "7d", "30d", "all"] as const;

export default function AnalyticsCompressionModule() {
  const [range, setRange] = useState<(typeof ranges)[number]>("24h");
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStats(null);
    getHost().fetch(`/api/analytics/compression?since=${range}`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => setStats(data as Stats))
      .catch(() => setError("Unable to load compression analytics."));
  }, [range]);

  if (!stats) return <p className="p-6 text-sm text-text-muted">{error ?? "Loading compression analytics..."}</p>;
  const total = stats.totalRequests + (stats.totalSkipped ?? 0);
  const cards = [["Requests", total], ["Tokens saved", stats.totalTokensSaved], ["Average savings", `${stats.avgSavingsPct}%`], ["Average duration", `${stats.avgDurationMs}ms`], ["Validation fallbacks", stats.validationFallbacks]];
  return <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4"><header><h1 className="text-2xl font-bold text-text-main">Compression Analytics</h1><p className="mt-1 text-sm text-text-muted">Savings and execution statistics for the compression pipeline.</p></header><div className="flex gap-2">{ranges.map((item) => <button key={item} className={`rounded px-3 py-1.5 text-sm ${range === item ? "bg-primary text-primary-foreground" : "border border-border text-text-main"}`} type="button" onClick={() => setRange(item)}>{item}</button>)}</div><section className="grid grid-cols-2 gap-3 md:grid-cols-5">{cards.map(([label, value]) => <div key={label as string} className="rounded-lg border border-border bg-surface p-3"><p className="text-xs text-text-muted">{label}</p><p className="mt-1 text-lg font-semibold text-text-main">{Number(value).toLocaleString?.() ?? value}</p></div>)}</section><section className="grid grid-cols-1 gap-4 lg:grid-cols-2"><Breakdown title="By mode" entries={stats.byMode} total={total} /><Breakdown title="By provider" entries={stats.byProvider} total={stats.totalRequests} /></section></div>;
}

function Breakdown({ title, entries, total }: { title: string; entries: Record<string, { count: number; tokensSaved: number }>; total: number }) {
  return <section className="rounded-lg border border-border bg-surface p-4"><h2 className="text-sm font-semibold text-text-main">{title}</h2><div className="mt-4 flex flex-col gap-3">{Object.entries(entries).sort(([, left], [, right]) => right.count - left.count).map(([name, data]) => <div key={name}><div className="flex justify-between gap-3 text-sm"><span className="text-text-main">{name}</span><span className="text-text-muted">{data.count.toLocaleString()} requests, {data.tokensSaved.toLocaleString()} saved</span></div><div className="mt-1 h-2 overflow-hidden rounded bg-bg"><div className="h-full rounded bg-primary" style={{ width: `${total ? Math.round((data.count / total) * 100) : 0}%` }} /></div></div>)}</div></section>;
}