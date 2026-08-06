// @vitest-environment jsdom
/**
 * ProviderPageHeader — discreet "Partner link" indicator on the top-of-page
 * website link for the 3 visible Kimi (Moonshot AI) provider cards
 * (kimi-coding, kimi-web, moonshot). Presentation only — see
 * featuredProviders.ts (isKimiPartnerProviderId) and the aff-link URLs
 * asserted in tests/unit/kimi-partner-aff-links.test.ts.
 */
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import ProviderPageHeader from "@/app/(dashboard)/dashboard/providers/[id]/components/ProviderPageHeader";

// No `.has` method — providerText() falls back to the hardcoded English
// default, matching the pattern used in providerCardKimiPartnerAccent.test.tsx.
const t = (key: string) => key;

describe("ProviderPageHeader — Kimi partner-link note", () => {
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    if (container) {
      document.body.removeChild(container);
      container = null;
    }
  });

  async function renderHeader(id: string, name: string, website: string) {
    container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ProviderPageHeader
          providerId={id}
          providerInfo={{ id, name, website, color: "#1783FF" }}
          connectionsCount={0}
          isOpenAICompatible={false}
          isAnthropicProtocolCompatible={false}
          onOpenTutorial={() => {}}
          t={t}
        />
      );
    });
    return container;
  }

  it.each([
    [
      "moonshot",
      "Kimi",
      "https://kimi-bot.com/activities/invite/share?scenario=invite&from=share_poster&invitation_code=FW9JFR",
    ],
    [
      "kimi-coding",
      "Kimi Code CLI",
      "https://kimi-bot.com/activities/invite/share?scenario=invite&from=share_poster&invitation_code=FW9JFR",
    ],
    [
      "kimi-web",
      "Kimi Web",
      "https://kimi-bot.com/activities/invite/share?scenario=invite&from=share_poster&invitation_code=FW9JFR",
    ],
  ])("flags the %s header link as a partner link", async (id, name, website) => {
    const el = await renderHeader(id, name, website);
    // The component also renders a "Back to Providers" <Link> above the
    // website title link — target the website anchor specifically, not the
    // first <a> in the tree.
    const link = Array.from(el.querySelectorAll("a")).find(
      (a) => a.getAttribute("href") === website
    );
    expect(link).not.toBeUndefined();
    expect(link?.getAttribute("title")).toBe(
      "Partner link — supports OmniRoute at no extra cost to you"
    );
    expect(link?.getAttribute("aria-label")).toBe(
      `${name} — Partner link — supports OmniRoute at no extra cost to you`
    );
    expect(el.textContent).toContain("Partner link — supports OmniRoute at no extra cost to you");
  });

  it("does NOT flag an unrelated provider's website link as a partner link", async () => {
    const el = await renderHeader("openai", "OpenAI", "https://openai.com");
    const link = el.querySelector(`a[href="https://openai.com"]`);
    expect(link).not.toBeNull();
    expect(link?.getAttribute("title")).toBeNull();
    expect(link?.getAttribute("aria-label")).toBeNull();
    expect(el.textContent).not.toContain("Partner link");
  });
});
