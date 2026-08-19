import type { SidebarItemId } from "@/shared/constants/sidebarVisibility";
import { PLUGIN_CATALOG } from "./catalog";
import type { SidebarPluginCatalogEntry } from "./catalog";

export const PLUGIN_RELEASE_VERSION = "1.0.0";
const DEFAULT_RELEASE_BASE = "https://github.com/everson-junior/EverSync/releases/download/v1.0.0";
const LATEST_RELEASE_BASE = "https://github.com/everson-junior/EverSync/releases/latest/download";
const RELEASE_DOWNLOAD_ROOT = "https://github.com/everson-junior/EverSync/releases/download";

export interface SidebarPluginDefinition {
  id: SidebarItemId;
  version: string;
  source: "github-release" | "npm";
  bundleUrl: string;
  bundleFile: string;
  integrityEnv: string;
  route: string;
}

export interface ResolvedSidebarPluginArtifact {
  plugin: SidebarPluginDefinition;
  checksum: string;
}

interface SidebarPluginManifestAsset {
  id: string;
  route: string;
  file: string;
  version: string;
  sha256: string;
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

export function resolvePluginManifestUrl(): string {
  return process.env.EVERSYNC_PLUGIN_MANIFEST_URL?.trim() || `${LATEST_RELEASE_BASE}/manifest.json`;
}

export function resolvePluginArtifactFromManifest(
  plugin: SidebarPluginDefinition,
  value: unknown
): ResolvedSidebarPluginArtifact {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid sidebar plugin release manifest");
  }
  const manifest = value as Record<string, unknown>;
  const releaseVersion = manifest.releaseVersion;
  if (
    typeof releaseVersion !== "string" ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(releaseVersion) ||
    manifest.sourceMode !== "strict" ||
    !Array.isArray(manifest.assets) ||
    manifest.assets.length !== PLUGIN_CATALOG.length
  ) {
    throw new Error("Invalid sidebar plugin release manifest");
  }

  const asset = manifest.assets.find(
    (candidate): candidate is SidebarPluginManifestAsset =>
      typeof candidate === "object" &&
      candidate !== null &&
      (candidate as { id?: unknown }).id === plugin.id
  );
  const expectedFile = `${plugin.id}-${releaseVersion}.mjs`;
  if (
    !asset ||
    asset.route !== plugin.route ||
    asset.version !== releaseVersion ||
    asset.file !== expectedFile ||
    !/^[a-f0-9]{64}$/.test(asset.sha256)
  ) {
    throw new Error(`Invalid release manifest asset for '${plugin.id}'`);
  }

  const releaseBase = process.env.EVERSYNC_PLUGIN_RELEASE_BASE?.trim().replace(/\/$/, "");
  const bundleUrl = releaseBase
    ? `${releaseBase}/${expectedFile}`
    : `${RELEASE_DOWNLOAD_ROOT}/v${releaseVersion}/${expectedFile}`;
  return {
    plugin: Object.freeze({
      ...plugin,
      version: releaseVersion,
      bundleFile: expectedFile,
      bundleUrl,
    }),
    checksum: asset.sha256,
  };
}
