import React, { useEffect, useState } from "react";
import { getHost } from "@eversync/plugin-host";

type EngineField = {
  key: string;
  label: string;
  description?: string;
  type: "boolean" | "number" | "string" | "select" | "multiselect";
  defaultValue?: unknown;
  min?: number;
  max?: number;
  options?: Array<{ value: string; label: string }>;
};

type Engine = {
  id: string;
  name: string;
  description?: string;
  configSchema?: EngineField[];
};

type Analytics = {
  requestCount?: number;
  totalTokensSaved?: number;
  avgSavingsPct?: number;
};

const number = (value?: number) => new Intl.NumberFormat().format(value ?? 0);

export default function ContextLiteModule() {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const asJson = (response: Response) => (response.ok ? response.json() : null);

    Promise.all([
      getHost().fetch("/api/compression/engines").then(asJson),
      getHost().fetch("/api/settings/compression").then(asJson),
      getHost().fetch("/api/context/analytics/engine?engineId=lite&days=7").then(asJson),
    ])
      .then(([enginesData, settingsData, analyticsData]) => {
        if (cancelled) return;
        const found = (enginesData?.engines as Engine[] | undefined)?.find(
          (candidate) => candidate.id === "lite"
        );
        setEngine(found ?? null);
        void settingsData;
        setAnalytics(analyticsData as Analytics | null);
      })
      .catch(() => {
        if (!cancelled) setMessage("Unable to load Context Lite settings.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <p className="p-6 text-sm text-text-muted">Loading Context Lite...</p>;
  if (!engine) return <p className="p-6 text-sm text-text-muted">Context Lite is unavailable.</p>;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-4">
      <header>
        <h1 className="text-2xl font-bold text-text-main">{engine.name}</h1>
        {engine.description && <p className="mt-1 text-sm text-text-muted">{engine.description}</p>}
      </header>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          ["Requests", number(analytics?.requestCount)],
          ["Tokens saved", number(analytics?.totalTokensSaved)],
          ["Savings", `${analytics?.avgSavingsPct ?? 0}%`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-surface p-3">
            <p className="text-xs uppercase text-text-muted">{label}</p>
            <p className="mt-1 text-lg font-semibold text-text-main">{value}</p>
          </div>
        ))}
      </section>
      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-text-main">Configuration</h2>
        <p className="mt-3 text-sm text-text-muted">
          Lite has no per-engine detail settings. Enable it and choose its pipeline level in
          Compression Settings.
        </p>
        {message && <p className="mt-3 text-sm text-text-muted" role="status">{message}</p>}
      </section>
    </div>
  );
}