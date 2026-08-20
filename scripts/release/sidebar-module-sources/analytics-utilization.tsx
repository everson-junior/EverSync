import React, { useEffect, useState } from "react";
import { getHost } from "@eversync/plugin-host";

type Point = { timestamp: string; provider: string; remainingPct: number; isExhausted: boolean; windowKey: string };
type Response = { timeRange: string; bucketSizeMinutes: number; providers: string[]; data: Point[] };
const ranges = ["1h", "24h", "7d", "30d"] as const;

export default function AnalyticsUtilizationModule() {
  const [range, setRange] = useState<(typeof ranges)[number]>("24h");
  const [aggregateBy, setAggregateBy] = useState<"provider" | "connection">("provider");
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    getHost().fetch(`/api/usage/utilization?range=${range}&aggregateBy=${aggregateBy}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((value) => setData(value as Response))
      .catch(() => setError("Unable to load utilization data."));
  }, [range, aggregateBy]);

  if (!data) return <p className="p-6 text-sm text-text-muted">{error ?? "Loading utilization data..."}</p>;
  const latest = new Map<string, Point>();
  for (const point of data.data) {
    const current = latest.get(point.provider);
    if (!current || new Date(point.timestamp) > new Date(current.timestamp)) latest.set(point.provider, point);
  }
  const providers = [...latest.values()].sort((left, right) => left.remainingPct - right.remainingPct);
  return <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4"><header><h1 className="text-2xl font-bold text-text-main">Provider Utilization</h1><p className="mt-1 text-sm text-text-muted">Latest remaining quota snapshots, grouped by provider or connection.</p></header><div className="flex flex-wrap gap-2"><div className="flex gap-2">{ranges.map((item) => <button key={item} className={`rounded px-3 py-1.5 text-sm ${range === item ? "bg-primary text-primary-foreground" : "border border-border text-text-main"}`} type="button" onClick={() => setRange(item)}>{item}</button>)}</div><div className="ml-auto flex gap-2"><button className={`rounded px-3 py-1.5 text-sm ${aggregateBy === "provider" ? "bg-primary text-primary-foreground" : "border border-border text-text-main"}`} type="button" onClick={() => setAggregateBy("provider")}>Providers</button><button className={`rounded px-3 py-1.5 text-sm ${aggregateBy === "connection" ? "bg-primary text-primary-foreground" : "border border-border text-text-main"}`} type="button" onClick={() => setAggregateBy("connection")}>Connections</button></div></div><section className="rounded-lg border border-border bg-surface p-4"><p className="text-sm text-text-muted">{data.providers.length} sources, {data.bucketSizeMinutes}-minute buckets</p><div className="mt-4 flex flex-col gap-3">{providers.map((point) => <div key={point.provider}><div className="flex justify-between gap-3 text-sm"><span className="font-medium text-text-main">{point.provider}</span><span className={point.isExhausted ? "text-danger" : "text-text-muted"}>{point.isExhausted ? "Exhausted" : `${Math.round(point.remainingPct)}% remaining`}</span></div><div className="mt-1 h-2 overflow-hidden rounded bg-bg"><div className={point.isExhausted ? "h-full bg-danger" : "h-full bg-primary"} style={{ width: `${Math.max(0, Math.min(100, point.remainingPct))}%` }} /></div><p className="mt-1 text-xs text-text-muted">{new Date(point.timestamp).toLocaleString()} · {point.windowKey}</p></div>)}{providers.length === 0 && <p className="text-sm text-text-muted">No quota snapshots exist for this period.</p>}</div></section></div>;
}