"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useImperativeHandle,
  type RefObject,
} from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/shared/utils/cn";
import { useApiKey } from "@/app/(dashboard)/dashboard/providers/hooks/useApiKey";
import { useProviderModels } from "@/app/(dashboard)/dashboard/providers/hooks/useProviderModels";
import { getProviderAlias } from "@/shared/constants/providers";

const ENDPOINT = "/api/v1/chat/completions";

/** Header used to test a specific API key's policy from the dashboard playground
 *  without exposing the key secret to the browser — the gateway resolves the key
 *  by id server-side (see enforceApiKeyPolicy). */
const PLAYGROUND_KEY_ID_HEADER = "x-omniroute-playground-key-id";

/**
 * Map the playground's masked key selection (sk-xxxx****yyyy, as returned by
 * `/api/keys`) back to its key id. The id — never the secret — is sent to the
 * gateway so it can apply that key's policy (allowed_models, etc.) server-side.
 * Returns null for "(default)", which falls through to the dashboard session.
 */
function resolvePlaygroundKeyId(
  selectedMaskedKey: string,
  keys: { id: string; key: string }[]
): string | null {
  if (!selectedMaskedKey) return null;
  return keys.find((k) => k.key === selectedMaskedKey)?.id ?? null;
}

/**
 * Qualify a provider-scoped playground model with its routing prefix so
 * OmniRoute can resolve it unambiguously.
 */
export function qualifyPlaygroundModel(
  model: string | null | undefined,
  routingPrefix: string | null | undefined
): string {
  const m = (model ?? "").trim();
  if (!m || !routingPrefix) return m;
  return m === routingPrefix || m.startsWith(`${routingPrefix}/`) ? m : `${routingPrefix}/${m}`;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  model?: string;
}

interface Stats {
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
}

export interface LlmChatControls {
  clear: () => void;
  hasMessages: boolean;
  streaming: boolean;
}

interface Props {
  providerId: string;
  initialModel?: string;
  embedded?: boolean;
  hideToolbar?: boolean;
  model?: string;
  onModelChange?: (model: string) => void;
  selectedKey?: string;
  onSelectedKeyChange?: (key: string) => void;
  controlsRef?: RefObject<LlmChatControls | null>;
  onControlsChange?: (controls: LlmChatControls) => void;
}

function extractDeltaContent(line: string): string {
  if (!line.startsWith("data: ")) return "";
  const payload = line.slice(6).trim();
  if (payload === "[DONE]") return "";
  try {
    const json = JSON.parse(payload) as Record<string, unknown>;
    const choices = Array.isArray(json.choices) ? json.choices : [];
    const first = choices[0] as Record<string, unknown> | undefined;
    const delta = first?.delta as Record<string, unknown> | undefined;
    const content = delta?.content;
    return typeof content === "string" ? content : "";
  } catch {
    return "";
  }
}

function extractUsage(line: string): { prompt_tokens?: number; completion_tokens?: number } | null {
  if (!line.startsWith("data: ")) return null;
  const payload = line.slice(6).trim();
  if (payload === "[DONE]") return null;
  try {
    const json = JSON.parse(payload) as Record<string, unknown>;
    const usage = json.usage as Record<string, unknown> | undefined;
    if (!usage) return null;
    return {
      prompt_tokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : undefined,
      completion_tokens:
        typeof usage.completion_tokens === "number" ? usage.completion_tokens : undefined,
    };
  } catch {
    return null;
  }
}

export function LlmChatCard({
  providerId,
  initialModel,
  embedded = false,
  hideToolbar = false,
  model: modelProp,
  onModelChange,
  selectedKey: selectedKeyProp,
  onSelectedKeyChange,
  controlsRef,
  onControlsChange,
}: Props) {
  const t = useTranslations("miniPlayground");
  const { keys } = useApiKey();
  const { models } = useProviderModels(providerId);

  const [internalSelectedKey, setInternalSelectedKey] = useState<string>("");
  const [internalModel, setInternalModel] = useState<string>(initialModel ?? "");
  const selectedKey = selectedKeyProp ?? internalSelectedKey;
  const setSelectedKey = useCallback(
    (k: string) => {
      if (onSelectedKeyChange) onSelectedKeyChange(k);
      else setInternalSelectedKey(k);
    },
    [onSelectedKeyChange]
  );
  const model = modelProp ?? internalModel;
  const setModel = useCallback(
    (m: string) => {
      if (onModelChange) onModelChange(m);
      else setInternalModel(m);
    },
    [onModelChange]
  );

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>("");
  const [streaming, setStreaming] = useState<boolean>(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const firstModel = models[0]?.id ?? "";
  const effectiveModel = model || firstModel || initialModel || "";
  const routingPrefix = getProviderAlias(providerId);
  const qualifiedModel = qualifyPlaygroundModel(effectiveModel, routingPrefix);

  useEffect(() => {
    if (embedded) textareaRef.current?.focus();
  }, [embedded]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streaming]);

  const handleClear = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setMessages([]);
    setStreaming(false);
    setStats(null);
  }, []);

  useImperativeHandle(
    controlsRef,
    () => ({
      clear: handleClear,
      hasMessages: messages.length > 0,
      streaming,
    }),
    [handleClear, messages.length, streaming]
  );

  useEffect(() => {
    if (onControlsChange) {
      onControlsChange({
        clear: handleClear,
        hasMessages: messages.length > 0,
        streaming,
      });
    }
  }, [handleClear, messages.length, streaming, onControlsChange]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setInput("");
    setStats(null);

    const userMessage: Message = { role: "user", content: text };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);

    setStreaming(true);

    const assistantMsgIndex = nextMessages.length;
    setMessages((prev) => [...prev, { role: "assistant", content: "", model: qualifiedModel }]);

    const startTime = performance.now();
    let promptTokens = 0;
    let completionTokens = 0;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const keyId = resolvePlaygroundKeyId(selectedKey, keys);
      if (keyId) {
        headers[PLAYGROUND_KEY_ID_HEADER] = keyId;
      }

      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: qualifiedModel,
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
          stream: true,
          stream_options: { include_usage: true },
        }),
      });

      if (!res.ok) {
        let errText = "";
        try {
          const errJson = (await res.json()) as Record<string, unknown>;
          const errObj = errJson.error as Record<string, unknown> | undefined;
          errText = typeof errObj?.message === "string" ? errObj.message : JSON.stringify(errJson);
        } catch {
          errText = await res.text();
        }
        throw new Error(errText || `HTTP ${res.status}`);
      }

      if (!res.body) {
        throw new Error("No response body");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          const usage = extractUsage(trimmed);
          if (usage) {
            if (usage.prompt_tokens) promptTokens = usage.prompt_tokens;
            if (usage.completion_tokens) completionTokens = usage.completion_tokens;
          }

          const delta = extractDeltaContent(trimmed);
          if (delta) {
            setMessages((prev) => {
              const updated = [...prev];
              const current = updated[assistantMsgIndex];
              if (current) {
                updated[assistantMsgIndex] = {
                  ...current,
                  content: current.content + delta,
                };
              }
              return updated;
            });
          }
        }
      }

      const latencyMs = performance.now() - startTime;
      setStats({
        tokensIn: promptTokens,
        tokensOut: completionTokens,
        latencyMs,
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;

      const errMsg = (err as Error).message || "An unknown error occurred";
      setMessages((prev) => {
        const updated = [...prev];
        updated[assistantMsgIndex] = {
          role: "assistant",
          content: `[${t("errorLabel")}: ${errMsg}]`,
        };
        return updated;
      });
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStreaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const modelOptions = models.length > 0 ? models : [];

  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        embedded ? "flex-1 min-h-0" : "rounded-lg border border-border bg-bg-card p-4"
      )}
    >
      {!hideToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <label className="text-xs text-text-muted shrink-0">{t("model")}:</label>
            <select
              value={model || firstModel}
              onChange={(e) => setModel(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-border bg-bg-subtle text-xs px-2 py-1 text-text-main focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {modelOptions.length === 0 && <option value="">{initialModel || "—"}</option>}
              {modelOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id}
                </option>
              ))}
            </select>
          </div>
          {keys.length > 0 && (
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-text-muted shrink-0">{t("selectKey")}:</label>
              <select
                value={selectedKey}
                onChange={(e) => setSelectedKey(e.target.value)}
                className="rounded-md border border-border bg-bg-subtle text-xs px-2 py-1 text-text-main focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">{t("defaultKey")}</option>
                {keys.map((k) => (
                  <option key={k.id} value={k.key}>
                    {k.name ?? k.id}
                  </option>
                ))}
              </select>
            </div>
          )}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              {t("clear")}
            </button>
          )}
        </div>
      )}

      <div
        ref={scrollRef}
        className={cn(
          "rounded-md border border-border bg-bg-subtle overflow-y-auto",
          embedded
            ? "flex-1 min-h-0"
            : messages.length === 0
              ? "min-h-[60px]"
              : "min-h-[80px] max-h-64"
        )}
      >
        {messages.length === 0 ? (
          <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="size-10 rounded-full bg-accent/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-accent text-[22px]">forum</span>
            </div>
            <p className="text-sm text-text-muted">{t("emptyConversation")}</p>
            <p className="text-[11px] text-text-muted/70">{t("sendHint")}</p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col divide-y divide-border/60">
            {messages.map((msg, i) => {
              const isUser = msg.role === "user";
              const isError =
                !isUser &&
                typeof msg.content === "string" &&
                msg.content.startsWith(`[${t("errorLabel")}`);
              return (
                <div
                  key={i}
                  className={cn(
                    "flex gap-3 px-4 py-4",
                    isUser ? "bg-transparent" : "bg-bg-card/40"
                  )}
                >
                  <div
                    className={cn(
                      "size-7 rounded-md flex items-center justify-center shrink-0 text-[14px] font-semibold",
                      isUser
                        ? "bg-primary/15 text-primary"
                        : isError
                          ? "bg-red-500/15 text-red-400"
                          : "bg-accent/15 text-accent"
                    )}
                    aria-hidden="true"
                  >
                    {isUser ? (
                      <span className="material-symbols-outlined text-[16px]">person</span>
                    ) : isError ? (
                      <span className="material-symbols-outlined text-[16px]">error</span>
                    ) : (
                      <span className="material-symbols-outlined text-[16px]">smart_toy</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="text-[10px] uppercase tracking-wider text-text-muted font-medium shrink-0">
                        {isUser ? t("you") : isError ? t("errorLabel") : t("assistant")}
                      </span>
                      {!isUser && !isError && msg.model && (
                        <span
                          className="text-[10px] font-mono text-text-muted/60 truncate"
                          title={msg.model}
                        >
                          · {msg.model}
                        </span>
                      )}
                    </div>
                    <div
                      className={cn(
                        "text-sm whitespace-pre-wrap break-words leading-relaxed",
                        isError ? "text-red-400" : "text-text-main"
                      )}
                    >
                      {msg.content}
                      {!isUser && streaming && i === messages.length - 1 && (
                        <span className="inline-block w-1.5 h-3.5 bg-text-main ml-0.5 align-text-bottom animate-pulse" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="relative flex items-end gap-2 rounded-lg border border-border bg-bg-subtle px-3 py-2 focus-within:ring-1 focus-within:ring-primary focus-within:border-primary/50 transition-colors">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={`${t("send")}…`}
          className="flex-1 bg-transparent text-sm py-1.5 text-text-main placeholder:text-text-muted focus:outline-none resize-none max-h-32"
        />
        {streaming ? (
          <button
            type="button"
            onClick={handleStop}
            title={t("stop")}
            className="size-8 flex items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">stop</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!input.trim()}
            title={t("send")}
            className="size-8 flex items-center justify-center rounded-md bg-primary text-white hover:opacity-90 disabled:opacity-40 transition-opacity shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
          </button>
        )}
      </div>

      {stats && (
        <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
          <span className="material-symbols-outlined text-[13px]">bolt</span>
          <span>
            {t("statsLine", {
              ms: Math.round(stats.latencyMs),
              tokensIn: stats.tokensIn,
              tokensOut: stats.tokensOut,
            })}
          </span>
        </div>
      )}
    </div>
  );
}
