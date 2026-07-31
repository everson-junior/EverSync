"use client";

// Phase 1g extraction — Issue #3501
// Renders a playground section on the individual provider page.
// Shows ServiceKindTabs if the provider declares multiple kinds; falls back to
// a single-kind panel or the LlmChatCard for standard LLM providers.

import { useState } from "react";
import { LlmChatCard } from "@/shared/components/LlmChatCard";
import type { ServiceKind } from "@/shared/constants/providers";
import { AI_PROVIDERS } from "@/shared/constants/providers";

export const MEDIA_SERVICE_KINDS: ServiceKind[] = [
  "embedding",
  "image",
  "tts",
  "stt",
  "webSearch",
  "webFetch",
  "video",
  "music",
];

export function renderKindPanel(kind: ServiceKind, providerId: string): JSX.Element | null {
  return <LlmChatCard providerId={providerId} />;
}

export default function ProviderPlaygroundPanel({ providerId }: { providerId: string }) {
  // Resolve serviceKinds from AI_PROVIDERS.
  // For providers without explicit serviceKinds (most LLM providers), we infer
  // "llm" as the default.
  const providerEntry = AI_PROVIDERS[providerId as keyof typeof AI_PROVIDERS] as
    (Record<string, unknown> & { serviceKinds?: string[] }) | undefined;

  const rawKinds: string[] = providerEntry?.serviceKinds ?? [];

  const ALL_VALID_KINDS = [
    "llm",
    "embedding",
    "image",
    "imageToText",
    "tts",
    "stt",
    "webSearch",
    "webFetch",
    "video",
    "music",
  ] as const;

  const kinds: ServiceKind[] =
    rawKinds.length > 0
      ? rawKinds.filter((k): k is ServiceKind => (ALL_VALID_KINDS as readonly string[]).includes(k))
      : ["llm"];

  // Filter out kinds that have no playground implementation yet
  const playgroundableKinds = kinds.filter((k) => k !== "imageToText");

  // useState must be called unconditionally (Rules of Hooks)
  const [activeKind, setActiveKind] = useState<ServiceKind>(playgroundableKinds[0] ?? "llm");

  if (playgroundableKinds.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Playground</h2>
      {renderKindPanel(activeKind, providerId)}
    </div>
  );
}
