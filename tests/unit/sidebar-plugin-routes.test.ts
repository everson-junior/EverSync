import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { serializeSidebarPluginEnvelopeHeader } from "../../src/lib/plugins/contract.ts";
import { installPluginBundle } from "../../src/lib/plugins/bundleStore.ts";
import { getPluginDefinition } from "../../src/lib/plugins/registry.ts";
import { updateSettings } from "../../src/lib/db/settings.ts";
import {
  GET as getPlugin,
  POST as installPlugin,
} from "../../src/app/api/sidebar-plugins/[id]/route.ts";
import { GET as getBundle } from "../../src/app/api/sidebar-plugins/[id]/bundle/route.ts";
import { GET as getPluginHostRuntime } from "../../src/app/api/sidebar-plugins/runtime/plugin-host/route.ts";
import { GET as getReactRuntime } from "../../src/app/api/sidebar-plugins/runtime/react/route.ts";
import { GET as getReactJsxRuntime } from "../../src/app/api/sidebar-plugins/runtime/react-jsx-runtime/route.ts";
import { initializeSidebarPluginRuntime } from "../../src/shared/components/layouts/pluginRuntimeBridge.ts";
import { createSidebarPluginHost } from "../../src/shared/components/layouts/pluginHostRuntime.ts";

const plugin = getPluginDefinition("context-caveman")!;
let dataDir: string;
let previousDataDir: string | undefined;
let previousChecksum: string | undefined;
let previousPassword: string | undefined;
let previousRequireApiKey: string | undefined;

function request(path = ""): Request {
  return new Request(`http://localhost/api/sidebar-plugins/context-caveman${path}`);
}

function context() {
  return { params: Promise.resolve({ id: "context-caveman" }) };
}

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "eversync-plugin-route-"));
  previousDataDir = process.env.DATA_DIR;
  previousChecksum = process.env[plugin.integrityEnv];
  previousPassword = process.env.OMNIROUTE_PASSWORD;
  previousRequireApiKey = process.env.REQUIRE_API_KEY;
  process.env.DATA_DIR = dataDir;
  delete process.env.OMNIROUTE_PASSWORD;
  process.env.REQUIRE_API_KEY = "false";
  await updateSettings({ requireLogin: false, setupComplete: false });
});

afterEach(async () => {
  if (previousDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previousDataDir;
  if (previousChecksum === undefined) delete process.env[plugin.integrityEnv];
  else process.env[plugin.integrityEnv] = previousChecksum;
  if (previousPassword === undefined) delete process.env.OMNIROUTE_PASSWORD;
  else process.env.OMNIROUTE_PASSWORD = previousPassword;
  if (previousRequireApiKey === undefined) delete process.env.REQUIRE_API_KEY;
  else process.env.REQUIRE_API_KEY = previousRequireApiKey;
  await rm(dataDir, { recursive: true, force: true });
});

async function installFixture(): Promise<Buffer> {
  const body = Buffer.from(
    `${serializeSidebarPluginEnvelopeHeader({
      id: plugin.id,
      route: plugin.route,
      version: plugin.version,
      contractRange: ">=1.0.0 <2.0.0",
    })}export default {};`
  );
  process.env[plugin.integrityEnv] = createHash("sha256").update(body).digest("hex");
  await installPluginBundle(plugin, async () => new Response(body));
  return body;
}

test("GET returns a public plugin DTO without the absolute bundle path", async () => {
  await installFixture();

  const response = await getPlugin(request() as never, context());
  const payload = (await response.json()) as {
    installed: boolean;
    plugin: Record<string, unknown>;
  };

  assert.equal(response.status, 200);
  assert.equal(payload.installed, true);
  assert.equal("bundlePath" in payload.plugin, false);
  assert.equal(payload.plugin.id, plugin.id);
});

test("bundle route serves verified bytes with private no-store semantics", async () => {
  const body = await installFixture();

  const response = await getBundle(request("/bundle") as never, context());

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("cache-control"),
    "private, no-store, max-age=0, must-revalidate"
  );
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), body);
});

test("runtime routes expose authenticated singleton React and plugin-host ESM bridges", async () => {
  const runtimeRequest = new Request("http://localhost/api/sidebar-plugins/runtime/react");
  for (const [getRuntime, expected] of [
    [
      getReactRuntime,
      /export const (?:useState|createContext) = React\.(?:useState|createContext)/,
    ],
    [getReactJsxRuntime, /export const jsx = jsxRuntime\.jsx/],
    [getPluginHostRuntime, /export const getRoute = \(\) => getHost\(\)\.route/],
  ] as const) {
    const response = await getRuntime(runtimeRequest as never);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/javascript/);
    assert.match(await response.text(), expected);
  }
});

test("cached plugin-host ESM reads route, locale, and navigation from the latest runtime", async () => {
  const runtimeRequest = new Request("http://localhost/api/sidebar-plugins/runtime/plugin-host");
  const firstNavigation = {
    push: () => undefined,
    replace: () => undefined,
    refresh: () => undefined,
    back: () => undefined,
  };
  const secondNavigation = {
    push: () => undefined,
    replace: () => undefined,
    refresh: () => undefined,
    back: () => undefined,
  };
  const createHost = (route: string, locale: string, navigation: typeof firstNavigation) =>
    createSidebarPluginHost({
      fetch: globalThis.fetch.bind(globalThis),
      route,
      locale,
      navigation,
    });

  initializeSidebarPluginRuntime(createHost("/dashboard/mcp", "en", firstNavigation));
  const response = await getPluginHostRuntime(runtimeRequest as never);
  const adapterUrl = `data:text/javascript;base64,${Buffer.from(await response.text()).toString("base64")}`;
  const adapter = (await import(adapterUrl)) as {
    default: { route: string; locale: string; navigation: typeof firstNavigation };
    getRoute: () => string;
    getLocale: () => string;
    getNavigation: () => typeof firstNavigation;
  };

  assert.equal(adapter.getRoute(), "/dashboard/mcp");
  assert.equal(adapter.default.locale, "en");
  assert.equal(adapter.getNavigation(), firstNavigation);

  initializeSidebarPluginRuntime(createHost("/dashboard/a2a", "pt-BR", secondNavigation));
  const cachedAdapter = await import(adapterUrl);

  assert.equal(cachedAdapter, adapter);
  assert.equal(adapter.getRoute(), "/dashboard/a2a");
  assert.equal(adapter.getLocale(), "pt-BR");
  assert.equal(adapter.getNavigation(), secondNavigation);
  assert.equal(adapter.default.route, "/dashboard/a2a");
  assert.equal(adapter.default.locale, "pt-BR");
  assert.equal(adapter.default.navigation, secondNavigation);
});

test("POST returns a public plugin DTO without the absolute bundle path", async () => {
  const body = Buffer.from(
    `${serializeSidebarPluginEnvelopeHeader({
      id: plugin.id,
      route: plugin.route,
      version: plugin.version,
      contractRange: ">=1.0.0 <2.0.0",
    })}export default {};`
  );
  process.env[plugin.integrityEnv] = createHash("sha256").update(body).digest("hex");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(body)) as typeof fetch;

  try {
    const response = await installPlugin(request() as never, context());
    const payload = (await response.json()) as {
      installed: boolean;
      plugin: Record<string, unknown>;
    };

    assert.equal(response.status, 201);
    assert.equal(payload.installed, true);
    assert.equal("bundlePath" in payload.plugin, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
