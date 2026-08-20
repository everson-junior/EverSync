import React, { useEffect, useState } from "react";
import { getHost } from "@eversync/plugin-host";

type Provider = {
  provider: string;
  totalRequests: number;
  successfulRequests: number;
  avgLatencyMs: number;
  totalTokensIn: number;
  totalTokensOut: number;
};
export default function ProviderStatsModule() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [error, setError] = useState("");
  const load = () =>
    getHost()
      .fetch("/api/provider-stats")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        setProviders(data.providers || []);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Unable to load provider statistics.")
      );
  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-main">Provider statistics</h1>
          <p className="text-sm text-text-muted">Live request, token, and latency metrics.</p>
        </div>
        <button
          className="rounded border border-border px-3 py-2 text-sm"
          type="button"
          onClick={load}
        >
          Refresh
        </button>
      </header>
      <div className="overflow-auto rounded border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="text-left text-text-muted">
            <tr>
              <th className="p-3">Provider</th>
              <th className="p-3">Requests</th>
              <th className="p-3">Success</th>
              <th className="p-3">Latency</th>
              <th className="p-3">Tokens in/out</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((p) => (
              <tr key={p.provider} className="border-t border-border">
                <td className="p-3 font-medium text-text-main">{p.provider}</td>
                <td className="p-3">{p.totalRequests}</td>
                <td className="p-3">{p.successfulRequests}</td>
                <td className="p-3">{Math.round(p.avgLatencyMs)}ms</td>
                <td className="p-3">
                  {p.totalTokensIn} / {p.totalTokensOut}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
