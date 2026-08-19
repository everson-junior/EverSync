import React, { useEffect, useMemo, useState } from "react";
import { getHost } from "@eversync/plugin-host";

type Analytics = {
  totalRequests?: number;
  totalTokensSaved?: number;
  avgSavingsPct?: number;
  avgDurationMs?: number;
  byEngine?: Record<string, { count: number; tokensSaved: number; avgSavingsPct: number }>;
  byMode?: Record<string, { tokensSaved: number; avgSavingsPct: number }>;
};

type Settings = {
  enabled?: boolean;
  languageConfig?: {
    enabled: boolean;
    defaultLanguage: string;
    autoDetect: boolean;
    enabledPacks: string[];
  };
  cavemanOutputMode?: {
    enabled: boolean;
    intensity: "lite" | "full" | "ultra";
    autoClarity: boolean;
  };
};

type LanguagePack = { language: string; ruleCount: number };

const number = (value?: number) => new Intl.NumberFormat().format(value ?? 0);

export default function CavemanContextModule() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [packs, setPacks] = useState<LanguagePack[]>([]);
  const [saving, setSaving] = useState(false);

  const refreshSettings = () => {
    getHost()
      .fetch("/api/context/caveman/config")
      .then((response) => (response.ok ? response.json() : null))
      .then(setSettings)
      .catch(() => setSettings(null));
  };

  useEffect(() => {
    getHost()
      .fetch("/api/context/analytics?since=7d")
      .then((response) => (response.ok ? response.json() : null))
      .then(setAnalytics)
      .catch(() => setAnalytics(null));
    getHost()
      .fetch("/api/compression/language-packs")
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => setPacks(Array.isArray(value?.packs) ? value.packs : []))
      .catch(() => setPacks([]));
    refreshSettings();
  }, []);

  const language = settings?.languageConfig ?? {
    enabled: false,
    defaultLanguage: "en",
    autoDetect: true,
    enabledPacks: ["en"],
  };
  const output = settings?.cavemanOutputMode ?? {
    enabled: false,
    intensity: "lite" as const,
    autoClarity: true,
  };
  const stats = analytics?.byEngine?.caveman ?? analytics?.byEngine?.standard;
  const modes = useMemo(() => Object.entries(analytics?.byMode ?? {}), [analytics]);

  const save = async (patch: Partial<Settings>) => {
    setSaving(true);
    try {
      const response = await getHost().fetch("/api/context/caveman/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (response.ok) setSettings(await response.json());
    } finally {
      setSaving(false);
    }
  };

  const updateLanguage = (patch: Partial<typeof language>) =>
    void save({ languageConfig: { ...language, ...patch } });
  const updateOutput = (patch: Partial<typeof output>) =>
    void save({ cavemanOutputMode: { ...output, ...patch } });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-text-main">Caveman Context</h1>
        <p className="mt-1 text-sm text-text-muted">
          Configure language-aware prompt compression and review runtime savings.
        </p>
      </header>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        {[
          ["Requests", number(stats?.count ?? analytics?.totalRequests)],
          ["Tokens saved", number(stats?.tokensSaved ?? analytics?.totalTokensSaved)],
          ["Savings", `${stats?.avgSavingsPct ?? analytics?.avgSavingsPct ?? 0}%`],
          ["Average latency", `${analytics?.avgDurationMs ?? 0}ms`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-surface p-4">
            <p className="text-xs uppercase text-text-muted">{label}</p>
            <p className="mt-1 text-xl font-semibold text-text-main">{value}</p>
          </div>
        ))}
      </section>
      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-text-main">Language packs</h2>
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-text-main">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={language.enabled}
              disabled={saving}
              onChange={(event) => updateLanguage({ enabled: event.target.checked })}
            />
            Enabled
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={language.autoDetect}
              disabled={saving}
              onChange={(event) => updateLanguage({ autoDetect: event.target.checked })}
            />
            Detect automatically
          </label>
          <select
            value={language.defaultLanguage}
            disabled={saving || language.autoDetect}
            onChange={(event) => updateLanguage({ defaultLanguage: event.target.value })}
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm"
          >
            {packs.map((pack) => (
              <option key={pack.language} value={pack.language}>
                {pack.language}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {packs.map((pack) => (
            <label
              key={pack.language}
              className="flex items-center justify-between rounded-lg border border-border bg-bg p-3 text-sm text-text-main"
            >
              <span>
                {pack.language} ({pack.ruleCount} rules)
              </span>
              <input
                type="checkbox"
                checked={language.enabledPacks.includes(pack.language)}
                disabled={saving || pack.language === "en"}
                onChange={(event) =>
                  updateLanguage({
                    enabledPacks: event.target.checked
                      ? [...new Set([...language.enabledPacks, pack.language])]
                      : language.enabledPacks.filter(
                          (value) => value !== pack.language && value !== "en"
                        ),
                  })
                }
              />
            </label>
          ))}
        </div>
      </section>
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-text-main">Compression analytics</h2>
          <div className="mt-3 space-y-2 text-sm text-text-main">
            {modes.length === 0 ? (
              <p className="text-text-muted">No analytics recorded yet.</p>
            ) : (
              modes.map(([mode, values]) => (
                <div key={mode} className="flex items-center justify-between">
                  <span>{mode}</span>
                  <span className="font-mono text-xs text-text-muted">
                    {number(values.tokensSaved)} / {values.avgSavingsPct}%
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-text-main">Output mode</h2>
          <label className="mt-3 flex items-center gap-2 text-sm text-text-main">
            <input
              type="checkbox"
              checked={output.enabled}
              disabled={saving}
              onChange={(event) => updateOutput({ enabled: event.target.checked })}
            />
            Enable Caveman output compression
          </label>
          <label className="mt-3 flex items-center gap-2 text-sm text-text-main">
            <input
              type="checkbox"
              checked={output.autoClarity}
              disabled={saving}
              onChange={(event) => updateOutput({ autoClarity: event.target.checked })}
            />
            Preserve clarity automatically
          </label>
        </div>
      </section>
    </div>
  );
}
