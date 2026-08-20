import React, { useEffect, useState } from "react";
import { getHost } from "@eversync/plugin-host";

type Provider = {
  id: string;
  name: string;
  kind: "search" | "fetch";
  status: "configured" | "missing" | "rate_limited";
  costPerQuery: number;
};

type SearchResult = {
  title?: string;
  url?: string;
  snippet?: string;
  score?: number;
};

type SearchResponse = {
  provider?: string;
  answer?: string;
  results?: SearchResult[];
  cached?: boolean;
  usage?: { search_cost_usd?: number };
  metrics?: { response_time_ms?: number };
};

export default function SearchToolsModule() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("auto");
  const [searchType, setSearchType] = useState("web");
  const [maxResults, setMaxResults] = useState(5);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [rawResponse, setRawResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProviders = () => {
    getHost()
      .fetch("/api/search/providers")
      .then(async (result) => {
        if (!result.ok) throw new Error("Unable to load search providers.");
        const body = (await result.json()) as { providers?: Provider[] };
        setProviders((body.providers ?? []).filter((entry) => entry.kind === "search"));
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "Unable to load search providers.")
      );
  };

  useEffect(() => {
    loadProviders();
  }, []);

  const search = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResponse(null);
    setRawResponse("");
    getHost()
      .fetch("/api/v1/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          provider: provider === "auto" ? undefined : provider,
          search_type: searchType,
          max_results: maxResults,
        }),
      })
      .then(async (result) => {
        const body = (await result.json().catch(() => ({}))) as SearchResponse & {
          error?: string | { message?: string };
        };
        setRawResponse(JSON.stringify(body, null, 2));
        if (!result.ok) {
          const message = typeof body.error === "string" ? body.error : body.error?.message;
          throw new Error(message ?? `Search failed with status ${result.status}.`);
        }
        setResponse(body);
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "Search failed.")
      )
      .finally(() => setLoading(false));
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-main">Search tools</h1>
          <p className="mt-1 text-sm text-text-muted">
            Run a web search through configured search providers.
          </p>
        </div>
        <button
          className="rounded border border-border px-3 py-2 text-sm text-text-main"
          type="button"
          onClick={loadProviders}
        >
          Refresh providers
        </button>
      </header>

      <form
        className="grid gap-3 rounded border border-border bg-surface p-4 md:grid-cols-4"
        onSubmit={search}
      >
        <label className="text-sm text-text-main md:col-span-2">
          Query
          <input
            className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="What do you want to find?"
          />
        </label>
        <label className="text-sm text-text-main">
          Provider
          <select
            className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm"
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
          >
            <option value="auto">Auto</option>
            {providers.map((entry) => (
              <option key={entry.id} value={entry.id} disabled={entry.status !== "configured"}>
                {entry.name} ({entry.status})
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-text-main">
          Result count
          <select
            className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm"
            value={maxResults}
            onChange={(event) => setMaxResults(Number(event.target.value))}
          >
            {[3, 5, 10, 20].map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-text-main">
          Search type
          <select
            className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm"
            value={searchType}
            onChange={(event) => setSearchType(event.target.value)}
          >
            <option value="web">Web</option>
            <option value="news">News</option>
            <option value="academic">Academic</option>
          </select>
        </label>
        <div className="flex items-end">
          <button
            className="w-full rounded border border-border px-3 py-2 text-sm text-text-main disabled:opacity-40"
            type="submit"
            disabled={loading || !query.trim()}
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </div>
      </form>

      {error ? (
        <p className="rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}
      {response ? (
        <section className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Provider", response.provider ?? "Not available"],
              ["Results", response.results?.length ?? 0],
              [
                "Latency",
                response.metrics?.response_time_ms == null
                  ? "Not available"
                  : `${response.metrics.response_time_ms}ms`,
              ],
              [
                "Cost",
                response.usage?.search_cost_usd == null
                  ? "Not available"
                  : `$${response.usage.search_cost_usd.toFixed(4)}`,
              ],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded border border-border bg-surface p-3">
                <p className="text-xs text-text-muted">{label}</p>
                <p className="mt-1 truncate text-sm font-semibold text-text-main">{value}</p>
              </div>
            ))}
          </div>
          {response.answer ? (
            <article className="rounded border border-border bg-surface p-4">
              <h2 className="font-semibold text-text-main">Answer</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-text-main">{response.answer}</p>
            </article>
          ) : null}
          <section className="rounded border border-border bg-surface p-4">
            <h2 className="font-semibold text-text-main">Results</h2>
            <div className="mt-3 flex flex-col gap-3">
              {response.results?.map((result, index) => (
                <article
                  key={`${result.url ?? result.title}-${index}`}
                  className="rounded border border-border p-3"
                >
                  <a
                    className="text-sm font-semibold text-primary underline"
                    href={result.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {result.title ?? result.url ?? "Untitled result"}
                  </a>
                  {result.snippet ? (
                    <p className="mt-1 text-sm text-text-muted">{result.snippet}</p>
                  ) : null}
                  {result.score != null ? (
                    <p className="mt-2 text-xs text-text-muted">Score: {result.score}</p>
                  ) : null}
                </article>
              ))}
              {response.results?.length === 0 ? (
                <p className="text-sm text-text-muted">The provider returned no results.</p>
              ) : null}
            </div>
          </section>
          <details className="rounded border border-border bg-surface p-4">
            <summary className="cursor-pointer text-sm font-semibold text-text-main">
              Raw response
            </summary>
            <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-xs text-text-muted">
              {rawResponse}
            </pre>
          </details>
        </section>
      ) : null}
    </div>
  );
}
