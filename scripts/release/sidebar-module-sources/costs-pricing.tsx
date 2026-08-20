import React, { useEffect, useState } from "react";
import { getHost } from "@eversync/plugin-host";

export default function CostsPricingModule() {
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState("");
  const load = () =>
    getHost()
      .fetch("/api/pricing")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        setData(d);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Unable to load pricing."));
  useEffect(() => {
    load();
  }, []);
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <header className="flex justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-main">Model pricing</h1>
          <p className="text-sm text-text-muted">Published provider and model pricing data.</p>
        </div>
        <button
          className="rounded border border-border px-3 py-2 text-sm"
          type="button"
          onClick={load}
        >
          Refresh
        </button>
      </header>
      {data ? (
        <pre className="max-h-[36rem] overflow-auto rounded border border-border bg-surface p-4 text-xs text-text-main">
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : (
        <p className="text-sm text-text-muted">Loading pricing...</p>
      )}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
