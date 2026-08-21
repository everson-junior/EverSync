import React, { useEffect, useState } from "react";
import { getHost } from "@eversync/plugin-host";

type PipelineStep = { engine: string; intensity?: string };
type CompressionCombo = {
  id: string;
  name: string;
  description?: string;
  pipeline: PipelineStep[];
  languagePacks: string[];
  outputMode: boolean;
  outputModeIntensity?: "lite" | "full" | "ultra";
  isDefault: boolean;
};
type RoutingCombo = { id?: string; name?: string; config?: Record<string, unknown> | null };
type LanguagePack = { language: string; ruleCount: number };
type Settings = {
  enabled: boolean;
  activeComboId?: string | null;
  contextEditing?: { enabled: boolean };
};

const DEFAULT_PIPELINE: PipelineStep[] = [
  { engine: "rtk", intensity: "standard" },
  { engine: "caveman", intensity: "full" },
];
const ENGINE_INTENSITIES: Record<string, string[]> = {
  rtk: ["lite", "standard", "full"],
  caveman: ["lite", "standard", "full"],
  llmlingua: ["lite", "standard", "full"],
  "session-dedup": ["standard"],
};
const COMPRESSION_MODES = ["", "off", "lite", "standard", "aggressive", "ultra", "codex-responses"];

function asJson(response: Response) {
  return response.ok ? response.json() : null;
}

function copyPipeline() {
  return DEFAULT_PIPELINE.map((step) => ({ ...step }));
}

export default function ContextCombosModule() {
  const [settings, setSettings] = useState<Settings>({ enabled: false });
  const [combos, setCombos] = useState<CompressionCombo[]>([]);
  const [routingCombos, setRoutingCombos] = useState<RoutingCombo[]>([]);
  const [packs, setPacks] = useState<LanguagePack[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pipeline, setPipeline] = useState<PipelineStep[]>(copyPipeline);
  const [selectedPacks, setSelectedPacks] = useState<string[]>(["en"]);
  const [outputMode, setOutputMode] = useState(false);
  const [outputModeIntensity, setOutputModeIntensity] = useState("full");
  const [assignmentIds, setAssignmentIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    Promise.all([
      getHost().fetch("/api/settings/compression").then(asJson),
      getHost().fetch("/api/context/combos").then(asJson),
      getHost().fetch("/api/combos").then(asJson),
      getHost().fetch("/api/compression/language-packs").then(asJson),
    ])
      .then(([settingsData, combosData, routingData, packsData]) => {
        setSettings(settingsData || { enabled: false });
        setCombos(Array.isArray(combosData?.combos) ? combosData.combos : []);
        setRoutingCombos(Array.isArray(routingData?.combos) ? routingData.combos : []);
        setPacks(Array.isArray(packsData?.packs) ? packsData.packs : []);
      })
      .catch(() => setError("Unable to load compression settings."));
  };

  useEffect(() => {
    load();
  }, []);

  const patchSettings = async (patch: Partial<Settings>) => {
    const previous = settings;
    setSettings({ ...settings, ...patch });
    try {
      const response = await getHost().fetch("/api/settings/compression", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error();
    } catch {
      setSettings(previous);
      setError("Unable to save compression settings.");
    }
  };

  const reset = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setPipeline(copyPipeline());
    setSelectedPacks(["en"]);
    setOutputMode(false);
    setOutputModeIntensity("full");
    setAssignmentIds([]);
    setError(null);
  };

  const edit = async (combo: CompressionCombo) => {
    setEditingId(combo.id);
    setName(combo.name);
    setDescription(combo.description || "");
    setPipeline(combo.pipeline.length ? combo.pipeline : copyPipeline());
    setSelectedPacks(combo.languagePacks.length ? combo.languagePacks : ["en"]);
    setOutputMode(Boolean(combo.outputMode));
    setOutputModeIntensity(combo.outputModeIntensity || "full");
    setError(null);
    const response = await getHost().fetch(`/api/context/combos/${combo.id}/assignments`);
    const data = await asJson(response);
    setAssignmentIds(
      Array.isArray(data?.assignments)
        ? data.assignments.map((assignment: { routingComboId: string }) => assignment.routingComboId)
        : []
    );
  };

  const save = async () => {
    if (!name.trim() || pipeline.length === 0) {
      setError("Provide a name and at least one pipeline step.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await getHost().fetch(
        editingId ? `/api/context/combos/${editingId}` : "/api/context/combos",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description,
            pipeline,
            languagePacks: selectedPacks,
            outputMode,
            outputModeIntensity,
          }),
        }
      );
      if (!response.ok) throw new Error();
      const combo = await response.json();
      await getHost().fetch(`/api/context/combos/${combo.id}/assignments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routingComboIds: assignmentIds }),
      });
      reset();
      load();
    } catch {
      setError("Unable to save this combo.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (combo: CompressionCombo) => {
    if (!confirm(`Delete ${combo.name}?`)) return;
    const response = await getHost().fetch(`/api/context/combos/${combo.id}`, { method: "DELETE" });
    if (response.ok) load();
    else setError("Unable to delete this combo.");
  };

  const updateStep = (index: number, patch: Partial<PipelineStep>) => {
    setPipeline((current) =>
      current.map((step, stepIndex) => (stepIndex === index ? { ...step, ...patch } : step))
    );
  };

  const saveRoutingMode = async (combo: RoutingCombo, mode: string) => {
    if (!combo.id) return;
    const config = { ...(combo.config || {}) };
    if (mode) config.compressionMode = mode;
    else delete config.compressionMode;
    const response = await getHost().fetch(`/api/combos/${combo.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });
    if (response.ok) {
      setRoutingCombos((current) =>
        current.map((item) => (item.id === combo.id ? { ...item, config } : item))
      );
    }
  };

  const activeCombo = combos.find((combo) => combo.id === settings.activeComboId);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 p-4">
      <section className="rounded-xl border border-primary/30 bg-surface p-5">
        <h1 className="text-xl font-bold text-text-main">Compression Hub</h1>
        <p className="text-sm text-text-muted">Choose which compression profile runs globally.</p>
        <div className="mt-5 rounded-lg border border-border bg-bg p-4">
          <label className="flex flex-col gap-1 text-sm font-semibold text-text-main">
            Active profile
            <span className="text-xs font-normal text-text-muted">
              Choose the compression profile that runs globally.
            </span>
            <select
              className="mt-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-main"
              value={settings.activeComboId || ""}
              onChange={(event) => void patchSettings({ activeComboId: event.target.value || null })}
            >
              <option value="">Default (from panel)</option>
              {combos.map((combo) => (
                <option key={combo.id} value={combo.id}>{combo.name}</option>
              ))}
            </select>
          </label>
          <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-text-muted">
            {activeCombo
              ? activeCombo.pipeline.map((step) => step.engine).join(" -> ")
              : "Default - configured in Compression Settings."}
          </p>
        </div>
        <div className="mt-5">
          <h2 className="text-sm font-semibold text-text-main">Provider-delegated compression</h2>
          <label className="mt-3 flex items-center justify-between gap-4 rounded-lg border border-border bg-bg p-4">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-text-main">Context Editing (Claude)</span>
              <span className="block text-xs text-text-muted">
                Lets the provider clear old tool-use blocks on the server side.
              </span>
            </span>
            <input
              type="checkbox"
              checked={Boolean(settings.contextEditing?.enabled)}
              onChange={(event) => void patchSettings({ contextEditing: { enabled: event.target.checked } })}
            />
          </label>
          <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-500">
            Available only for Claude (Anthropic). It does not affect other providers.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-text-main">Named combos</h2>
        <p className="text-sm text-text-muted">
          Save different pipelines and assign them to specific routing combos.
        </p>
        <div className="mt-4 rounded-lg border border-border bg-surface p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <input className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-main" placeholder="Combo name" value={name} onChange={(event) => setName(event.target.value)} />
            <input className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-main" placeholder="Description" value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-text-main">Pipeline</h3><button type="button" className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-main" onClick={() => setPipeline((current) => [...current, { engine: "rtk", intensity: "standard" }])}>Add step</button></div>
            <div className="mt-3 space-y-2">
              {pipeline.map((step, index) => (
                <div key={`${step.engine}-${index}`} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <select className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-main" value={step.engine} onChange={(event) => updateStep(index, { engine: event.target.value, intensity: ENGINE_INTENSITIES[event.target.value]?.[0] || "standard" })}>{Object.keys(ENGINE_INTENSITIES).map((engine) => <option key={engine} value={engine}>{engine}</option>)}</select>
                  <select className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-main" value={step.intensity || ""} onChange={(event) => updateStep(index, { intensity: event.target.value })}>{(ENGINE_INTENSITIES[step.engine] || ["standard"]).map((intensity) => <option key={intensity} value={intensity}>{intensity}</option>)}</select>
                  <button type="button" disabled={pipeline.length === 1} className="rounded-lg border border-border px-3 py-2 text-sm text-text-main disabled:opacity-50" onClick={() => setPipeline((current) => current.filter((_, stepIndex) => stepIndex !== index))}>Remove</button>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div><h3 className="mb-2 text-sm font-semibold text-text-main">Language packs</h3>{packs.map((pack) => <label key={pack.language} className="flex items-center justify-between gap-2 text-sm text-text-main"><span>{pack.language} ({pack.ruleCount})</span><input type="checkbox" checked={selectedPacks.includes(pack.language)} disabled={pack.language === "en"} onChange={(event) => setSelectedPacks((current) => event.target.checked ? [...new Set([...current, pack.language])] : current.filter((value) => value !== pack.language && value !== "en"))} /></label>)}</div>
            <div><h3 className="mb-2 text-sm font-semibold text-text-main">Output mode</h3><label className="flex items-center gap-2 text-sm text-text-main"><input type="checkbox" checked={outputMode} onChange={(event) => setOutputMode(event.target.checked)} />Enabled</label><label className="mt-3 flex flex-col gap-1 text-sm text-text-main">Output intensity<select className="rounded-lg border border-border bg-bg px-3 py-2" value={outputModeIntensity} onChange={(event) => setOutputModeIntensity(event.target.value)}><option value="lite">Lite</option><option value="full">Full</option><option value="ultra">Ultra</option></select></label></div>
            <div><h3 className="mb-2 text-sm font-semibold text-text-main">Assign to routing combos</h3><div className="max-h-44 space-y-2 overflow-auto">{routingCombos.length === 0 ? <p className="text-xs text-text-muted">No routing combos available.</p> : routingCombos.map((combo) => combo.id && <div key={combo.id} className="flex items-center gap-2"><label className="flex min-w-0 flex-1 items-center justify-between gap-2 text-sm text-text-main"><span className="truncate">{combo.name || combo.id}</span><input type="checkbox" checked={assignmentIds.includes(combo.id)} onChange={(event) => setAssignmentIds((current) => event.target.checked ? [...new Set([...current, combo.id!])] : current.filter((id) => id !== combo.id))} /></label><select disabled={!settings.enabled} title="Compression override" className="w-24 rounded-lg border border-border bg-bg px-2 py-1 text-xs text-text-main disabled:opacity-50" value={typeof combo.config?.compressionMode === "string" ? combo.config.compressionMode : ""} onChange={(event) => void saveRoutingMode(combo, event.target.value)}>{COMPRESSION_MODES.map((mode) => <option key={mode} value={mode}>{mode || "Default"}</option>)}</select></div>)}</div></div>
          </div>
          {error && <p className="mt-4 text-sm text-danger" role="alert">{error}</p>}
          <div className="mt-4 flex gap-2"><button type="button" disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60" onClick={() => void save()}>{editingId ? "Save" : "Create combo"}</button>{editingId && <button type="button" className="rounded-lg border border-border px-4 py-2 text-sm text-text-main" onClick={reset}>Cancel</button>}</div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {combos.map((combo) => <article key={combo.id} className="rounded-lg border border-border bg-surface p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-base font-semibold text-text-main">{combo.name}</h3><p className="mt-1 text-sm text-text-muted">{combo.description}</p></div>{combo.id === settings.activeComboId ? <span className="text-xs text-green-500">Active</span> : combo.isDefault ? <span className="text-xs text-text-muted">Default</span> : null}</div><div className="mt-4 flex flex-wrap gap-2">{combo.pipeline.map((step, index) => <span key={`${combo.id}-${index}`} className="rounded-lg border border-border bg-bg px-2 py-1 font-mono text-xs text-text-muted">{index + 1}. {step.engine}{step.intensity ? `:${step.intensity}` : ""}</span>)}</div><p className="mt-3 text-xs text-text-muted">{combo.languagePacks.join(", ")}</p><div className="mt-4 flex gap-2"><button type="button" className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-main" onClick={() => void edit(combo)}>Edit</button>{!combo.isDefault && <button type="button" className="rounded-lg border border-danger/40 px-3 py-1.5 text-xs text-danger" onClick={() => void remove(combo)}>Delete</button>}</div></article>)}
      </section>
    </div>
  );
}