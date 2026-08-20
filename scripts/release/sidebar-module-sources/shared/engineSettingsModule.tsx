import React, { useEffect, useState } from "react";
import { getHost } from "@eversync/plugin-host";

type Field = {
  key: string;
  label: string;
  description?: string;
  type: "boolean" | "number" | "string" | "select";
  defaultValue?: unknown;
  min?: number;
  max?: number;
  options?: Array<{ value: string; label: string }>;
};

type Engine = { id: string; name: string; description?: string; configSchema?: Field[] };
type Analytics = { runs?: number; tokensSaved?: number; avgSavingsPercent?: number };

const number = (value?: number) => new Intl.NumberFormat().format(value ?? 0);

export function createEngineSettingsModule(
  engineId: string,
  settingsKey: string | null,
  description: string
) {
  return function EngineSettingsModule() {
    const [engine, setEngine] = useState<Engine | null>(null);
    const [config, setConfig] = useState<Record<string, unknown>>({});
    const [analytics, setAnalytics] = useState<Analytics | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
      let cancelled = false;
      const asJson = (response: Response) => (response.ok ? response.json() : null);
      Promise.all([
        getHost().fetch("/api/compression/engines").then(asJson),
        getHost().fetch("/api/settings/compression").then(asJson),
        getHost().fetch(`/api/context/analytics/engine?engineId=${engineId}&days=7`).then(asJson),
      ])
        .then(([enginesData, settingsData, analyticsData]) => {
          if (cancelled) return;
          const found = (enginesData?.engines as Engine[] | undefined)?.find(
            (candidate) => candidate.id === engineId
          );
          const defaults = Object.fromEntries(
            (found?.configSchema ?? [])
              .filter((field) => field.key !== "enabled")
              .map((field) => [field.key, field.defaultValue])
          );
          setEngine(found ?? null);
          setConfig({ ...defaults, ...(settingsKey ? (settingsData?.[settingsKey] ?? {}) : {}) });
          setAnalytics(analyticsData as Analytics | null);
        })
        .catch(() => {
          if (!cancelled) setMessage("Unable to load this engine's settings.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, []);

    const save = async () => {
      if (!settingsKey) return;
      setSaving(true);
      setMessage(null);
      try {
        const response = await getHost().fetch("/api/settings/compression", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [settingsKey]: config }),
        });
        setMessage(response.ok ? "Settings saved." : "Unable to save settings.");
      } catch {
        setMessage("Unable to save settings.");
      } finally {
        setSaving(false);
      }
    };

    if (loading) return <p className="p-6 text-sm text-text-muted">Loading {engineId}...</p>;
    if (!engine) return <p className="p-6 text-sm text-text-muted">This engine is unavailable.</p>;
    const fields = (engine.configSchema ?? []).filter((field) => field.key !== "enabled");

    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-5 p-4">
        <header>
          <h1 className="text-2xl font-bold text-text-main">{engine.name}</h1>
          <p className="mt-1 text-sm text-text-muted">{engine.description ?? description}</p>
        </header>
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            ["Runs", number(analytics?.runs)],
            ["Tokens saved", number(analytics?.tokensSaved)],
            ["Savings", `${analytics?.avgSavingsPercent ?? 0}%`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border bg-surface p-3">
              <p className="text-xs uppercase text-text-muted">{label}</p>
              <p className="mt-1 text-lg font-semibold text-text-main">{value}</p>
            </div>
          ))}
        </section>
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-text-main">Configuration</h2>
          {settingsKey ? (
            <div className="mt-4 flex flex-col gap-4">
              {fields.map((field) => {
                const value = config[field.key] ?? field.defaultValue;
                return (
                  <label key={field.key} className="flex flex-col gap-1 text-sm text-text-main">
                    <span className="font-medium">{field.label}</span>
                    {field.description && (
                      <span className="text-xs text-text-muted">{field.description}</span>
                    )}
                    {field.type === "boolean" && (
                      <input
                        type="checkbox"
                        checked={Boolean(value)}
                        onChange={(event) =>
                          setConfig((current) => ({
                            ...current,
                            [field.key]: event.target.checked,
                          }))
                        }
                      />
                    )}
                    {field.type === "number" && (
                      <input
                        className="rounded border border-border bg-bg px-2 py-1"
                        type="number"
                        value={Number(value ?? 0)}
                        min={field.min}
                        max={field.max}
                        onChange={(event) =>
                          setConfig((current) => ({
                            ...current,
                            [field.key]: Number(event.target.value),
                          }))
                        }
                      />
                    )}
                    {field.type === "string" && (
                      <input
                        className="rounded border border-border bg-bg px-2 py-1"
                        value={String(value ?? "")}
                        onChange={(event) =>
                          setConfig((current) => ({ ...current, [field.key]: event.target.value }))
                        }
                      />
                    )}
                    {field.type === "select" && (
                      <select
                        className="rounded border border-border bg-bg px-2 py-1"
                        value={String(value ?? "")}
                        onChange={(event) =>
                          setConfig((current) => ({ ...current, [field.key]: event.target.value }))
                        }
                      >
                        {(field.options ?? []).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 text-sm text-text-muted">
              Enable this engine and choose its pipeline level in Compression Settings.
            </p>
          )}
          {settingsKey && (
            <button
              className="mt-5 rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              type="button"
              disabled={saving}
              onClick={save}
            >
              {saving ? "Saving..." : "Save settings"}
            </button>
          )}
          {message && (
            <p className="mt-3 text-sm text-text-muted" role="status">
              {message}
            </p>
          )}
        </section>
      </div>
    );
  };
}
