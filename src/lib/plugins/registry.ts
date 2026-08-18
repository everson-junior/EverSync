import { SIDEBAR_SECTIONS, getSectionItems } from "@/shared/constants/sidebarVisibility";
import type { SidebarItemDefinition, SidebarItemId } from "@/shared/constants/sidebarVisibility";

export const PLUGIN_RELEASE_VERSION = "3.8.50";
const DEFAULT_RELEASE_BASE = "https://github.com/everson-junior/EverSync/releases/download/v3.8.50";

export interface SidebarPluginDefinition {
  id: SidebarItemId;
  version: string;
  source: "github-release" | "npm";
  bundleUrl: string;
  bundleFile: string;
  integrityEnv: string;
  route: string;
}

function integrityEnvName(id: string): string {
  return `EVERSYNC_PLUGIN_SHA256_${id.replaceAll("-", "_").toUpperCase()}`;
}

function toPlugin(item: SidebarItemDefinition): SidebarPluginDefinition {
  const bundleFile = `${item.id}-${PLUGIN_RELEASE_VERSION}.mjs`;
  return Object.freeze({
    id: item.id,
    version: PLUGIN_RELEASE_VERSION,
    source: "github-release",
    bundleUrl: `${DEFAULT_RELEASE_BASE}/${bundleFile}`,
    bundleFile,
    integrityEnv: integrityEnvName(item.id),
    route: item.href,
  });
}

const entries = SIDEBAR_SECTIONS.flatMap(getSectionItems)
  .filter((item) => !item.isNative && !item.external)
  .map((item) => [item.id, toPlugin(item)] as const);

/** Only non-Minimal entries are registered. Native entries never acquire a network source. */
export const PLUGIN_REGISTRY: ReadonlyMap<SidebarItemId, SidebarPluginDefinition> = new Map(
  entries
);

export function getPluginDefinition(id: string): SidebarPluginDefinition | null {
  return PLUGIN_REGISTRY.get(id as SidebarItemId) ?? null;
}

export function getPluginForRoute(pathname: string): SidebarPluginDefinition | null {
  let best: SidebarPluginDefinition | null = null;
  for (const plugin of PLUGIN_REGISTRY.values()) {
    if (pathname === plugin.route || pathname.startsWith(`${plugin.route}/`)) {
      if (!best || plugin.route.length > best.route.length) best = plugin;
    }
  }
  return best;
}

export function resolvePluginBundleUrl(
  plugin: SidebarPluginDefinition,
  releaseBase = process.env.EVERSYNC_PLUGIN_RELEASE_BASE
): string {
  if (!releaseBase) return plugin.bundleUrl;
  return `${releaseBase.replace(/\/$/, "")}/${plugin.bundleFile}`;
}

export function resolvePluginIntegrity(plugin: SidebarPluginDefinition): string | null {
  const value = (process.env[plugin.integrityEnv] ?? process.env.EVERSYNC_PLUGIN_SHA256)
    ?.trim()
    .toLowerCase();
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
