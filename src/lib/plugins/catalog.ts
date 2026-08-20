import { SIDEBAR_SECTIONS, getSectionItems } from "../../shared/constants/sidebarVisibility";
import type { SidebarItemId } from "../../shared/constants/sidebarVisibility";

export interface SidebarPluginCatalogEntry {
  id: SidebarItemId;
  route: string;
  integrityEnv: string;
}

const PUBLISHABLE_PLUGIN_IDS = new Set<SidebarItemId>([
  "acp-agents",
  "activity",
  "agent-bridge",
  "agent-skills",
  "a2a",
  "analytics-combo-health",
  "analytics-compression",
  "analytics-evals",
  "analytics-search",
  "analytics-utilization",
  "api-endpoints",
  "audit",
  "audit-a2a",
  "audit-mcp",
  "batch",
  "batch-files",
  "cache",
  "chaos-config",
  "cli-agents",
  "cli-code",
  "cloud-agents",
  "combos-live",
  "compression-exclusions",
  "compression-studio",
  "context-aggressive",
  "context-caveman",
  "context-ccr",
  "context-combos",
  "context-headroom",
  "context-lite",
  "context-llmlingua",
  "context-omniglyph",
  "context-rtk",
  "context-session-dedup",
  "context-settings",
  "context-ultra",
  "costs-budget",
  "costs-free-tiers",
  "costs-pricing",
  "costs-quota-share",
  "discovery",
  "embedded-services",
  "free-provider-rankings",
  "leaderboard",
  "logs-console",
  "logs-proxy",
  "logs-timeline",
  "mcp",
  "media",
  "memory",
  "playground",
  "plugins",
  "profile",
  "provider-stats",
  "quota",
  "runtime",
  "search-tools",
  "settings-access-tokens",
  "settings-advanced",
  "settings-ai",
  "settings-appearance",
  "settings-cache",
  "settings-feature-flags",
  "settings-resilience",
  "settings-routing",
  "settings-security",
  "skills",
  "tokens",
  "traffic-inspector",
  "translator",
  "webhooks",
]);

function integrityEnvName(id: string): string {
  return `EVERSYNC_PLUGIN_SHA256_${id.replaceAll("-", "_").toUpperCase()}`;
}

function buildPluginCatalog(): readonly SidebarPluginCatalogEntry[] {
  const entries = SIDEBAR_SECTIONS.flatMap(getSectionItems)
    .filter((item) => !item.isNative && !item.external)
    .filter((item) => PUBLISHABLE_PLUGIN_IDS.has(item.id))
    .map((item) =>
      Object.freeze({
        id: item.id,
        route: item.href,
        integrityEnv: integrityEnvName(item.id),
      })
    );
  const uniqueIds = new Set(entries.map((entry) => entry.id));
  const uniqueRoutes = new Set(entries.map((entry) => entry.route));
  if (
    entries.length !== PUBLISHABLE_PLUGIN_IDS.size ||
    uniqueIds.size !== entries.length ||
    uniqueRoutes.size !== entries.length
  ) {
    throw new Error(
      "Sidebar plugin catalog must contain the configured unique publishable plugins"
    );
  }
  return Object.freeze(entries);
}

export const PLUGIN_CATALOG = buildPluginCatalog();
