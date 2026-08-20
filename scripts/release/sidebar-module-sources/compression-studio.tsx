import React, { useState } from "react";
import { getHost } from "@eversync/plugin-host";
export default function CompressionStudioModule() {
  const [i, si] = useState("");
  const [d, s] = useState<unknown>();
  const [e, se] = useState("");
  const run = () => {
    getHost()
      .fetch("/api/compression/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: i }),
      })
      .then(async (r) => {
        const x = await r.json();
        if (!r.ok) throw new Error(x.error || `HTTP ${r.status}`);
        s(x);
      })
      .catch((x: unknown) => se(x instanceof Error ? x.message : "Unable to preview compression."));
  };
  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4">
      <h1 className="text-2xl font-bold text-text-main">Compression studio</h1>
      <textarea
        className="min-h-40 w-full rounded border border-border bg-bg p-3 text-sm"
        value={i}
        onChange={(x) => si(x.target.value)}
        placeholder="Text to preview"
      />
      <button className="rounded border border-border px-3 py-2 text-sm" onClick={run}>
        Preview
      </button>
      {d ? (
        <pre className="max-h-[36rem] overflow-auto rounded border border-border bg-surface p-4 text-xs">
          {JSON.stringify(d, null, 2)}
        </pre>
      ) : null}
      {e ? <p className="text-sm text-red-600">{e}</p> : null}
    </main>
  );
}
