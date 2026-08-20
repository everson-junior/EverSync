import React, { useState } from "react";
import { getHost } from "@eversync/plugin-host";

type TranslationResponse = {
  success?: boolean;
  sourceFormat?: string;
  targetFormat?: string;
  result?: unknown;
  error?: string | { message?: string };
};

const FORMATS = ["openai", "anthropic", "gemini"];

function errorMessage(error: TranslationResponse["error"], fallback: string): string {
  if (typeof error === "string") return error;
  return error?.message ?? fallback;
}

export default function TranslatorModule() {
  const [input, setInput] = useState(
    '{\n  "model": "test-model",\n  "messages": [{ "role": "user", "content": "Hello" }]\n}'
  );
  const [sourceFormat, setSourceFormat] = useState("openai");
  const [targetFormat, setTargetFormat] = useState("anthropic");
  const [detectedFormat, setDetectedFormat] = useState<string | null>(null);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseInput = (): Record<string, unknown> => {
    const parsed = JSON.parse(input) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("The request body must be a JSON object.");
    }
    return parsed as Record<string, unknown>;
  };

  const detect = () => {
    let body: Record<string, unknown>;
    try {
      body = parseInput();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid JSON.");
      return;
    }
    setLoading(true);
    setError(null);
    getHost()
      .fetch("/api/translator/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          format?: string;
          error?: string | { message?: string };
        };
        if (!response.ok || !data.success)
          throw new Error(errorMessage(data.error, "Unable to detect format."));
        setDetectedFormat(data.format ?? null);
        if (data.format) setSourceFormat(data.format);
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "Unable to detect format.")
      )
      .finally(() => setLoading(false));
  };

  const translate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let body: Record<string, unknown>;
    try {
      body = parseInput();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid JSON.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult("");
    getHost()
      .fetch("/api/translator/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "direct", sourceFormat, targetFormat, body }),
      })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as TranslationResponse;
        if (!response.ok || !data.success)
          throw new Error(errorMessage(data.error, "Translation failed."));
        setDetectedFormat(data.sourceFormat ?? sourceFormat);
        setResult(JSON.stringify(data.result, null, 2));
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "Translation failed.")
      )
      .finally(() => setLoading(false));
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-main">Request translator</h1>
          <p className="mt-1 text-sm text-text-muted">
            Convert a JSON request between supported provider formats.
          </p>
        </div>
        <button
          className="rounded border border-border px-3 py-2 text-sm text-text-main disabled:opacity-40"
          type="button"
          onClick={detect}
          disabled={loading}
        >
          {loading ? "Working..." : "Detect format"}
        </button>
      </header>

      <form className="flex flex-col gap-4" onSubmit={translate}>
        <section className="grid gap-3 rounded border border-border bg-surface p-4 md:grid-cols-2">
          <label className="text-sm text-text-main">
            Source format
            <select
              className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm"
              value={sourceFormat}
              onChange={(event) => setSourceFormat(event.target.value)}
            >
              {FORMATS.map((format) => (
                <option key={format} value={format}>
                  {format}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-text-main">
            Target format
            <select
              className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm"
              value={targetFormat}
              onChange={(event) => setTargetFormat(event.target.value)}
            >
              {FORMATS.map((format) => (
                <option key={format} value={format}>
                  {format}
                </option>
              ))}
            </select>
          </label>
          {detectedFormat ? (
            <p className="text-sm text-text-muted md:col-span-2">
              Detected format: <span className="font-mono text-text-main">{detectedFormat}</span>
            </p>
          ) : null}
        </section>
        <label className="rounded border border-border bg-surface p-4 text-sm text-text-main">
          Request JSON
          <textarea
            className="mt-2 min-h-72 w-full rounded border border-border bg-bg p-3 font-mono text-xs text-text-main"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            spellCheck={false}
          />
        </label>
        <button
          className="self-end rounded border border-border px-4 py-2 text-sm text-text-main disabled:opacity-40"
          type="submit"
          disabled={loading}
        >
          {loading ? "Translating..." : "Translate request"}
        </button>
      </form>

      {error ? (
        <p className="rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}
      {result ? (
        <section className="rounded border border-border bg-surface p-4">
          <h2 className="font-semibold text-text-main">Translated request</h2>
          <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded border border-border bg-bg p-3 text-xs text-text-main">
            {result}
          </pre>
        </section>
      ) : null}
    </div>
  );
}
