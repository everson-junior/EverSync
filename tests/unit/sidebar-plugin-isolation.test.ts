import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { serializeSidebarPluginEnvelopeHeader } from "../../src/lib/plugins/contract.ts";
import {
  MINIMAL_SHOWN,
  SIDEBAR_SECTIONS,
  getSectionItems,
} from "../../src/shared/constants/sidebarVisibility.ts";
import { PLUGIN_CATALOG } from "../../src/lib/plugins/catalog.ts";
import {
  PLUGIN_REGISTRY,
  getPluginDefinition,
  getPluginForRoute,
  resolvePluginArtifactFromManifest,
  resolvePluginIntegrity,
  type SidebarPluginDefinition,
} from "../../src/lib/plugins/registry.ts";
import {
  installPluginBundle,
  pluginBundlePath,
  readInstalledPlugin,
} from "../../src/lib/plugins/bundleStore.ts";

const EXPECTED_MINIMAL_ITEMS = [
  "home",
  "endpoints",
  "api-manager",
  "providers",
  "combos",
  "analytics",
  "costs",
  "logs",
  "health",
  "settings-general",
  "settings-sidebar",
  "docs",
  "changelog",
];

test("Minimal items are native and never enter the downloadable plugin registry", () => {
  assert.deepEqual([...MINIMAL_SHOWN], EXPECTED_MINIMAL_ITEMS);

  const items = SIDEBAR_SECTIONS.flatMap(getSectionItems);
  for (const id of EXPECTED_MINIMAL_ITEMS) {
    const item = items.find((candidate) => candidate.id === id);
    assert.ok(item, `expected Minimal item '${id}'`);
    assert.equal(item.isNative, true, `Minimal item '${id}' must be native`);
    assert.equal(getPluginDefinition(id), null, `Minimal item '${id}' must not have a bundle`);
  }
});

test("the plugin registry contains only non-native, internal Sidebar items", () => {
  const items = SIDEBAR_SECTIONS.flatMap(getSectionItems);
  const expectedIds = items
    .filter((item) => !item.isNative && !item.external)
    .map((item) => item.id)
    .sort();

  assert.deepEqual([...PLUGIN_REGISTRY.keys()].sort(), expectedIds);
});

test("the plugin catalog contains exactly 71 unique non-native internal Sidebar items", () => {
  const expectedEntries = SIDEBAR_SECTIONS.flatMap(getSectionItems).filter(
    (item) => !item.isNative && !item.external
  );
  const catalogIds = PLUGIN_CATALOG.map((entry) => entry.id);
  const catalogRoutes = PLUGIN_CATALOG.map((entry) => entry.route);

  assert.equal(PLUGIN_CATALOG.length, 71);
  assert.equal(new Set(catalogIds).size, 71);
  assert.equal(new Set(catalogRoutes).size, 71);
  assert.deepEqual([...catalogIds].sort(), expectedEntries.map((item) => item.id).sort());
  assert.ok(
    PLUGIN_CATALOG.every((entry) => entry.integrityEnv.startsWith("EVERSYNC_PLUGIN_SHA256_"))
  );
});

test("dynamic plugin routes resolve only registered Sidebar entries", () => {
  assert.equal(getPluginForRoute("/dashboard/mcp")?.id, "mcp");
  assert.equal(getPluginForRoute("/dashboard/mcp/tools")?.id, "mcp");
  assert.equal(getPluginForRoute("/dashboard/not-a-plugin"), null);
});

test("plugins require module-specific checksums and ignore the shared checksum", () => {
  const plugin = getPluginDefinition("mcp");
  assert.ok(plugin);
  const sharedChecksum = "a".repeat(64);
  const specificChecksum = "b".repeat(64);
  process.env.EVERSYNC_PLUGIN_SHA256 = sharedChecksum;

  try {
    assert.equal(resolvePluginIntegrity(plugin), null);
    process.env[plugin.integrityEnv] = specificChecksum;
    assert.equal(resolvePluginIntegrity(plugin), specificChecksum);
  } finally {
    delete process.env.EVERSYNC_PLUGIN_SHA256;
    delete process.env[plugin.integrityEnv];
  }
});

test("the latest strict release manifest resolves a versioned module and checksum", () => {
  const plugin = getPluginDefinition("mcp");
  assert.ok(plugin);
  const assets = PLUGIN_CATALOG.map((entry) => ({
    id: entry.id,
    route: entry.route,
    file: `${entry.id}-1.1.0.mjs`,
    version: "1.1.0",
    sha256: entry.id === "mcp" ? "c".repeat(64) : "d".repeat(64),
  }));

  const resolved = resolvePluginArtifactFromManifest(plugin, {
    releaseVersion: "1.1.0",
    sourceMode: "strict",
    assets,
  });

  assert.equal(resolved.plugin.version, "1.1.0");
  assert.equal(resolved.plugin.bundleFile, "mcp-1.1.0.mjs");
  assert.equal(
    resolved.plugin.bundleUrl,
    "https://github.com/everson-junior/EverSync/releases/download/v1.1.0/mcp-1.1.0.mjs"
  );
  assert.equal(resolved.checksum, "c".repeat(64));
});

test("release manifests reject validation builds and mismatched module assets", () => {
  const plugin = getPluginDefinition("mcp");
  assert.ok(plugin);
  const assets = PLUGIN_CATALOG.map((entry) => ({
    id: entry.id,
    route: entry.route,
    file: `${entry.id}-1.1.0.mjs`,
    version: "1.1.0",
    sha256: "e".repeat(64),
  }));

  assert.throws(
    () =>
      resolvePluginArtifactFromManifest(plugin, {
        releaseVersion: "1.1.0",
        sourceMode: "validation",
        assets,
      }),
    /invalid sidebar plugin release manifest/i
  );
  assets.find((asset) => asset.id === "mcp")!.route = "/dashboard/a2a";
  assert.throws(
    () =>
      resolvePluginArtifactFromManifest(plugin, {
        releaseVersion: "1.1.0",
        sourceMode: "strict",
        assets,
      }),
    /invalid release manifest asset/i
  );
});

test("checksum failure removes partial and final plugin cache state", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "eversync-plugin-test-"));
  const previousDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = dataDir;

  const body = Buffer.from(
    `${serializeSidebarPluginEnvelopeHeader({
      id: "mcp",
      route: "/dashboard/mcp",
      version: "1.0.0",
      contractRange: ">=1.0.0 <2.0.0",
    })}export default function Extension() { return null; }`
  );
  const plugin: SidebarPluginDefinition = {
    id: "mcp",
    version: "test",
    source: "github-release",
    bundleUrl: "https://example.test/mcp.mjs",
    bundleFile: "mcp-test.mjs",
    integrityEnv: "EVERSYNC_PLUGIN_SHA256_MCP",
    route: "/dashboard/mcp",
  };
  process.env[plugin.integrityEnv] = createHash("sha256").update("different").digest("hex");

  try {
    await assert.rejects(
      installPluginBundle(plugin, async () => new Response(body, { status: 200 })),
      /checksum mismatch/
    );
    assert.equal(await readInstalledPlugin(plugin), null);
    await assert.rejects(readFile(pluginBundlePath(plugin)), /ENOENT/);
    await assert.rejects(readFile(`${pluginBundlePath(plugin)}.partial`), /ENOENT/);
  } finally {
    delete process.env[plugin.integrityEnv];
    if (previousDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDataDir;
    await rm(dataDir, { recursive: true, force: true });
  }
});
