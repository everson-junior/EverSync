import React, { useEffect, useMemo, useState } from "react";
import { getHost } from "@eversync/plugin-host";

type Endpoint = {
  method: string;
  path: string;
  tags?: string[];
  summary?: string;
  description?: string;
  security?: boolean;
  requestBody?: boolean;
  responses?: string[];
};

type Catalog = {
  info?: { title?: string; version?: string; description?: string };
  tags?: Array<{ name: string }>;
  endpoints?: Endpoint[];
};

type TryResult = {
  status?: number;
  statusText?: string;
  body?: unknown;
  latencyMs?: number;
};

const METHOD_CLASS: Record<string, string> = {
  GET: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  POST: "border-blue-500/30 bg-blue-500/10 text-blue-600",
  PUT: "border-amber-500/30 bg-amber-500/10 text-amber-600",
  PATCH: "border-orange-500/30 bg-orange-500/10 text-orange-600",
  DELETE: "border-red-500/30 bg-red-500/10 text-red-600",
};

function errorMessage(body: unknown, fallback: string): string {
  const error = (body as { error?: string | { message?: string } })?.error;
  if (typeof error === "string") return error;
  return error?.message ?? fallback;
}

export default function ApiEndpointsModule() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [requestBody, setRequestBody] = useState("{}");
  const [result, setResult] = useState<TryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [trying, setTrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getHost()
      .fetch("/api/openapi/spec")
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as Catalog;
        if (!response.ok) throw new Error(errorMessage(data, "Unable to load the API catalog."));
        setCatalog(data);
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "Unable to load the API catalog.")
      )
      .finally(() => setLoading(false));
  }, []);

  const endpoints = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (catalog?.endpoints ?? []).filter((endpoint) => {
      const matchesTag = !tag || endpoint.tags?.includes(tag);
      const haystack = [
        endpoint.method,
        endpoint.path,
        endpoint.summary,
        endpoint.description,
        ...(endpoint.tags ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return matchesTag && (!query || haystack.includes(query));
    });
  }, [catalog, search, tag]);

  const selectEndpoint = (endpoint: Endpoint) => {
    const key = `${endpoint.method}:${endpoint.path}`;
    const isExpanded = expanded === key;
    setExpanded(isExpanded ? null : key);
    setResult(null);
    setRequestBody(endpoint.method === "GET" || !endpoint.requestBody ? "" : "{\n  \n}");
  };

  const tryEndpoint = async (endpoint: Endpoint) => {
    let body: unknown;
    try {
      body = requestBody.trim() ? JSON.parse(requestBody) : undefined;
    } catch {
      setError("Request body must be valid JSON.");
      return;
    }
    setTrying(true);
    setError(null);
    setResult(null);
    try {
      const response = await getHost().fetch("/api/openapi/try", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: endpoint.method, path: endpoint.path, headers: {}, body }),
      });
      const data = (await response.json().catch(() => ({}))) as TryResult & {
        error?: string | { message?: string };
      };
      if (!response.ok)
        throw new Error(errorMessage(data, `Request failed with status ${response.status}.`));
      setResult(data);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to execute the request.");
    } finally {
      setTrying(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-main">API endpoints</h1>
          <p className="mt-1 text-sm text-text-muted">
            {catalog?.info?.title ?? "Browse the available API surface."}
            {catalog?.info?.version ? ` v${catalog.info.version}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <a
            className="rounded border border-border px-3 py-2 text-sm text-text-main"
            href="/docs/openapi.yaml"
            download
          >
            YAML
          </a>
          <a
            className="rounded border border-border px-3 py-2 text-sm text-text-main"
            href="/api/openapi/spec"
            target="_blank"
            rel="noreferrer"
          >
            JSON
          </a>
        </div>
      </header>
      <section className="flex flex-wrap gap-3 rounded border border-border bg-surface p-4">
        <input
          className="min-w-52 flex-1 rounded border border-border bg-bg px-3 py-2 text-sm"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search path, method, or tag"
        />
        <select
          className="rounded border border-border bg-bg px-3 py-2 text-sm"
          value={tag}
          onChange={(event) => setTag(event.target.value)}
        >
          <option value="">All tags</option>
          {(catalog?.tags ?? []).map((entry) => (
            <option key={entry.name} value={entry.name}>
              {entry.name}
            </option>
          ))}
        </select>
      </section>
      {loading ? <p className="text-sm text-text-muted">Loading API catalog...</p> : null}
      {!loading && endpoints.length === 0 ? (
        <p className="text-sm text-text-muted">No endpoints match the current filters.</p>
      ) : null}
      <section className="flex flex-col gap-2">
        {endpoints.map((endpoint) => {
          const key = `${endpoint.method}:${endpoint.path}`;
          const isExpanded = expanded === key;
          return (
            <article key={key} className="rounded border border-border bg-surface">
              <button
                className="flex w-full items-center gap-3 p-3 text-left"
                type="button"
                onClick={() => selectEndpoint(endpoint)}
              >
                <span
                  className={`rounded border px-2 py-1 font-mono text-xs font-semibold ${METHOD_CLASS[endpoint.method] ?? "border-border text-text-main"}`}
                >
                  {endpoint.method}
                </span>
                <code className="min-w-0 flex-1 truncate text-sm text-text-main">
                  {endpoint.path}
                </code>
                <span className="hidden text-sm text-text-muted sm:block">
                  {endpoint.summary ?? ""}
                </span>
              </button>
              {isExpanded ? (
                <div className="border-t border-border p-4">
                  <p className="text-sm text-text-muted">
                    {endpoint.description ?? endpoint.summary ?? "No description available."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-text-muted">
                    {(endpoint.tags ?? []).map((entry) => (
                      <span key={entry} className="rounded border border-border px-2 py-1">
                        {entry}
                      </span>
                    ))}
                    <span className="rounded border border-border px-2 py-1">
                      {endpoint.security ? "Authentication required" : "No authentication"}
                    </span>
                    <span className="rounded border border-border px-2 py-1">
                      Responses: {(endpoint.responses ?? []).join(", ") || "not documented"}
                    </span>
                  </div>
                  <label className="mt-4 block text-sm text-text-main">
                    Request JSON
                    <textarea
                      className="mt-1 min-h-28 w-full rounded border border-border bg-bg p-3 font-mono text-xs"
                      value={requestBody}
                      onChange={(event) => setRequestBody(event.target.value)}
                      disabled={endpoint.method === "GET" || !endpoint.requestBody}
                      placeholder={
                        endpoint.method === "GET" || !endpoint.requestBody
                          ? "This endpoint has no request body."
                          : undefined
                      }
                    />
                  </label>
                  <div className="mt-3 flex justify-end">
                    <button
                      className="rounded border border-border px-3 py-2 text-sm text-text-main disabled:opacity-40"
                      type="button"
                      onClick={() => tryEndpoint(endpoint)}
                      disabled={trying}
                    >
                      {trying ? "Executing..." : "Try request"}
                    </button>
                  </div>
                  {result ? (
                    <pre className="mt-4 max-h-80 overflow-auto rounded border border-border bg-bg p-3 text-xs text-text-main">
                      {JSON.stringify(result, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </section>
      {error ? (
        <p className="rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
