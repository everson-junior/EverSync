import React, { useEffect, useState } from "react";
import { getHost } from "@eversync/plugin-host";

type Target = {
  provider: string;
  model: string;
  requests: number;
  successRate: number;
  avgLatencyMs: number;
  quotaRemainingPct: number | null;
  quotaIsExhausted: boolean | null;
};
type Combo = {
  comboId: string;
  comboName: string;
  strategy: string;
  models: string[];
  performance: { avgLatencyMs: number; successRate: number; totalRequests: number };
  quotaHealth: {
    worstRemainingPct: number;
    providers: Array<{ provider: string; remainingPct: number; isExhausted: boolean }>;
  };
  targetHealth?: Target[];
};
type Dashboard = {
  health: { combos: Combo[] };
  errors?: { forecast?: string; autopilot?: string; scoring?: string };
};
const ranges = ["1h", "24h", "7d", "30d"] as const;
const horizons = ["24h", "7d", "30d"] as const;

export default function AnalyticsComboHealthModule() {
  const [range, setRange] = useState<(typeof ranges)[number]>("24h");
  const [horizon, setHorizon] = useState<(typeof horizons)[number]>("30d");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => {
    setDashboard(null);
    getHost()
      .fetch(`/api/usage/combo-health-dashboard?range=${range}&horizon=${horizon}`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => setDashboard(data as Dashboard))
      .catch(() => setError("Unable to load combo health."));
  };
  useEffect(() => {
    load();
  }, [range, horizon]);
  if (!dashboard)
    return <p className="p-6 text-sm text-text-muted">{error ?? "Loading combo health..."}</p>;
  const warnings = Object.values(dashboard.errors ?? {}).filter(Boolean);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-4">
      <header>
        <h1 className="text-2xl font-bold text-text-main">Combo Health</h1>
        <p className="mt-1 text-sm text-text-muted">
          Routing performance and quota health for each configured combo.
        </p>
      </header>
      <div className="flex flex-wrap gap-2">
        <div className="flex gap-2">
          {ranges.map((item) => (
            <button
              key={item}
              className={`rounded px-3 py-1.5 text-sm ${range === item ? "bg-primary text-primary-foreground" : "border border-border text-text-main"}`}
              type="button"
              onClick={() => setRange(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          {horizons.map((item) => (
            <button
              key={item}
              className={`rounded px-3 py-1.5 text-sm ${horizon === item ? "bg-primary text-primary-foreground" : "border border-border text-text-main"}`}
              type="button"
              onClick={() => setHorizon(item)}
            >
              {item} forecast
            </button>
          ))}
        </div>
      </div>
      {warnings.map((warning) => (
        <p
          key={warning}
          className="rounded border border-warning bg-warning/10 p-3 text-sm text-text-main"
        >
          {warning}
        </p>
      ))}
      <section className="flex flex-col gap-4">
        {dashboard.health.combos.map((combo) => (
          <article key={combo.comboId} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-text-main">{combo.comboName}</h2>
                <p className="text-sm text-text-muted">
                  {combo.strategy} · {combo.models.join(", ")}
                </p>
              </div>
              <div className="flex gap-4 text-sm">
                <span className="text-text-muted">
                  {combo.performance.totalRequests.toLocaleString()} requests
                </span>
                <span className="text-text-muted">
                  {Math.round(combo.performance.successRate)}% success
                </span>
                <span className="text-text-muted">
                  {Math.round(combo.performance.avgLatencyMs)}ms
                </span>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <section>
                <h3 className="text-sm font-medium text-text-main">Quota health</h3>
                <p className="mt-1 text-sm text-text-muted">
                  Worst remaining: {Math.round(combo.quotaHealth.worstRemainingPct)}%
                </p>
                <div className="mt-2 flex flex-col gap-2">
                  {combo.quotaHealth.providers.map((provider) => (
                    <div key={provider.provider}>
                      <div className="flex justify-between text-xs">
                        <span className="text-text-main">{provider.provider}</span>
                        <span className={provider.isExhausted ? "text-danger" : "text-text-muted"}>
                          {provider.isExhausted
                            ? "Exhausted"
                            : `${Math.round(provider.remainingPct)}%`}
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded bg-bg">
                        <div
                          className={
                            provider.isExhausted ? "h-full bg-danger" : "h-full bg-primary"
                          }
                          style={{ width: `${Math.max(0, Math.min(100, provider.remainingPct))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <section>
                <h3 className="text-sm font-medium text-text-main">Targets</h3>
                <div className="mt-2 flex flex-col gap-2">
                  {(combo.targetHealth ?? []).map((target) => (
                    <div
                      key={`${target.provider}/${target.model}`}
                      className="rounded border border-border bg-bg p-2 text-xs"
                    >
                      <div className="flex justify-between gap-2">
                        <span className="text-text-main">
                          {target.provider}/{target.model}
                        </span>
                        <span className="text-text-muted">{target.requests} requests</span>
                      </div>
                      <p className="mt-1 text-text-muted">
                        {Math.round(target.successRate)}% success ·{" "}
                        {Math.round(target.avgLatencyMs)}ms ·{" "}
                        {target.quotaIsExhausted
                          ? "quota exhausted"
                          : target.quotaRemainingPct == null
                            ? "quota unknown"
                            : `${Math.round(target.quotaRemainingPct)}% quota`}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </article>
        ))}
        {dashboard.health.combos.length === 0 && (
          <p className="rounded-lg border border-border bg-surface p-6 text-sm text-text-muted">
            No combo health data exists for this period.
          </p>
        )}
      </section>
    </div>
  );
}
