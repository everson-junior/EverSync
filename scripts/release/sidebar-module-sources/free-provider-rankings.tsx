import React, { useEffect, useState } from "react";
import { getHost } from "@eversync/plugin-host";

type Ranking = {
  id: string;
  name: string;
  category: string;
  topModel?: { modelName?: string; score?: number };
  averageScore: number;
  modelCount: number;
};
export default function FreeProviderRankingsModule() {
  const [rankings, setRankings] = useState<Ranking[]>([]);
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const suffix = category ? `?category=${encodeURIComponent(category)}` : "";
    getHost()
      .fetch(`/api/free-provider-rankings${suffix}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        setRankings(d.rankings || []);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Unable to load rankings."));
  }, [category]);
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <header>
        <h1 className="text-2xl font-bold text-text-main">Free provider rankings</h1>
        <p className="text-sm text-text-muted">Compare available providers by task-fit score.</p>
      </header>
      <select
        className="rounded border border-border bg-bg px-3 py-2 text-sm"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
      >
        <option value="">All categories</option>
        {["default", "coding", "review", "documentation", "debugging"].map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
      <div className="overflow-auto rounded border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-muted">
              <th className="p-3">Provider</th>
              <th className="p-3">Top model</th>
              <th className="p-3">Score</th>
              <th className="p-3">Models</th>
              <th className="p-3">Type</th>
            </tr>
          </thead>
          <tbody>
            {rankings.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-3 font-medium text-text-main">{r.name}</td>
                <td className="p-3">{r.topModel?.modelName || "-"}</td>
                <td className="p-3">{r.topModel?.score ?? r.averageScore}</td>
                <td className="p-3">{r.modelCount}</td>
                <td className="p-3">{r.category}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
