import React, { useEffect, useState } from "react";
import { getHost } from "@eversync/plugin-host";

type Health = Record<string, unknown>;
export default function RuntimeModule() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState("");
  const load = () =>
    getHost()
      .fetch("/api/monitoring/health")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        setHealth(d);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Unable to load runtime health.")
      );
  useEffect(() => {
    load();
  }, []);
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <header className="flex justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-main">Runtime</h1>
          <p className="text-sm text-text-muted">Current service health and runtime state.</p>
        </div>
        <button
          className="rounded border border-border px-3 py-2 text-sm"
          type="button"
          onClick={load}
        >
          Refresh
        </button>
      </header>
      {health ? (
        <pre className="max-h-[36rem] overflow-auto rounded border border-border bg-surface p-4 text-xs text-text-main">
          {JSON.stringify(health, null, 2)}
        </pre>
      ) : (
        <p className="text-sm text-text-muted">Loading runtime state...</p>
      )}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
