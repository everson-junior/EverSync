import React, { useEffect, useState } from "react";
import { getHost } from "@eversync/plugin-host";

type AuditRow = {
  id?: string;
  action?: string;
  actor?: string;
  createdAt?: string;
  timestamp?: string;
  severity?: string;
  details?: unknown;
};
export default function ActivityModule() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [error, setError] = useState("");
  const load = () =>
    getHost()
      .fetch("/api/compliance/audit-log?limit=100")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        setRows(d.entries || d.logs || d.data || []);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Unable to load activity."));
  useEffect(() => {
    load();
  }, []);
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <header className="flex justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-main">Activity</h1>
          <p className="text-sm text-text-muted">Recent compliance and operational activity.</p>
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
        {rows.map((row, index) => (
          <article key={row.id || index} className="rounded border border-border bg-surface p-3">
            <div className="flex justify-between gap-3">
              <strong className="text-sm text-text-main">{row.action || "Activity event"}</strong>
              <span className="text-xs text-text-muted">
                {row.createdAt || row.timestamp || ""}
              </span>
            </div>
            <p className="mt-1 text-sm text-text-muted">
              {row.actor || "System"}
              {row.severity ? ` - ${row.severity}` : ""}
            </p>
          </article>
        ))}
      </div>
      {!rows.length && !error ? (
        <p className="text-sm text-text-muted">No recent activity.</p>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
