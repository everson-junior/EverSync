import React, { useEffect, useState } from "react";
import { getHost } from "@eversync/plugin-host";

export default function TokensModule() {
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    getHost()
      .fetch("/api/gamification/servers")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        setData(d);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Unable to load token settings.")
      );
  }, []);
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <header>
        <h1 className="text-2xl font-bold text-text-main">Tokens</h1>
        <p className="text-sm text-text-muted">Token and community server information.</p>
      </header>
      {data ? (
        <pre className="rounded border border-border bg-surface p-4 text-xs text-text-main">
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : (
        <p className="text-sm text-text-muted">Loading token data...</p>
      )}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
