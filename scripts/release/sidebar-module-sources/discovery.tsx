import React, { useEffect, useState } from "react";
import { getHost } from "@eversync/plugin-host";
export default function DiscoveryModule() {
  const [d, s] = useState<unknown>();
  const [e, se] = useState("");
  const load = () =>
    getHost()
      .fetch("/api/discovery/results")
      .then(async (r) => {
        const x = await r.json();
        if (!r.ok) throw new Error(x.error || `HTTP ${r.status}`);
        s(x);
      })
      .catch((x: unknown) =>
        se(x instanceof Error ? x.message : "Unable to load discovery results.")
      );
  useEffect(() => {
    load();
  }, []);
  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4">
      <header className="flex justify-between">
        <h1 className="text-2xl font-bold text-text-main">Discovery</h1>
        <button className="rounded border border-border px-3 py-2 text-sm" onClick={load}>
          Refresh
        </button>
      </header>
      {d ? (
        <pre className="max-h-[36rem] overflow-auto rounded border border-border bg-surface p-4 text-xs">
          {JSON.stringify(d, null, 2)}
        </pre>
      ) : (
        <p className="text-sm text-text-muted">Loading discovery results...</p>
      )}
      {e ? <p className="text-sm text-red-600">{e}</p> : null}
    </main>
  );
}
