import React, { useEffect, useState } from "react";
import { getHost } from "@eversync/plugin-host";
export default function CostsBudgetModule() {
  const [data, setData] = useState<unknown>();
  const [error, setError] = useState("");
  useEffect(() => {
    getHost()
      .fetch("/api/usage/budget")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        setData(d);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Unable to load budgets."));
  }, []);
  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4">
      <h1 className="text-2xl font-bold text-text-main">Cost budgets</h1>
      <p className="text-sm text-text-muted">Budget status and usage limits.</p>
      {data ? (
        <pre className="max-h-[36rem] overflow-auto rounded border border-border bg-surface p-4 text-xs">
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : (
        <p className="text-sm text-text-muted">Loading budgets...</p>
      )}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </main>
  );
}
