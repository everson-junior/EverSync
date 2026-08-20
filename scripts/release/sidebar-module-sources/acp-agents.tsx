import React, { useEffect, useState } from "react";
import { getHost } from "@eversync/plugin-host";

type Agent = {
  id?: string;
  name?: string;
  description?: string;
  enabled?: boolean;
  status?: string;
};
export default function AcpAgentsModule() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [error, setError] = useState("");
  const load = () =>
    getHost()
      .fetch("/api/acp/agents")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        setAgents(d.agents || d.data || []);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Unable to load ACP agents.")
      );
  useEffect(() => {
    load();
  }, []);
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <header className="flex justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-main">ACP agents</h1>
          <p className="text-sm text-text-muted">Configured Agent Communication Protocol agents.</p>
        </div>
        <button
          className="rounded border border-border px-3 py-2 text-sm"
          type="button"
          onClick={load}
        >
          Refresh
        </button>
      </header>
      <div className="grid gap-3 md:grid-cols-2">
        {agents.map((agent, index) => (
          <article key={agent.id || index} className="rounded border border-border bg-surface p-4">
            <h2 className="font-semibold text-text-main">{agent.name || agent.id || "Agent"}</h2>
            <p className="mt-1 text-sm text-text-muted">
              {agent.description || "No description provided."}
            </p>
            <p className="mt-3 text-xs text-text-muted">
              {agent.status || (agent.enabled ? "Enabled" : "Disabled")}
            </p>
          </article>
        ))}
      </div>
      {!agents.length && !error ? (
        <p className="text-sm text-text-muted">No ACP agents configured.</p>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
