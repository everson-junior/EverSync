import React, { useEffect, useState } from "react";
import { getHost } from "@eversync/plugin-host";

type Severity = "info" | "warning" | "critical";

type AuditEntry = {
  id: number;
  timestamp: string;
  action: string;
  actor: string;
  target?: string | null;
  resourceType?: string | null;
  status?: string | null;
  ip_address?: string | null;
  ip?: string | null;
  details?: unknown;
  metadata?: unknown;
};

const PAGE_SIZE = 50;

function severityFor(entry: AuditEntry): Severity {
  const action = entry.action.toLowerCase();
  const status = (entry.status ?? "").toLowerCase();
  if (
    ["error", "failed", "blocked"].includes(status) ||
    /blocked|denied|violation|delete|remove/.test(action)
  )
    return "critical";
  if (status === "warning" || /warning|validate/.test(action)) return "warning";
  return "info";
}

function detailsFor(entry: AuditEntry): string {
  const value = entry.details ?? entry.metadata;
  if (value == null) return "No additional details.";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function AuditModule() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [severity, setSeverity] = useState<"all" | Severity>("all");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (action) params.set("action", action);
    if (actor) params.set("actor", actor);
    getHost()
      .fetch(`/api/compliance/audit-log?${params}`)
      .then(async (response) => {
        const body = (await response.json().catch(() => [])) as AuditEntry[] | { error?: string };
        if (!response.ok)
          throw new Error(
            Array.isArray(body)
              ? "Unable to load audit entries."
              : (body.error ?? "Unable to load audit entries.")
          );
        setEntries(Array.isArray(body) ? body : []);
        setTotal(Number(response.headers.get("x-total-count") ?? 0));
      })
      .catch((cause: unknown) => {
        setEntries([]);
        setTotal(0);
        setError(cause instanceof Error ? cause.message : "Unable to load audit entries.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [offset]);

  const applyFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOffset(0);
    load();
  };

  const visibleEntries =
    severity === "all" ? entries : entries.filter((entry) => severityFor(entry) === severity);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-main">Compliance audit</h1>
          <p className="mt-1 text-sm text-text-muted">
            Review compliance events, actors, and affected resources.
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

      <form
        className="grid gap-3 rounded border border-border bg-surface p-4 md:grid-cols-4"
        onSubmit={applyFilters}
      >
        <label className="text-sm text-text-main">
          Event type
          <input
            className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm"
            value={action}
            onChange={(event) => setAction(event.target.value)}
            placeholder="Filter by action"
          />
        </label>
        <label className="text-sm text-text-main">
          Actor
          <input
            className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm"
            value={actor}
            onChange={(event) => setActor(event.target.value)}
            placeholder="Filter by actor"
          />
        </label>
        <label className="text-sm text-text-main">
          Severity
          <select
            className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm"
            value={severity}
            onChange={(event) => setSeverity(event.target.value as "all" | Severity)}
          >
            <option value="all">All severities</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
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
              setAction("");
              setActor("");
              setSeverity("all");
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
          <p className="p-6 text-sm text-text-muted">Loading audit entries...</p>
        ) : null}
        {!error && !loading && visibleEntries.length === 0 ? (
          <p className="p-6 text-sm text-text-muted">No audit entries match the current filters.</p>
        ) : null}
        {!error && !loading && visibleEntries.length > 0 ? (
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="border-b border-border text-xs text-text-muted">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2">Severity</th>
                <th className="px-3 py-2">IP</th>
                <th className="px-3 py-2">Actor</th>
                <th className="px-3 py-2">Target</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Details</th>
              </tr>
            </thead>
            <tbody>
              {visibleEntries.map((entry) => (
                <tr key={entry.id} className="border-b border-border">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-text-muted">
                    {new Date(entry.timestamp).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-text-main">{entry.action}</td>
                  <td className="px-3 py-2 text-text-main">{severityFor(entry)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-text-muted">
                    {entry.ip_address ?? entry.ip ?? "Not available"}
                  </td>
                  <td className="px-3 py-2 text-text-main">{entry.actor || "System"}</td>
                  <td className="max-w-[180px] truncate px-3 py-2 text-text-muted">
                    {entry.target ?? entry.resourceType ?? "Not available"}
                  </td>
                  <td className="px-3 py-2 text-text-muted">{entry.status ?? "Not available"}</td>
                  <td className="px-3 py-2">
                    <button
                      className="rounded border border-border px-2 py-1 text-xs text-text-main"
                      type="button"
                      onClick={() => setSelected(entry)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>

      {selected ? (
        <section className="rounded border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-text-main">{selected.action}</h2>
            <button
              className="rounded border border-border px-2 py-1 text-xs text-text-main"
              type="button"
              onClick={() => setSelected(null)}
            >
              Close
            </button>
          </div>
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-xs text-text-muted">
            {detailsFor(selected)}
          </pre>
        </section>
      ) : null}

      <div className="flex items-center justify-end gap-2 text-sm text-text-muted">
        <span>
          {total === 0
            ? "No entries"
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
