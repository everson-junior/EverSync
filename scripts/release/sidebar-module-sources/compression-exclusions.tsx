import React, { useEffect, useState } from "react";
import { getHost } from "@eversync/plugin-host";

export default function CompressionExclusionsModule() {
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    getHost()
      .fetch("/api/settings/compression")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (Array.isArray(data?.exclusions)) setRaw(data.exclusions.join("\n"));
      })
      .catch(() => setMessage("Unable to load exclusions."))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    const exclusions = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    setSaving(true);
    setMessage(null);
    try {
      const response = await getHost().fetch("/api/settings/compression", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exclusions }),
      });
      setMessage(response.ok ? "Exclusions saved." : "Unable to save exclusions.");
    } catch {
      setMessage("Unable to save exclusions.");
    } finally {
      setSaving(false);
    }
  };

  const count = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean).length;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-4">
      <header>
        <h1 className="text-2xl font-bold text-text-main">Compression Exclusions</h1>
        <p className="mt-1 text-sm text-text-muted">
          Models and endpoints listed here are never compressed. Use one pattern per line;{" "}
          <code>*</code> is supported.
        </p>
      </header>
      <section className="rounded-lg border border-border bg-surface p-4">
        <label className="flex flex-col gap-2 text-sm text-text-main">
          <span className="font-semibold">Excluded patterns</span>
          <textarea
            className="h-64 rounded border border-border bg-bg p-3 font-mono text-sm text-text-main"
            disabled={loading || saving}
            placeholder={"provider/model\nprovider/*"}
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
          />
        </label>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-sm text-text-muted">
            {count} {count === 1 ? "pattern" : "patterns"}
          </span>
          <button
            className="rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            type="button"
            disabled={loading || saving}
            onClick={() => void save()}
          >
            {saving ? "Saving..." : "Save exclusions"}
          </button>
        </div>
        {message && (
          <p className="mt-3 text-sm text-text-muted" role="status">
            {message}
          </p>
        )}
      </section>
    </div>
  );
}
