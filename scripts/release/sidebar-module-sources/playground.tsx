import React, { useEffect, useRef, useState } from "react";
import { getHost } from "@eversync/plugin-host";

type Model = { id: string };
type Message = { role: "user" | "assistant"; content: string };

function messageFromError(body: unknown, status: number): string {
  const error = (body as { error?: { message?: string } | string })?.error;
  if (typeof error === "string") return error;
  return error?.message ?? `Request failed with status ${status}.`;
}

export default function PlaygroundModule() {
  const [models, setModels] = useState<Model[]>([]);
  const [model, setModel] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [input, setInput] = useState("");
  const [temperature, setTemperature] = useState("1");
  const [maxTokens, setMaxTokens] = useState("1024");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    getHost()
      .fetch("/v1/models")
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load models.");
        const body = (await response.json()) as { data?: Model[] };
        const nextModels = Array.isArray(body.data) ? body.data.filter((entry) => entry?.id) : [];
        setModels(nextModels);
        setModel((current) => current || nextModels[0]?.id || "");
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "Unable to load models.")
      );
  }, []);

  const send = async () => {
    if (!input.trim() || !model || loading) return;
    const userMessage: Message = { role: "user", content: input.trim() };
    const nextMessages = [...messages, userMessage];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setInput("");
    setError(null);
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const requestMessages = systemPrompt.trim()
        ? [{ role: "system", content: systemPrompt.trim() }, ...nextMessages]
        : nextMessages;
      const response = await getHost().fetch("/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: requestMessages,
          stream: true,
          temperature: Number(temperature),
          max_tokens: Number(maxTokens),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(messageFromError(body, response.status));
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("The provider returned an empty response stream.");
      const decoder = new TextDecoder();
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split("\n")) {
          if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
          try {
            const payload = JSON.parse(line.slice(6)) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            text += payload.choices?.[0]?.delta?.content ?? "";
            setMessages([...nextMessages, { role: "assistant", content: text }]);
          } catch {
            // Ignore incomplete SSE frames.
          }
        }
      }
    } catch (cause: unknown) {
      if ((cause as { name?: string }).name !== "AbortError") {
        setError(cause instanceof Error ? cause.message : "Chat request failed.");
      }
      setMessages(nextMessages);
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
      <header>
        <h1 className="text-2xl font-bold text-text-main">Playground</h1>
        <p className="mt-1 text-sm text-text-muted">Test a model with a streaming chat request.</p>
      </header>
      <section className="grid gap-3 rounded border border-border bg-surface p-4 md:grid-cols-4">
        <label className="text-sm text-text-main md:col-span-2">
          Model
          <select
            className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm"
            value={model}
            onChange={(event) => setModel(event.target.value)}
          >
            {models.length === 0 ? <option value="">No models available</option> : null}
            {models.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.id}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-text-main">
          Temperature
          <input
            className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm"
            type="number"
            min="0"
            max="2"
            step="0.1"
            value={temperature}
            onChange={(event) => setTemperature(event.target.value)}
          />
        </label>
        <label className="text-sm text-text-main">
          Max tokens
          <input
            className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm"
            type="number"
            min="1"
            value={maxTokens}
            onChange={(event) => setMaxTokens(event.target.value)}
          />
        </label>
        <label className="text-sm text-text-main md:col-span-4">
          System prompt
          <textarea
            className="mt-1 min-h-20 w-full rounded border border-border bg-bg p-3 text-sm"
            value={systemPrompt}
            onChange={(event) => setSystemPrompt(event.target.value)}
            placeholder="Optional instructions for the model"
          />
        </label>
      </section>
      <section className="min-h-80 rounded border border-border bg-surface p-4">
        <h2 className="font-semibold text-text-main">Conversation</h2>
        <div className="mt-3 flex flex-col gap-3">
          {messages.length === 0 ? (
            <p className="text-sm text-text-muted">Send a message to begin.</p>
          ) : null}
          {messages.map((message, index) => (
            <article
              key={`${message.role}-${index}`}
              className="rounded border border-border bg-bg p-3"
            >
              <p className="text-xs font-semibold uppercase text-text-muted">{message.role}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-text-main">
                {message.content ||
                  (loading && message.role === "assistant" ? "Generating..." : "")}
              </p>
            </article>
          ))}
        </div>
      </section>
      <section className="rounded border border-border bg-surface p-4">
        <label className="text-sm text-text-main">
          Message
          <textarea
            className="mt-1 min-h-24 w-full rounded border border-border bg-bg p-3 text-sm"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Write a message"
          />
        </label>
        <div className="mt-3 flex justify-end gap-2">
          <button
            className="rounded border border-border px-3 py-2 text-sm text-text-main"
            type="button"
            onClick={() => setMessages([])}
            disabled={loading}
          >
            Clear
          </button>
          {loading ? (
            <button
              className="rounded border border-border px-3 py-2 text-sm text-text-main"
              type="button"
              onClick={() => abortRef.current?.abort()}
            >
              Stop
            </button>
          ) : (
            <button
              className="rounded border border-border px-3 py-2 text-sm text-text-main disabled:opacity-40"
              type="button"
              onClick={send}
              disabled={!input.trim() || !model}
            >
              Send
            </button>
          )}
        </div>
      </section>
      {error ? (
        <p className="rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
