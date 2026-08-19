import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  HOST_PLUGIN_CONTRACT_VERSION,
  parseSidebarPluginEnvelopeHeader,
} from "../../src/lib/plugins/contract";
import { PLUGIN_CATALOG } from "../../src/lib/plugins/catalog";
import { PLUGIN_RELEASE_VERSION } from "../../src/lib/plugins/registry";

export type SidebarModuleSourceMode = "validation" | "strict";

export interface SidebarModuleManifestAsset {
  id: string;
  route: string;
  file: string;
  size: number;
  sha256: string;
  version: string;
  contractRange: string;
}

export interface SidebarModuleManifest {
  releaseVersion: string;
  contractVersion: string;
  sourceMode: SidebarModuleSourceMode;
  sourceSha: string;
  assets: SidebarModuleManifestAsset[];
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid sidebar module manifest: '${label}' must be a non-empty string`);
  }
  return value;
}

function parseAsset(value: unknown, index: number): SidebarModuleManifestAsset {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid sidebar module manifest: asset ${index} must be an object`);
  }
  const candidate = value as Record<string, unknown>;
  const size = candidate.size;
  const sha256 = requireString(candidate.sha256, `assets[${index}].sha256`);
  if (!Number.isSafeInteger(size) || (size as number) <= 0) {
    throw new Error(`Invalid sidebar module manifest: asset ${index} has invalid size`);
  }
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error(`Invalid sidebar module manifest: asset ${index} has invalid SHA-256`);
  }
  return {
    id: requireString(candidate.id, `assets[${index}].id`),
    route: requireString(candidate.route, `assets[${index}].route`),
    file: requireString(candidate.file, `assets[${index}].file`),
    size: size as number,
    sha256,
    version: requireString(candidate.version, `assets[${index}].version`),
    contractRange: requireString(candidate.contractRange, `assets[${index}].contractRange`),
  };
}

export function parseSidebarModuleManifest(value: unknown): SidebarModuleManifest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid sidebar module manifest: expected an object");
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.sourceMode !== "validation" && candidate.sourceMode !== "strict") {
    throw new Error("Invalid sidebar module manifest: unsupported source mode");
  }
  if (!Array.isArray(candidate.assets)) {
    throw new Error("Invalid sidebar module manifest: 'assets' must be an array");
  }
  return {
    releaseVersion: requireString(candidate.releaseVersion, "releaseVersion"),
    contractVersion: requireString(candidate.contractVersion, "contractVersion"),
    sourceMode: candidate.sourceMode,
    sourceSha: requireString(candidate.sourceSha, "sourceSha"),
    assets: candidate.assets.map(parseAsset),
  };
}

export async function validateSidebarModuleManifestDirectory(
  outputDirectory: string
): Promise<SidebarModuleManifest> {
  const manifest = parseSidebarModuleManifest(
    JSON.parse(await readFile(path.join(outputDirectory, "manifest.json"), "utf8"))
  );
  if (manifest.releaseVersion !== PLUGIN_RELEASE_VERSION) {
    throw new Error(`Sidebar module manifest release version must be ${PLUGIN_RELEASE_VERSION}`);
  }
  if (manifest.contractVersion !== HOST_PLUGIN_CONTRACT_VERSION) {
    throw new Error(
      `Sidebar module manifest contract version must be ${HOST_PLUGIN_CONTRACT_VERSION}`
    );
  }
  if (!/^[a-f0-9]{40,64}$/.test(manifest.sourceSha)) {
    throw new Error("Sidebar module manifest provenance sourceSha must be a 40-64 character SHA");
  }
  if (manifest.assets.length !== PLUGIN_CATALOG.length) {
    throw new Error(`Sidebar module manifest must contain ${PLUGIN_CATALOG.length} assets`);
  }

  const files = new Set(await readdir(outputDirectory));
  const expectedFiles = new Set(["manifest.json"]);
  const ids = new Set<string>();
  const routes = new Set<string>();
  for (const [index, catalogEntry] of PLUGIN_CATALOG.entries()) {
    const asset = manifest.assets[index];
    const expectedFile = `${catalogEntry.id}-${PLUGIN_RELEASE_VERSION}.mjs`;
    if (asset.id !== catalogEntry.id || asset.route !== catalogEntry.route) {
      throw new Error(`Sidebar module manifest asset ${index} does not match the catalog`);
    }
    if (asset.file !== expectedFile || path.basename(asset.file) !== asset.file) {
      throw new Error(`Sidebar module manifest asset '${asset.id}' has an invalid file name`);
    }
    if (asset.version !== PLUGIN_RELEASE_VERSION) {
      throw new Error(`Sidebar module manifest asset '${asset.id}' has an invalid version`);
    }
    if (ids.has(asset.id) || routes.has(asset.route)) {
      throw new Error(`Sidebar module manifest has duplicate id or route '${asset.id}'`);
    }
    ids.add(asset.id);
    routes.add(asset.route);
    expectedFiles.add(asset.file);

    const body = await readFile(path.join(outputDirectory, asset.file));
    if (body.byteLength !== asset.size) {
      throw new Error(`Sidebar module asset '${asset.id}' size does not match the manifest`);
    }
    if (createHash("sha256").update(body).digest("hex") !== asset.sha256) {
      throw new Error(`Sidebar module asset '${asset.id}' checksum does not match the manifest`);
    }
    const envelope = parseSidebarPluginEnvelopeHeader(body, catalogEntry);
    if (envelope.version !== asset.version || envelope.contractRange !== asset.contractRange) {
      throw new Error(`Sidebar module asset '${asset.id}' envelope does not match the manifest`);
    }
  }

  const unexpectedFiles = [...files].filter((file) => !expectedFiles.has(file));
  const missingFiles = [...expectedFiles].filter((file) => !files.has(file));
  if (unexpectedFiles.length > 0 || missingFiles.length > 0) {
    throw new Error(
      `Sidebar module output file set mismatch (missing: ${missingFiles.join(", ") || "none"}; unexpected: ${unexpectedFiles.join(", ") || "none"})`
    );
  }
  return manifest;
}
