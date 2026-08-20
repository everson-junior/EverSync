import React, { useEffect, useState } from "react";
import { getHost } from "@eversync/plugin-host";

type Engines = Record<string, { enabled: boolean; level?: string }>;

export default function ContextOmniGlyphModule() {
  const [engines, setEngines] = useState<Engines>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    getHost()
      .fetch("/api/settings/compression")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setEngines(data?.engines ?? {}))
      .catch(() => setMessage("Unable to load OmniGlyph settings."))
      .finally(() => setLoading(false));
  }, []);

  const enabled = engines.omniglyph?.enabled === true;
  const toggle = async (next: boolean) => {
    const nextEngines = {
      ...engines,
      omniglyph: { ...(engines.omniglyph ?? { enabled: false }), enabled: next },
    };
    setEngines(nextEngines);
    setSaving(true);
    setMessage(null);
    try {
      const response = await getHost().fetch("/api/settings/compression", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engines: nextEngines }),
      });
      setMessage(response.ok ? "Settings saved." : "Unable to save settings.");
    } catch {
      setMessage("Unable to save settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-4">
      <header>
        <h1 className="text-2xl font-bold text-text-main">OmniGlyph</h1>
        <p className="mt-1 text-sm text-text-muted">
          Preview context-as-image compression for compatible requests.
        </p>
      </header>
      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-text-main">Engine status</h2>
        <p className="mt-2 text-sm text-text-muted">
          OmniGlyph only runs when its request compatibility gates pass. Disabled requests stay
          unchanged.
        </p>
        <label className="mt-5 flex items-center justify-between gap-4 text-sm text-text-main">
          <span>
            <strong className="block">Enable OmniGlyph</strong>
            <span className="text-xs text-text-muted">
              Use context-as-image compression when eligible.
            </span>
          </span>
          <input
            type="checkbox"
            checked={enabled}
            disabled={loading || saving}
            onChange={(event) => void toggle(event.target.checked)}
          />
        </label>
        {message && (
          <p className="mt-3 text-sm text-text-muted" role="status">
            {message}
          </p>
        )}
      </section>
      <section className="rounded-lg border border-border bg-surface p-4 text-sm text-text-muted">
        <h2 className="font-semibold text-text-main">Compatibility</h2>
        <p className="mt-2">
          The engine validates model, transport, input format, and expected savings before it
          compresses a request.
        </p>
      </section>
    </div>
  );
}
