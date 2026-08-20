import React, { useEffect, useState } from "react";
import { getHost } from "@eversync/plugin-host";

export default function ProfileModule() {
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    getHost()
      .fetch("/api/gamification/level")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        setData(d);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Unable to load profile."));
  }, []);
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <header>
        <h1 className="text-2xl font-bold text-text-main">Profile</h1>
        <p className="text-sm text-text-muted">Your gamification level and progress.</p>
      </header>
      {data ? (
        <pre className="rounded border border-border bg-surface p-4 text-xs text-text-main">
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : (
        <p className="text-sm text-text-muted">Loading profile...</p>
      )}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
