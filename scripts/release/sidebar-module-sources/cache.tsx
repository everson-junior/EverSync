import React, { useEffect, useState } from "react";
import { getHost } from "@eversync/plugin-host";

export default function CacheModule() {
  const [data, setData] = useState<unknown>();
  const [error, setError] = useState("");
  const load = () =>
    getHost()
      .fetch("/api/cache")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        setData(d);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Unable to load cache."));
  useEffect(() => {
    load();
  }, []);
  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4">
      <header className="flex justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-main">Cache</h1>
          <p className="text-sm text-text-muted">Cache state and statistics.</p>
        </div>
        <button className="rounded border border-border px-3 py-2 text-sm" onClick={load}>
          Refresh
        </button>
      </header>
      {data ? (
        <pre className="max-h-[36rem] overflow-auto rounded border border-border bg-surface p-4 text-xs">
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : (
        <p className="text-sm text-text-muted">Loading cache...</p>
      )}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </main>
  );
}
