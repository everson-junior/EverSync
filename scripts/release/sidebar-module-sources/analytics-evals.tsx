import React, { useEffect, useState } from "react";
import { getHost } from "@eversync/plugin-host";

type Suite = {
  id: string;
  name: string;
  description?: string;
  caseCount?: number;
  cases?: unknown[];
};
type Run = {
  id?: string;
  suiteId?: string;
  suiteName?: string;
  createdAt?: string;
  summary?: { passed?: number; failed?: number; total?: number; passRate?: number };
};
type Scorecard = {
  overall?: { passRate?: number; total?: number };
  summary?: { passRate?: number; total?: number };
};
type Dashboard = {
  suites: Suite[];
  recentRuns: Run[];
  scorecard: Scorecard | null;
  targets: Array<{ key: string; label: string }>;
};

export default function AnalyticsEvalsModule() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => {
    setData(null);
    getHost()
      .fetch("/api/evals")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((value) => setData(value as Dashboard))
      .catch(() => setError("Unable to load evaluations."));
  };
  useEffect(() => {
    load();
  }, []);
  if (!data)
    return <p className="p-6 text-sm text-text-muted">{error ?? "Loading evaluations..."}</p>;
  const totalCases = data.suites.reduce(
    (total, suite) => total + (suite.caseCount ?? suite.cases?.length ?? 0),
    0
  );
  const score = data.scorecard?.overall ?? data.scorecard?.summary;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-main">Evaluations</h1>
          <p className="mt-1 text-sm text-text-muted">
            Suite inventory, recent runs, targets, and historical scorecard.
          </p>
        </div>
        <button
          className="rounded border border-border px-3 py-2 text-sm text-text-main"
          type="button"
          onClick={load}
        >
          Refresh
        </button>
      </header>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Suites", data.suites.length],
          ["Test cases", totalCases],
          ["Targets", data.targets.length],
          ["Scorecard", score?.passRate == null ? "No data" : `${Math.round(score.passRate)}%`],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-lg border border-border bg-surface p-3">
            <p className="text-xs text-text-muted">{label}</p>
            <p className="mt-1 text-lg font-semibold text-text-main">{value}</p>
          </div>
        ))}
      </section>
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-text-main">Suites</h2>
          <div className="mt-3 flex flex-col gap-2">
            {data.suites.map((suite) => (
              <article key={suite.id} className="rounded border border-border bg-bg p-3">
                <div className="flex justify-between gap-3">
                  <strong className="text-sm text-text-main">{suite.name}</strong>
                  <span className="text-xs text-text-muted">
                    {suite.caseCount ?? suite.cases?.length ?? 0} cases
                  </span>
                </div>
                {suite.description && (
                  <p className="mt-1 text-xs text-text-muted">{suite.description}</p>
                )}
              </article>
            ))}
            {data.suites.length === 0 && (
              <p className="text-sm text-text-muted">No evaluation suites are configured.</p>
            )}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-text-main">Recent runs</h2>
          <div className="mt-3 flex flex-col gap-2">
            {data.recentRuns.map((run, index) => (
              <article
                key={run.id ?? `${run.suiteId}-${index}`}
                className="rounded border border-border bg-bg p-3"
              >
                <div className="flex justify-between gap-3">
                  <strong className="text-sm text-text-main">
                    {run.suiteName ?? run.suiteId ?? "Evaluation run"}
                  </strong>
                  <span className="text-xs text-text-muted">
                    {run.summary?.passRate == null
                      ? "No summary"
                      : `${Math.round(run.summary.passRate)}% passed`}
                  </span>
                </div>
                <p className="mt-1 text-xs text-text-muted">
                  {run.summary?.total ?? 0} total · {run.summary?.passed ?? 0} passed ·{" "}
                  {run.summary?.failed ?? 0} failed
                  {run.createdAt ? ` · ${new Date(run.createdAt).toLocaleString()}` : ""}
                </p>
              </article>
            ))}
            {data.recentRuns.length === 0 && (
              <p className="text-sm text-text-muted">No evaluation runs recorded yet.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
