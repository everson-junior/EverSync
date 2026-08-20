import React, { useEffect, useState } from "react";
import { getHost } from "@eversync/plugin-host";

type Webhook = { id?: string; name?: string; url?: string; enabled?: boolean; events?: string[] };
export default function WebhooksModule() {
  const [hooks, setHooks] = useState<Webhook[]>([]);
  const [error, setError] = useState("");
  const load = () =>
    getHost()
      .fetch("/api/webhooks")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        setHooks(d.webhooks || d.data || []);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Unable to load webhooks."));
  useEffect(() => {
    load();
  }, []);
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <header className="flex justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-main">Webhooks</h1>
          <p className="text-sm text-text-muted">Configured outbound event deliveries.</p>
        </div>
        <button
          className="rounded border border-border px-3 py-2 text-sm"
          type="button"
          onClick={load}
        >
          Refresh
        </button>
      </header>
      <div className="space-y-2">
        {hooks.map((hook, index) => (
          <article key={hook.id || index} className="rounded border border-border bg-surface p-4">
            <h2 className="font-semibold text-text-main">{hook.name || hook.id || "Webhook"}</h2>
            <p className="mt-1 break-all text-sm text-text-muted">{hook.url || "No URL"}</p>
            <p className="mt-2 text-xs text-text-muted">
              {hook.enabled === false ? "Disabled" : "Enabled"}{" "}
              {hook.events?.length ? `- ${hook.events.join(", ")}` : ""}
            </p>
          </article>
        ))}
      </div>
      {!hooks.length && !error ? (
        <p className="text-sm text-text-muted">No webhooks configured.</p>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
