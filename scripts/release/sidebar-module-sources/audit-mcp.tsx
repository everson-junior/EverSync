import React, { useEffect, useState } from "react";
import { getHost } from "@eversync/plugin-host";

type AuditEntry = {
  id: number;
  toolName: string;
  outputSummary: string;
  durationMs: number;
  apiKeyId: string | null;
  success: boolean;
  errorCode: string | null;
  createdAt: string;
};

type AuditResponse = {
  entries?: AuditEntry[];
  total?: number;
};

type AuditStats = {
  totalCalls?: number;
  successRate?: number;
  avgDurationMs?: number;
  topTools?: Array<{ tool: string; count: number }>;
};

const PAGE_SIZE = 25;

export default function AuditMcpModule() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [tool, setTool] = useState("");
  const [success, setSuccess] = useState("all");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (tool) params.set("tool", tool);
    if (success !== "all") params.set("success", success);
    Promise.all([
      getHost().fetch(`/api/mcp/audit?${params}`),
      getHost().fetch("/api/mcp/audit/stats"),
    ])
      .then(async ([auditResponse, statsResponse]) => {
        if (!auditResponse.ok) throw new Error("Unable to load MCP audit records.");
        const audit = (await auditResponse.json()) as AuditResponse;
        const nextStats = statsResponse.ok ? ((await statsResponse.json()) as AuditStats) : null;
        setEntries(Array.isArray(audit.entries) ? audit.entries : []);
        setTotal(Number(audit.total ?? 0));
        setStats(nextStats);
      })
      .catch((cause: unknown) => {
        setEntries([]);
        setTotal(0);
        setStats(null);
        setError(cause instanceof Error ? cause.message : "Unable to load MCP audit records.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [offset, success]);

  const applyToolFilter = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOffset(0);
    load();
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-main">MCP audit</h1>
          <p className="mt-1 text-sm text-text-muted">
            Recent MCP tool activity and service health.
          </p>
        </div>
        <button
          className="rounded border border-border px-3 py-2 text-sm text-text-main"
          type="button"
          onClick={load}
          disabled={loading}
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </header>

      {stats && (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["Calls (24h)", stats.totalCalls ?? 0],
            [
              "Success rate",
              stats.successRate == null ? "No data" : `${Math.round(stats.successRate * 100)}%`,
            ],
            [
              "Average duration",
              stats.avgDurationMs == null ? "No data" : `${Math.round(stats.avgDurationMs)}ms`,
            ],
            ["Top tool", stats.topTools?.[0]?.tool ?? "No data"],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded border border-border bg-surface p-3">
              <p className="text-xs text-text-muted">{label}</p>
              <p className="mt-1 truncate text-lg font-semibold text-text-main">{value}</p>
            </div>
          ))}
        </section>
      )}

      <form
        className="grid gap-3 rounded border border-border bg-surface p-4 md:grid-cols-3"
        onSubmit={applyToolFilter}
      >
        <label className="text-sm text-text-main">
          Tool
          <input
            className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm"
            value={tool}
            onChange={(event) => setTool(event.target.value)}
            placeholder="Filter by tool"
          />
        </label>
        <label className="text-sm text-text-main">
          Result
          <select
            className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm"
            value={success}
            onChange={(event) => {
              setOffset(0);
              setSuccess(event.target.value);
            }}
          >
            <option value="all">All results</option>
            <option value="true">Success</option>
            <option value="false">Failure</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button
            className="rounded border border-border px-3 py-2 text-sm text-text-main"
            type="submit"
          >
            Apply
          </button>
          <button
            className="rounded border border-border px-3 py-2 text-sm text-text-main"
            type="button"
            onClick={() => {
              setTool("");
              setSuccess("all");
              setOffset(0);
            }}
          >
            Clear
          </button>
        </div>
      </form>

      <section className="overflow-x-auto rounded border border-border bg-surface">
        {error ? <p className="p-6 text-sm text-red-600">{error}</p> : null}
        {!error && loading ? (
          <p className="p-6 text-sm text-text-muted">Loading audit records...</p>
        ) : null}
        {!error && !loading && entries.length === 0 ? (
          <p className="p-6 text-sm text-text-muted">
            No MCP audit records match the current filters.
          </p>
        ) : null}
        {!error && !loading && entries.length > 0 ? (
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border text-xs text-text-muted">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Tool</th>
                <th className="px-3 py-2">Duration</th>
                <th className="px-3 py-2">Result</th>
                <th className="px-3 py-2">API key</th>
                <th className="px-3 py-2">Output</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-border">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-text-muted">
                    {new Date(entry.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-text-main">{entry.toolName}</td>
                  <td className="px-3 py-2 text-text-muted">{entry.durationMs}ms</td>
                  <td className="px-3 py-2">
                    {entry.success ? "Success" : (entry.errorCode ?? "Failure")}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-text-muted">
                    {entry.apiKeyId ?? "Not available"}
                  </td>
                  <td className="max-w-[260px] truncate px-3 py-2 text-xs text-text-muted">
                    {entry.outputSummary || "Not available"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>

      <div className="flex items-center justify-end gap-2 text-sm text-text-muted">
        <span>
          {total === 0
            ? "No records"
            : `${offset + 1}-${Math.min(offset + PAGE_SIZE, total)} of ${total}`}
        </span>
        <button
          className="rounded border border-border px-3 py-2 text-text-main disabled:opacity-40"
          type="button"
          disabled={loading || offset === 0}
          onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
        >
          Previous
        </button>
        <button
          className="rounded border border-border px-3 py-2 text-text-main disabled:opacity-40"
          type="button"
          disabled={loading || offset + PAGE_SIZE >= total}
          onClick={() => setOffset((current) => current + PAGE_SIZE)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
