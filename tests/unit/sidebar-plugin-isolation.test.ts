import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  MINIMAL_SHOWN,
  SIDEBAR_SECTIONS,
  getSectionItems,
} from "../../src/shared/constants/sidebarVisibility.ts";
import {
  PLUGIN_REGISTRY,
  getPluginDefinition,
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

test("checksum failure removes partial and final plugin cache state", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "eversync-plugin-test-"));
  const previousDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = dataDir;

  const body = Buffer.from("export default function Extension() { return null; }");
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
