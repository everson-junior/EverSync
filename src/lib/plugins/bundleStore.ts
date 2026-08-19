import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveDataDir } from "@/lib/dataPaths";
import { safeOutboundFetch } from "@/shared/network/safeOutboundFetch";
import { parseSidebarPluginEnvelopeHeader } from "./contract";
import type { SidebarPluginDefinition } from "./registry";
import {
  resolvePluginArtifactFromManifest,
  resolvePluginBundleUrl,
  resolvePluginIntegrity,
  resolvePluginManifestUrl,
} from "./registry";

const MAX_BUNDLE_BYTES = 10 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const BODY_READ_TIMEOUT_MS = 30_000;

type PluginBundleFetcher = typeof safeOutboundFetch;

export interface PluginBundleInstallOptions {
  signal?: AbortSignal;
  bodyReadTimeoutMs?: number;
  beforeMetadataCommit?: () => void | Promise<void>;
  reuseExisting?: boolean;
}

export type PluginInstallFailureCategory =
  "configuration" | "download" | "integrity" | "compatibility" | "storage";

export class PluginInstallError extends Error {
  constructor(
    public readonly category: PluginInstallFailureCategory,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "PluginInstallError";
  }
}

export interface InstalledSidebarPlugin {
  id: string;
  version: string;
  installedAt: string;
  checksum: string;
  bundlePath: string;
  status: "installed";
}

export type PublicInstalledSidebarPlugin = Omit<InstalledSidebarPlugin, "bundlePath">;

export interface VerifiedInstalledSidebarPlugin {
  plugin: InstalledSidebarPlugin;
  body: Buffer;
}

function pluginCacheDir(): string {
  return path.join(resolveDataDir(), "sidebar-plugins");
}

function validatePluginArtifactSegments(plugin: SidebarPluginDefinition): void {
  const segments = [plugin.id, plugin.bundleFile];
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.includes("\0") ||
        path.posix.basename(segment) !== segment ||
        path.win32.basename(segment) !== segment
    )
  ) {
    throw new Error("Plugin cache artifact names must be safe path segments");
  }
}

export function pluginBundlePath(plugin: SidebarPluginDefinition): string {
  validatePluginArtifactSegments(plugin);
  return path.join(pluginCacheDir(), plugin.bundleFile);
}

function pluginMetadataPath(plugin: SidebarPluginDefinition): string {
  validatePluginArtifactSegments(plugin);
  return path.join(pluginCacheDir(), `${plugin.id}.json`);
}

async function readBodyLimited(response: Response, signal: AbortSignal): Promise<Buffer> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BUNDLE_BYTES) {
    await response.body?.cancel("Plugin bundle exceeds 10 MiB").catch(() => undefined);
    throw new Error("Plugin bundle exceeds 10 MiB");
  }
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const cancelOnAbort = () => {
    void reader.cancel(signal.reason).catch(() => undefined);
  };
  try {
    signal.addEventListener("abort", cancelOnAbort, { once: true });
    if (signal.aborted) {
      await reader.cancel(signal.reason).catch(() => undefined);
      signal.throwIfAborted();
    }
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_BUNDLE_BYTES) {
        await reader.cancel("Plugin bundle exceeds 10 MiB").catch(() => undefined);
        throw new Error("Plugin bundle exceeds 10 MiB");
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener("abort", cancelOnAbort);
    reader.releaseLock();
  }
  return Buffer.concat(chunks, byteLength);
}

function isInstalledPlugin(
  value: unknown,
  plugin: SidebarPluginDefinition
): value is InstalledSidebarPlugin {
  if (typeof value !== "object" || value === null) return false;
  const metadata = value as Partial<InstalledSidebarPlugin>;
  const installedBundleFile =
    metadata.version === plugin.version
      ? plugin.bundleFile
      : `${plugin.id}-${metadata.version}.mjs`;
  return (
    metadata.id === plugin.id &&
    typeof metadata.version === "string" &&
    (metadata.version === plugin.version ||
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(metadata.version)) &&
    metadata.status === "installed" &&
    typeof metadata.installedAt === "string" &&
    typeof metadata.checksum === "string" &&
    /^[a-f0-9]{64}$/.test(metadata.checksum) &&
    typeof metadata.bundlePath === "string" &&
    path.dirname(metadata.bundlePath) === pluginCacheDir() &&
    path.basename(metadata.bundlePath).startsWith(`${installedBundleFile}.generation-`)
  );
}

async function resolveInstallArtifact(
  plugin: SidebarPluginDefinition,
  fetchBundle: PluginBundleFetcher,
  signal?: AbortSignal
): Promise<{ plugin: SidebarPluginDefinition; checksum: string }> {
  const configuredChecksum = resolvePluginIntegrity(plugin);
  if (configuredChecksum) return { plugin, checksum: configuredChecksum };

  let response: Response;
  try {
    response = await fetchBundle(resolvePluginManifestUrl(), {
      guard: "block-private",
      allowRedirect: true,
      timeoutMs: DOWNLOAD_TIMEOUT_MS,
      signal,
      retry: { attempts: 2, methods: ["GET"] },
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      await response.body?.cancel(`HTTP ${response.status}`).catch(() => undefined);
      throw new Error(`HTTP ${response.status}`);
    }
    const deadline = AbortSignal.timeout(BODY_READ_TIMEOUT_MS);
    const body = await readBodyLimited(
      response,
      signal ? AbortSignal.any([signal, deadline]) : deadline
    );
    return resolvePluginArtifactFromManifest(plugin, JSON.parse(body.toString("utf8")));
  } catch (error) {
    throw new PluginInstallError("configuration", "Plugin release manifest is unavailable", {
      cause: error,
    });
  }
}

function validateBundleEnvelope(body: Buffer, plugin: SidebarPluginDefinition): void {
  try {
    parseSidebarPluginEnvelopeHeader(body, { id: plugin.id, route: plugin.route });
  } catch (error) {
    throw new PluginInstallError("compatibility", "Plugin bundle is incompatible", {
      cause: error,
    });
  }
}

export function toPublicInstalledPlugin(
  plugin: InstalledSidebarPlugin
): PublicInstalledSidebarPlugin {
  const { bundlePath: _bundlePath, ...publicPlugin } = plugin;
  return publicPlugin;
}

const installQueues = new Map<string, Promise<void>>();

async function withPluginInstallLock<T>(pluginId: string, operation: () => Promise<T>): Promise<T> {
  const previous = installQueues.get(pluginId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.catch(() => undefined).then(() => current);
  installQueues.set(pluginId, queued);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (installQueues.get(pluginId) === queued) installQueues.delete(pluginId);
  }
}

function pluginArtifactNames(plugin: SidebarPluginDefinition): {
  metadata: string;
  bundle: string;
} {
  validatePluginArtifactSegments(plugin);
  const metadata = `${plugin.id}.json`;
  const bundle = plugin.bundleFile;
  return {
    metadata,
    bundle,
  };
}

function isOwnedPluginArtifact(
  entry: string,
  names: ReturnType<typeof pluginArtifactNames>
): boolean {
  return (
    entry === names.metadata ||
    entry === names.bundle ||
    entry.startsWith(`${names.bundle}.generation-`) ||
    entry.startsWith(`${names.bundle}.tmp-`) ||
    entry.startsWith(`${names.metadata}.tmp-`)
  );
}

async function removePluginArtifactsUnlocked(plugin: SidebarPluginDefinition): Promise<void> {
  const names = pluginArtifactNames(plugin);
  const directory = pluginCacheDir();
  const entries = await readdir(directory).catch(() => [] as string[]);
  const ownedEntries = entries.filter((entry) => isOwnedPluginArtifact(entry, names));
  await Promise.all(ownedEntries.map((entry) => rm(path.join(directory, entry), { force: true })));
}

async function removeStalePluginArtifacts(
  plugin: SidebarPluginDefinition,
  retainedPaths: readonly string[]
): Promise<void> {
  const names = pluginArtifactNames(plugin);
  const directory = pluginCacheDir();
  const retainedEntries = new Set(retainedPaths.map((retainedPath) => path.basename(retainedPath)));
  const entries = await readdir(directory).catch(() => [] as string[]);
  await Promise.all(
    entries
      .filter(
        (entry) =>
          isOwnedPluginArtifact(entry, names) &&
          entry !== names.metadata &&
          !retainedEntries.has(entry)
      )
      .map((entry) => rm(path.join(directory, entry), { force: true }))
  );
}

export async function readVerifiedInstalledPlugin(
  plugin: SidebarPluginDefinition
): Promise<VerifiedInstalledSidebarPlugin | null> {
  try {
    const metadata: unknown = JSON.parse(await readFile(pluginMetadataPath(plugin), "utf8"));
    if (!isInstalledPlugin(metadata, plugin)) return null;
    const body = await readFile(metadata.bundlePath);
    const checksum = createHash("sha256").update(body).digest("hex");
    return checksum === metadata.checksum ? { plugin: metadata, body } : null;
  } catch {
    return null;
  }
}

export async function readInstalledPlugin(
  plugin: SidebarPluginDefinition
): Promise<InstalledSidebarPlugin | null> {
  return (await readVerifiedInstalledPlugin(plugin))?.plugin ?? null;
}

export async function clearInstalledPlugin(plugin: SidebarPluginDefinition): Promise<void> {
  return withPluginInstallLock(plugin.id, () => removePluginArtifactsUnlocked(plugin));
}

export function getPluginInstallFailureCategory(error: unknown): PluginInstallFailureCategory {
  return error instanceof PluginInstallError ? error.category : "storage";
}

export async function installPluginBundle(
  plugin: SidebarPluginDefinition,
  fetchBundle: PluginBundleFetcher = safeOutboundFetch,
  options: PluginBundleInstallOptions = {}
): Promise<InstalledSidebarPlugin> {
  validatePluginArtifactSegments(plugin);
  return withPluginInstallLock(plugin.id, () =>
    installPluginBundleUnlocked(plugin, fetchBundle, options)
  );
}

async function installPluginBundleUnlocked(
  plugin: SidebarPluginDefinition,
  fetchBundle: PluginBundleFetcher,
  options: PluginBundleInstallOptions
): Promise<InstalledSidebarPlugin> {
  if (options.reuseExisting) {
    const installed = await readVerifiedInstalledPlugin(plugin);
    if (installed?.plugin.version === plugin.version) return installed.plugin;
  }

  const artifact = await resolveInstallArtifact(plugin, fetchBundle, options.signal);
  plugin = artifact.plugin;
  const expectedChecksum = artifact.checksum;

  const directory = pluginCacheDir();
  const operationId = randomUUID();
  const temporaryBundle = path.join(directory, `${plugin.bundleFile}.tmp-${operationId}.mjs`);
  const finalBundle = path.join(directory, `${plugin.bundleFile}.generation-${operationId}`);
  const finalMetadata = pluginMetadataPath(plugin);
  const temporaryMetadata = `${finalMetadata}.tmp-${operationId}`;

  await mkdir(directory, { recursive: true });
  let promoted = false;

  try {
    let response: Response;
    try {
      response = await fetchBundle(resolvePluginBundleUrl(plugin), {
        guard: "block-private",
        allowRedirect: true,
        timeoutMs: DOWNLOAD_TIMEOUT_MS,
        signal: options.signal,
        retry: { attempts: 2, methods: ["GET"] },
        headers: { Accept: "text/javascript, application/javascript" },
      });
      if (!response.ok) {
        await response.body?.cancel(`HTTP ${response.status}`).catch(() => undefined);
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      throw new PluginInstallError("download", "Plugin download failed", { cause: error });
    }

    let body: Buffer;
    const bodyDeadline = new AbortController();
    const bodyTimer = setTimeout(
      () => bodyDeadline.abort(new Error("Plugin body read timed out")),
      options.bodyReadTimeoutMs ?? BODY_READ_TIMEOUT_MS
    );
    try {
      const bodySignal = options.signal
        ? AbortSignal.any([options.signal, bodyDeadline.signal])
        : bodyDeadline.signal;
      body = await readBodyLimited(response, bodySignal);
    } catch (error) {
      throw new PluginInstallError("download", "Plugin download failed", { cause: error });
    } finally {
      clearTimeout(bodyTimer);
    }
    options.signal?.throwIfAborted();
    const checksum = createHash("sha256").update(body).digest("hex");
    if (checksum !== expectedChecksum) {
      throw new PluginInstallError("integrity", "Plugin bundle checksum mismatch");
    }

    options.signal?.throwIfAborted();
    validateBundleEnvelope(body, plugin);
    await writeFile(temporaryBundle, body, { flag: "wx", mode: 0o600 });
    await rename(temporaryBundle, finalBundle);
    promoted = true;

    const metadata: InstalledSidebarPlugin = {
      id: plugin.id,
      version: plugin.version,
      installedAt: new Date().toISOString(),
      checksum,
      bundlePath: finalBundle,
      status: "installed",
    };
    await writeFile(temporaryMetadata, JSON.stringify(metadata), { flag: "wx", mode: 0o600 });
    await options.beforeMetadataCommit?.();
    options.signal?.throwIfAborted();
    await rename(temporaryMetadata, finalMetadata);
    await removeStalePluginArtifacts(plugin, [
      finalBundle,
      temporaryBundle,
      temporaryMetadata,
    ]).catch(() => undefined);
    return metadata;
  } catch (error) {
    await Promise.all([
      rm(temporaryBundle, { force: true }),
      rm(temporaryMetadata, { force: true }),
      promoted ? rm(finalBundle, { force: true }) : Promise.resolve(),
    ]);
    throw error;
  }
}
