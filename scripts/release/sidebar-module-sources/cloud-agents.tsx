import React, { useEffect, useState } from "react";
import { getHost } from "@eversync/plugin-host";
export default function CloudAgentsModule() {
  const [d, s] = useState<unknown>();
  const [e, se] = useState("");
  useEffect(() => {
    getHost()
      .fetch("/api/v1/agents/tasks")
      .then(async (r) => {
        const x = await r.json();
        if (!r.ok) throw new Error(x.error?.message || `HTTP ${r.status}`);
        s(x);
      })
      .catch((x: unknown) => se(x instanceof Error ? x.message : "Unable to load cloud agents."));
  }, []);
  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4">
      <h1 className="text-2xl font-bold text-text-main">Cloud agents</h1>
      {d ? (
        <pre className="max-h-[36rem] overflow-auto rounded border border-border bg-surface p-4 text-xs">
          {JSON.stringify(d, null, 2)}
        </pre>
      ) : (
        <p className="text-sm text-text-muted">Loading agent tasks...</p>
      )}
      {e ? <p className="text-sm text-red-600">{e}</p> : null}
    </main>
  );
}
