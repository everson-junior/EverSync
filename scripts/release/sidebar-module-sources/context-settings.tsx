import React, { useEffect, useState } from "react";
import { getHost } from "@eversync/plugin-host";

type Settings = {
  enabled: boolean;
  defaultMode: string;
  autoTriggerMode: string;
  autoTriggerTokens: number;
  cacheMinutes: number;
  preserveSystemPrompt: boolean;
  preserveSystemPromptMode: "always" | "whenNoCache" | "never";
  engines: Record<string, { enabled: boolean; level?: string }>;
};

const MODES = ["off", "lite", "standard", "aggressive", "ultra", "rtk", "omniglyph", "stacked"];

export default function ContextSettingsModule() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    getHost()
      .fetch("/api/settings/compression")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setSettings(data as Settings | null))
      .catch(() => setMessage("Unable to load compression settings."));
  }, []);

  const save = async (patch: Partial<Settings>) => {
    if (!settings) return;
    setSettings({ ...settings, ...patch });
    setSaving(true);
    setMessage(null);
    try {
      const response = await getHost().fetch("/api/settings/compression", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      setMessage(response.ok ? "Settings saved." : "Unable to save settings.");
    } catch {
      setMessage("Unable to save settings.");
    } finally {
      setSaving(false);
    }
  };

  if (!settings)
    return <p className="p-6 text-sm text-text-muted">Loading compression settings...</p>;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-4">
      <header>
        <h1 className="text-2xl font-bold text-text-main">Compression Settings</h1>
        <p className="mt-1 text-sm text-text-muted">
          Configure the global compression pipeline. Individual engine controls remain available on
          their own Context modules.
        </p>
      </header>
      <section className="rounded-lg border border-border bg-surface p-4">
        <label className="flex items-center justify-between gap-4 text-sm text-text-main">
          <span>
            <strong className="block">Enable compression</strong>
            <span className="text-xs text-text-muted">
              Allow eligible requests to use the configured pipeline.
            </span>
          </span>
          <input
            type="checkbox"
            disabled={saving}
            checked={settings.enabled}
            onChange={(event) => void save({ enabled: event.target.checked })}
          />
        </label>
      </section>
      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-text-main">Defaults</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-text-main">
            <span>Default mode</span>
            <select
              className="rounded border border-border bg-bg px-2 py-1"
              disabled={saving}
              value={settings.defaultMode}
              onChange={(event) => void save({ defaultMode: event.target.value })}
            >
              {MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-text-main">
            <span>Auto-trigger mode</span>
            <select
              className="rounded border border-border bg-bg px-2 py-1"
              disabled={saving}
              value={settings.autoTriggerMode}
              onChange={(event) => void save({ autoTriggerMode: event.target.value })}
            >
              {MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-text-main">
            <span>Auto-trigger tokens</span>
            <input
              className="rounded border border-border bg-bg px-2 py-1"
              type="number"
              min="0"
              disabled={saving}
              value={settings.autoTriggerTokens}
              onChange={(event) =>
                void save({ autoTriggerTokens: Number(event.target.value) || 0 })
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-text-main">
            <span>Cache minutes</span>
            <input
              className="rounded border border-border bg-bg px-2 py-1"
              type="number"
              min="1"
              max="60"
              disabled={saving}
              value={settings.cacheMinutes}
              onChange={(event) =>
                void save({ cacheMinutes: Math.max(1, Number(event.target.value) || 1) })
              }
            />
          </label>
        </div>
      </section>
      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-text-main">System prompt</h2>
        <label className="mt-3 flex items-center gap-2 text-sm text-text-main">
          <input
            type="checkbox"
            disabled={saving}
            checked={settings.preserveSystemPrompt}
            onChange={(event) => void save({ preserveSystemPrompt: event.target.checked })}
          />
          Preserve system prompt
        </label>
        <label className="mt-3 flex flex-col gap-1 text-sm text-text-main">
          <span>Preservation mode</span>
          <select
            className="rounded border border-border bg-bg px-2 py-1"
            disabled={saving}
            value={settings.preserveSystemPromptMode}
            onChange={(event) =>
              void save({
                preserveSystemPromptMode: event.target
                  .value as Settings["preserveSystemPromptMode"],
              })
            }
          >
            <option value="always">Always</option>
            <option value="whenNoCache">When no cache is available</option>
            <option value="never">Never</option>
          </select>
        </label>
        {message && (
          <p className="mt-4 text-sm text-text-muted" role="status">
            {message}
          </p>
        )}
      </section>
    </div>
  );
}
