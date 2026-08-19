import type { SidebarItemId } from "@/shared/constants/sidebarVisibility";
import { PLUGIN_CATALOG } from "./catalog";
import type { SidebarPluginCatalogEntry } from "./catalog";

export const PLUGIN_RELEASE_VERSION = "1.0.0";
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

function toPlugin(entry: SidebarPluginCatalogEntry): SidebarPluginDefinition {
  const bundleFile = `${entry.id}-${PLUGIN_RELEASE_VERSION}.mjs`;
  return Object.freeze({
    id: entry.id,
    version: PLUGIN_RELEASE_VERSION,
    source: "github-release",
    bundleUrl: `${DEFAULT_RELEASE_BASE}/${bundleFile}`,
    bundleFile,
    integrityEnv: entry.integrityEnv,
    route: entry.route,
  });
}

const entries = PLUGIN_CATALOG.map((entry) => [entry.id, toPlugin(entry)] as const);

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
  const value = process.env[plugin.integrityEnv]?.trim().toLowerCase();
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
