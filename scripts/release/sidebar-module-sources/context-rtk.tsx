import React, { useEffect, useState } from "react";
import { getHost } from "@eversync/plugin-host";

type Filter = { id: string; name: string; description: string; category: string };
type Config = {
  maxLinesPerResult: number;
  maxCharsPerResult: number;
  deduplicateThreshold: number;
  applyToToolResults: boolean;
  applyToAssistantMessages: boolean;
  applyToCodeBlocks: boolean;
  disabledFilters: string[];
};
type Preview = {
  error?: string;
  text?: string;
  compressed?: boolean;
  originalTokens?: number;
  compressedTokens?: number;
};

const SAMPLE =
  "npm run typecheck\nsrc/example.ts:10: error TS2322: Type 'string' is not assignable to type 'number'.";

export default function ContextRtkModule() {
  const [config, setConfig] = useState<Config | null>(null);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [sample, setSample] = useState(SAMPLE);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = () => {
    const asJson = (response: Response) => (response.ok ? response.json() : null);
    Promise.all([
      getHost().fetch("/api/context/rtk/config").then(asJson),
      getHost().fetch("/api/context/rtk/filters").then(asJson),
    ])
      .then(([configData, filtersData]) => {
        setConfig(configData as Config | null);
        setFilters(Array.isArray(filtersData?.filters) ? filtersData.filters : []);
      })
      .catch(() => setMessage("Unable to load RTK settings."));
  };

  useEffect(() => {
    load();
  }, []);

  const save = async (patch: Partial<Config>) => {
    if (!config) return;
    const next = { ...config, ...patch };
    setConfig(next);
    setSaving(true);
    setMessage(null);
    try {
      const response = await getHost().fetch("/api/context/rtk/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (response.ok) setConfig((await response.json()) as Config);
      else setMessage("Unable to save RTK settings.");
    } catch {
      setMessage("Unable to save RTK settings.");
    } finally {
      setSaving(false);
    }
  };

  const toggleFilter = (id: string, enabled: boolean) => {
    if (!config) return;
    const disabledFilters = enabled
      ? config.disabledFilters.filter((filterId) => filterId !== id)
      : [...new Set([...config.disabledFilters, id])];
    void save({ disabledFilters });
  };

  const test = async () => {
    setPreview(null);
    try {
      const response = await getHost().fetch("/api/context/rtk/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sample, config: config ?? undefined }),
      });
      setPreview(response.ok ? await response.json() : { error: "Preview failed." });
    } catch {
      setPreview({ error: "Preview failed." });
    }
  };

  if (!config) return <p className="p-6 text-sm text-text-muted">Loading RTK settings...</p>;
  const disabled = saving;
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4">
      <header>
        <h1 className="text-2xl font-bold text-text-main">RTK</h1>
        <p className="mt-1 text-sm text-text-muted">
          Compress terminal and tool output with configurable filters.
        </p>
      </header>
      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-text-main">Limits</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            ["Max lines", "maxLinesPerResult", 0],
            ["Max characters", "maxCharsPerResult", 0],
            ["Deduplication threshold", "deduplicateThreshold", 2],
          ].map(([label, key, min]) => (
            <label key={key as string} className="flex flex-col gap-1 text-sm text-text-main">
              <span>{label}</span>
              <input
                className="rounded border border-border bg-bg px-2 py-1"
                type="number"
                min={min as number}
                disabled={disabled}
                value={Number(config[key as keyof Config])}
                onChange={(event) =>
                  void save({ [key]: Number(event.target.value) || min } as Partial<Config>)
                }
              />
            </label>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-text-main">
          {[
            ["applyToToolResults", "Tool results"],
            ["applyToAssistantMessages", "Assistant messages"],
            ["applyToCodeBlocks", "Code blocks"],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={disabled}
                checked={Boolean(config[key as keyof Config])}
                onChange={(event) => void save({ [key]: event.target.checked } as Partial<Config>)}
              />
              {label}
            </label>
          ))}
        </div>
        {message && (
          <p className="mt-3 text-sm text-text-muted" role="status">
            {message}
          </p>
        )}
      </section>
      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-text-main">Filter catalog</h2>
        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
          {filters.map((filter) => (
            <label
              key={filter.id}
              className="flex items-start justify-between gap-3 rounded border border-border bg-bg p-3 text-sm text-text-main"
            >
              <span>
                <strong className="block">{filter.name}</strong>
                <span className="text-xs text-text-muted">{filter.description}</span>
              </span>
              <input
                type="checkbox"
                disabled={disabled}
                checked={!config.disabledFilters.includes(filter.id)}
                onChange={(event) => toggleFilter(filter.id, event.target.checked)}
              />
            </label>
          ))}
        </div>
      </section>
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-text-main">Test output</h2>
          <textarea
            className="mt-3 h-52 w-full rounded border border-border bg-bg p-2 font-mono text-xs text-text-main"
            value={sample}
            onChange={(event) => setSample(event.target.value)}
          />
          <button
            className="mt-3 rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            type="button"
            onClick={() => void test()}
          >
            Run preview
          </button>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-text-main">Result</h2>
          <pre className="mt-3 h-52 overflow-auto rounded border border-border bg-bg p-2 text-xs text-text-main">
            {preview ? JSON.stringify(preview, null, 2) : "Run a preview to inspect the result."}
          </pre>
        </div>
      </section>
    </div>
  );
}
