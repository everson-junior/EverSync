import React, { useEffect, useState } from "react";
import { getHost } from "@eversync/plugin-host";

type PipelineStep = { engine: string; intensity?: string };
type Combo = {
  id: string;
  name: string;
  description?: string;
  pipeline: PipelineStep[];
  languagePacks: string[];
  outputMode: boolean;
  outputModeIntensity: "lite" | "full" | "ultra";
  isDefault: boolean;
};
type LanguagePack = { language: string; ruleCount: number };

const DEFAULT_PIPELINE: PipelineStep[] = [
  { engine: "rtk", intensity: "standard" },
  { engine: "caveman", intensity: "full" },
];

export default function ContextCombosModule() {
  const [combos, setCombos] = useState<Combo[]>([]);
  const [packs, setPacks] = useState<LanguagePack[]>([]);
  const [editing, setEditing] = useState<Combo | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pipelineText, setPipelineText] = useState(JSON.stringify(DEFAULT_PIPELINE, null, 2));
  const [languagePacks, setLanguagePacks] = useState("en");
  const [outputMode, setOutputMode] = useState(false);
  const [outputModeIntensity, setOutputModeIntensity] =
    useState<Combo["outputModeIntensity"]>("full");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const asJson = (response: Response) => (response.ok ? response.json() : null);
  const load = () => {
    Promise.all([
      getHost().fetch("/api/context/combos").then(asJson),
      getHost().fetch("/api/compression/language-packs").then(asJson),
    ])
      .then(([combosData, packsData]) => {
        setCombos(Array.isArray(combosData?.combos) ? combosData.combos : []);
        setPacks(Array.isArray(packsData?.packs) ? packsData.packs : []);
      })
      .catch(() => setMessage("Unable to load compression combos."));
  };

  useEffect(() => {
    load();
  }, []);

  const reset = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setPipelineText(JSON.stringify(DEFAULT_PIPELINE, null, 2));
    setLanguagePacks("en");
    setOutputMode(false);
    setOutputModeIntensity("full");
    setMessage(null);
  };

  const edit = (combo: Combo) => {
    setEditing(combo);
    setName(combo.name);
    setDescription(combo.description ?? "");
    setPipelineText(JSON.stringify(combo.pipeline, null, 2));
    setLanguagePacks(combo.languagePacks.join(", "));
    setOutputMode(combo.outputMode);
    setOutputModeIntensity(combo.outputModeIntensity ?? "full");
    setMessage(null);
  };

  const save = async () => {
    let pipeline: PipelineStep[];
    try {
      pipeline = JSON.parse(pipelineText) as PipelineStep[];
    } catch {
      setMessage("Pipeline must be valid JSON.");
      return;
    }
    if (!name.trim() || !Array.isArray(pipeline) || pipeline.length === 0) {
      setMessage("A name and at least one pipeline step are required.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const response = await getHost().fetch(
        editing ? `/api/context/combos/${editing.id}` : "/api/context/combos",
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description,
            pipeline,
            languagePacks: languagePacks
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
            outputMode,
            outputModeIntensity,
          }),
        }
      );
      if (!response.ok) {
        setMessage("Unable to save this combo.");
        return;
      }
      reset();
      load();
    } catch {
      setMessage("Unable to save this combo.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (combo: Combo) => {
    if (!confirm(`Delete ${combo.name}?`)) return;
    try {
      const response = await getHost().fetch(`/api/context/combos/${combo.id}`, {
        method: "DELETE",
      });
      setMessage(response.ok ? "Combo deleted." : "Unable to delete this combo.");
      if (response.ok) load();
    } catch {
      setMessage("Unable to delete this combo.");
    }
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4">
      <header>
        <h1 className="text-2xl font-bold text-text-main">Compression Combos</h1>
        <p className="mt-1 text-sm text-text-muted">
          Create reusable compression pipelines and choose their language packs.
        </p>
      </header>
      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-text-main">
          {editing ? "Edit combo" : "New combo"}
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <input
            className="rounded border border-border bg-bg px-3 py-2 text-sm text-text-main"
            placeholder="Combo name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <input
            className="rounded border border-border bg-bg px-3 py-2 text-sm text-text-main"
            placeholder="Description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <label className="mt-3 flex flex-col gap-1 text-sm text-text-main">
          <span>Pipeline JSON</span>
          <textarea
            className="h-36 rounded border border-border bg-bg p-2 font-mono text-xs text-text-main"
            value={pipelineText}
            onChange={(event) => setPipelineText(event.target.value)}
          />
        </label>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm text-text-main">
            <span>Language packs</span>
            <input
              className="rounded border border-border bg-bg px-2 py-1"
              value={languagePacks}
              onChange={(event) => setLanguagePacks(event.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 self-end pb-1 text-sm text-text-main">
            <input
              type="checkbox"
              checked={outputMode}
              onChange={(event) => setOutputMode(event.target.checked)}
            />
            Output mode
          </label>
          <label className="flex flex-col gap-1 text-sm text-text-main">
            <span>Output intensity</span>
            <select
              className="rounded border border-border bg-bg px-2 py-1"
              value={outputModeIntensity}
              onChange={(event) =>
                setOutputModeIntensity(event.target.value as Combo["outputModeIntensity"])
              }
            >
              <option value="lite">Lite</option>
              <option value="full">Full</option>
              <option value="ultra">Ultra</option>
            </select>
          </label>
        </div>
        <p className="mt-2 text-xs text-text-muted">
          Available packs:{" "}
          {packs.map((pack) => `${pack.language} (${pack.ruleCount})`).join(", ") || "none"}
        </p>
        <div className="mt-4 flex gap-2">
          <button
            className="rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            type="button"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "Saving..." : editing ? "Save combo" : "Create combo"}
          </button>
          {editing && (
            <button
              className="rounded border border-border px-3 py-2 text-sm text-text-main"
              type="button"
              onClick={reset}
            >
              Cancel
            </button>
          )}
        </div>
        {message && (
          <p className="mt-3 text-sm text-text-muted" role="status">
            {message}
          </p>
        )}
      </section>
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {combos.map((combo) => (
          <article key={combo.id} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-text-main">{combo.name}</h2>
                <p className="mt-1 text-sm text-text-muted">{combo.description}</p>
              </div>
              {combo.isDefault && <span className="text-xs text-text-muted">Default</span>}
            </div>
            <pre className="mt-3 overflow-auto rounded border border-border bg-bg p-2 text-xs text-text-main">
              {JSON.stringify(combo.pipeline, null, 2)}
            </pre>
            <p className="mt-2 text-xs text-text-muted">Packs: {combo.languagePacks.join(", ")}</p>
            <div className="mt-3 flex gap-2">
              <button
                className="rounded border border-border px-3 py-1.5 text-xs text-text-main"
                type="button"
                onClick={() => edit(combo)}
              >
                Edit
              </button>
              {!combo.isDefault && (
                <button
                  className="rounded border border-danger/40 px-3 py-1.5 text-xs text-danger"
                  type="button"
                  onClick={() => void remove(combo)}
                >
                  Delete
                </button>
              )}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
