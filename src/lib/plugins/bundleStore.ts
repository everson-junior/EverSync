import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveDataDir } from "@/lib/dataPaths";
import { safeOutboundFetch } from "@/shared/network/safeOutboundFetch";
import type { SidebarPluginDefinition } from "./registry";
import { resolvePluginBundleUrl, resolvePluginIntegrity } from "./registry";

const MAX_BUNDLE_BYTES = 10 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30_000;

type PluginBundleFetcher = typeof safeOutboundFetch;

export interface InstalledSidebarPlugin {
  id: string;
  version: string;
  installedAt: string;
  checksum: string;
  bundlePath: string;
  status: "installed";
}

function pluginCacheDir(): string {
  return path.join(resolveDataDir(), "sidebar-plugins");
}

export function pluginBundlePath(plugin: SidebarPluginDefinition): string {
  return path.join(pluginCacheDir(), plugin.bundleFile);
}

function pluginMetadataPath(plugin: SidebarPluginDefinition): string {
  return path.join(pluginCacheDir(), `${plugin.id}.json`);
}

async function readBodyLimited(response: Response): Promise<Buffer> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BUNDLE_BYTES) throw new Error("Plugin bundle exceeds 10 MiB");
  const body = Buffer.from(await response.arrayBuffer());
  if (body.byteLength > MAX_BUNDLE_BYTES) throw new Error("Plugin bundle exceeds 10 MiB");
  return body;
}

export async function readInstalledPlugin(
  plugin: SidebarPluginDefinition
): Promise<InstalledSidebarPlugin | null> {
  try {
    const metadata = JSON.parse(await readFile(pluginMetadataPath(plugin), "utf8"));
    if (metadata?.id !== plugin.id || metadata?.version !== plugin.version) return null;
    await readFile(pluginBundlePath(plugin));
    return metadata as InstalledSidebarPlugin;
  } catch {
    return null;
  }
}

export async function clearInstalledPlugin(plugin: SidebarPluginDefinition): Promise<void> {
  await Promise.all([
    rm(pluginBundlePath(plugin), { force: true }),
    rm(pluginMetadataPath(plugin), { force: true }),
  ]);
}

export async function installPluginBundle(
  plugin: SidebarPluginDefinition,
  fetchBundle: PluginBundleFetcher = safeOutboundFetch
): Promise<InstalledSidebarPlugin> {
  const expectedChecksum = resolvePluginIntegrity(plugin);
  if (!expectedChecksum) {
    throw new Error(`Missing SHA-256 configuration for plugin '${plugin.id}'`);
  }

  const directory = pluginCacheDir();
  const finalBundle = pluginBundlePath(plugin);
  const partialBundle = `${finalBundle}.partial`;
  const finalMetadata = pluginMetadataPath(plugin);
  const partialMetadata = `${finalMetadata}.partial`;

  await mkdir(directory, { recursive: true });
  await clearInstalledPlugin(plugin);

  try {
    const response = await fetchBundle(resolvePluginBundleUrl(plugin), {
      guard: "block-private",
      allowRedirect: true,
      timeoutMs: DOWNLOAD_TIMEOUT_MS,
      retry: { attempts: 2, methods: ["GET"] },
      headers: { Accept: "text/javascript, application/javascript" },
    });
    if (!response.ok) throw new Error(`Plugin download failed with HTTP ${response.status}`);

    const body = await readBodyLimited(response);
    const checksum = createHash("sha256").update(body).digest("hex");
    if (checksum !== expectedChecksum) throw new Error("Plugin bundle checksum mismatch");

    await writeFile(partialBundle, body, { flag: "wx", mode: 0o600 });
    await rename(partialBundle, finalBundle);

    const metadata: InstalledSidebarPlugin = {
      id: plugin.id,
      version: plugin.version,
      installedAt: new Date().toISOString(),
      checksum,
      bundlePath: finalBundle,
      status: "installed",
    };
    await writeFile(partialMetadata, JSON.stringify(metadata), { flag: "wx", mode: 0o600 });
    await rename(partialMetadata, finalMetadata);
    return metadata;
  } catch (error) {
    await Promise.all([
      rm(partialBundle, { force: true }),
      rm(partialMetadata, { force: true }),
      clearInstalledPlugin(plugin),
    ]);
    throw error;
  }
}
