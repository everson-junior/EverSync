import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { HOST_PLUGIN_CONTRACT_VERSION } from "../../src/lib/plugins/contract.ts";
import { PLUGIN_CATALOG } from "../../src/lib/plugins/catalog.ts";
import { PLUGIN_RELEASE_VERSION } from "../../src/lib/plugins/registry.ts";

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const buildScript = path.join(repositoryRoot, "scripts/release/build-sidebar-modules.ts");
const verifyScript = path.join(repositoryRoot, "scripts/release/verify-sidebar-module-manifest.ts");
const generateScript = path.join(
  repositoryRoot,
  "scripts/release/generate-sidebar-module-sources.ts"
);

interface ManifestAsset {
  id: string;
  route: string;
  file: string;
  size: number;
  sha256: string;
  version: string;
  contractRange: string;
}

interface SidebarModuleManifest {
  releaseVersion: string;
  contractVersion: string;
  sourceMode: "validation" | "strict";
  sourceSha: string;
  assets: ManifestAsset[];
}

async function runScript(script: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  return execFileAsync(process.execPath, ["--import", "tsx/esm", script, ...args], {
    cwd: repositoryRoot,
    env: { ...process.env, ...env },
    windowsHide: true,
  });
}

async function writeStrictSources(
  sourceRoot: string,
  firstSource = "export default function Module() { return null; }\n"
): Promise<void> {
  await Promise.all(
    PLUGIN_CATALOG.map(async (entry, index) => {
      const moduleDirectory = path.join(sourceRoot, entry.id);
      await mkdir(moduleDirectory, { recursive: true });
      await writeFile(
        path.join(moduleDirectory, "index.tsx"),
        index === 0 ? firstSource : "export default function Module() { return null; }\n"
      );
    })
  );
}

test("validation mode reproducibly builds and verifies every catalog asset", async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "eversync-sidebar-build-"));
  const firstOutput = path.join(temporaryRoot, "first");
  const secondOutput = path.join(temporaryRoot, "second");

  try {
    await runScript(buildScript, ["--source-mode=validation", `--outdir=${firstOutput}`]);
    await runScript(verifyScript, [firstOutput]);
    await runScript(buildScript, ["--source-mode=validation", `--outdir=${secondOutput}`]);

    const manifest = JSON.parse(
      await readFile(path.join(firstOutput, "manifest.json"), "utf8")
    ) as SidebarModuleManifest;
    const secondManifest = await readFile(path.join(secondOutput, "manifest.json"), "utf8");

    assert.equal(manifest.releaseVersion, PLUGIN_RELEASE_VERSION);
    assert.equal(manifest.contractVersion, HOST_PLUGIN_CONTRACT_VERSION);
    assert.equal(manifest.sourceMode, "validation");
    assert.match(manifest.sourceSha, /^[a-f0-9]{40,64}$/);
    assert.equal(manifest.assets.length, PLUGIN_CATALOG.length);
    assert.equal(new Set(manifest.assets.map((asset) => asset.id)).size, PLUGIN_CATALOG.length);
    assert.equal(new Set(manifest.assets.map((asset) => asset.route)).size, PLUGIN_CATALOG.length);
    assert.equal(new Set(manifest.assets.map((asset) => asset.sha256)).size, PLUGIN_CATALOG.length);
    assert.deepEqual(
      manifest.assets.map((asset) => asset.id),
      PLUGIN_CATALOG.map((entry) => entry.id)
    );
    assert.equal(secondManifest, JSON.stringify(manifest, null, 2) + "\n");

    for (const asset of manifest.assets) {
      const body = await readFile(path.join(firstOutput, asset.file));
      assert.equal(asset.version, PLUGIN_RELEASE_VERSION);
      assert.equal(asset.contractRange, ">=1.0.0 <2.0.0");
      assert.equal(asset.size, body.byteLength);
      assert.equal(createHash("sha256").update(body).digest("hex"), asset.sha256);
      assert.match(body.toString("utf8"), /^\/\/ EVERSYNC_SIDEBAR_PLUGIN_ENVELOPE /);
    }

    assert.equal(
      (await readdir(firstOutput)).filter((file) => file.endsWith(".mjs")).length,
      PLUGIN_CATALOG.length
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("strict entries compile to a native ESM runtime envelope using the host React identity", async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "eversync-sidebar-runtime-"));
  const sourceRoot = path.join(temporaryRoot, "modules");
  const outputDirectory = path.join(temporaryRoot, "output");
  const sourceSha = "a".repeat(40);

  try {
    await writeStrictSources(
      sourceRoot,
      'import React, { createContext, useState } from "react";\n' +
        'import host, { getLocale, getNavigation, getRoute } from "@eversync/plugin-host";\n' +
        'export const Context = createContext("top-level");\n' +
        "export default function Module() {\n" +
        '  const [value] = useState("strict");\n' +
        "  return <div data-host={host} data-react={React} data-route={getRoute()} data-locale={getLocale()} data-navigation={getNavigation()}>{value}</div>;\n" +
        "}\n"
    );
    await runScript(
      buildScript,
      ["--source-mode=strict", `--source-root=${sourceRoot}`, `--outdir=${outputDirectory}`],
      { EVERSYNC_SIDEBAR_MODULE_SOURCE_SHA: sourceSha }
    );

    const manifest = JSON.parse(
      await readFile(path.join(outputDirectory, "manifest.json"), "utf8")
    ) as SidebarModuleManifest;
    const firstAsset = manifest.assets[0];
    const bundlePath = path.join(outputDirectory, firstAsset.file);
    let bundleSource = await readFile(bundlePath, "utf8");
    assert.equal(manifest.sourceMode, "strict");
    assert.equal(manifest.sourceSha, sourceSha);
    assert.match(bundleSource, /^\/\/ EVERSYNC_SIDEBAR_PLUGIN_ENVELOPE /);
    assert.doesNotMatch(bundleSource, /Dynamic require of|\b__require\s*\(/);
    assert.doesNotMatch(bundleSource, /from\s+["'](?:react|react\/jsx-runtime|@eversync\/)/);
    assert.match(bundleSource, /from\s+["']\/api\/sidebar-plugins\/runtime\/react["']/);
    assert.match(bundleSource, /from\s+["']\/api\/sidebar-plugins\/runtime\/react-jsx-runtime["']/);
    assert.match(bundleSource, /from\s+["']\/api\/sidebar-plugins\/runtime\/plugin-host["']/);
    assert.match(bundleSource, /export\s*\{[^}]*default|export\s+default/);

    const hostReact = {
      createContext(defaultValue: unknown) {
        return { defaultValue, reactIdentity: this };
      },
      createElement(type: unknown, props: Record<string, unknown>, ...children: unknown[]) {
        return { type, props, children, reactIdentity: this };
      },
      useState(value: unknown) {
        return [value, () => undefined];
      },
    };
    const firstNavigation = { marker: "first-navigation" };
    const runtimeHost = {
      React: hostReact,
      route: "/dashboard/mcp",
      locale: "en",
      navigation: firstNavigation,
      marker: "host-singleton",
    };
    (
      globalThis as { __EVERSYNC_SIDEBAR_PLUGIN_HOST__?: unknown }
    ).__EVERSYNC_SIDEBAR_PLUGIN_HOST__ = runtimeHost;
    const reactRuntime = Buffer.from(
      "const host = globalThis.__EVERSYNC_SIDEBAR_PLUGIN_HOST__; " +
        "export const createContext = host.React.createContext.bind(host.React); " +
        "export const useState = host.React.useState.bind(host.React); " +
        "export default host.React;"
    ).toString("base64");
    const pluginHostRuntime = Buffer.from(
      "const getHost = () => globalThis.__EVERSYNC_SIDEBAR_PLUGIN_HOST__; " +
        "const host = new Proxy({}, { get: (_target, property) => Reflect.get(getHost(), property) }); " +
        "const getRoute = () => getHost().route; const getLocale = () => getHost().locale; " +
        "const getNavigation = () => getHost().navigation; " +
        "export { getHost, getLocale, getNavigation, getRoute, host }; export default host;"
    ).toString("base64");
    const jsxRuntime = Buffer.from(
      "const React = globalThis.__EVERSYNC_SIDEBAR_PLUGIN_HOST__.React; " +
        "export const Fragment = Symbol.for('react.fragment'); " +
        "export const jsx = (type, props) => React.createElement(type, props); " +
        "export const jsxs = jsx; export const jsxDEV = jsx;"
    ).toString("base64");
    bundleSource = bundleSource
      .replace(
        '"/api/sidebar-plugins/runtime/react"',
        `"data:text/javascript;base64,${reactRuntime}"`
      )
      .replaceAll(
        '"/api/sidebar-plugins/runtime/plugin-host"',
        `"data:text/javascript;base64,${pluginHostRuntime}"`
      )
      .replace(
        '"/api/sidebar-plugins/runtime/react-jsx-runtime"',
        `"data:text/javascript;base64,${jsxRuntime}"`
      );
    const loaded = (await import(
      `data:text/javascript;base64,${Buffer.from(bundleSource).toString("base64")}`
    )) as {
      default: {
        id: string;
        route: string;
        factory: (host: { React: object }) => () => unknown;
      };
    };
    assert.equal(loaded.default.id, firstAsset.id);
    assert.equal(loaded.default.route, firstAsset.route);
    const component = loaded.default.factory(runtimeHost);
    const secondNavigation = { marker: "second-navigation" };
    const nextRuntimeHost = {
      ...runtimeHost,
      route: "/dashboard/a2a",
      locale: "pt-BR",
      navigation: secondNavigation,
    };
    (
      globalThis as { __EVERSYNC_SIDEBAR_PLUGIN_HOST__?: unknown }
    ).__EVERSYNC_SIDEBAR_PLUGIN_HOST__ = nextRuntimeHost;
    const rendered = component() as {
      reactIdentity: object;
      props: {
        "data-host": object;
        "data-react": object;
        "data-route": string;
        "data-locale": string;
        "data-navigation": object;
      };
    };
    assert.equal(rendered.reactIdentity, hostReact);
    assert.equal((rendered.props["data-host"] as { route: string }).route, "/dashboard/a2a");
    assert.equal(
      (rendered.props["data-react"] as { createElement: unknown }).createElement,
      hostReact.createElement
    );
    assert.equal(rendered.props["data-route"], "/dashboard/a2a");
    assert.equal(rendered.props["data-locale"], "pt-BR");
    assert.equal(rendered.props["data-navigation"], secondNavigation);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("strict source mode fails when any catalog module source is missing", async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "eversync-sidebar-strict-"));
  const sourceRoot = path.join(temporaryRoot, "modules");
  const outputDirectory = path.join(temporaryRoot, "output");

  try {
    await mkdir(sourceRoot, { recursive: true });
    await assert.rejects(
      runScript(buildScript, [
        "--source-mode=strict",
        `--source-root=${sourceRoot}`,
        `--outdir=${outputDirectory}`,
      ]),
      (error: Error & { stderr?: string }) => {
        assert.match(
          error.stderr ?? error.message,
          new RegExp(`strict source mode requires ${PLUGIN_CATALOG.length} module entries`, "i")
        );
        return true;
      }
    );
    await assert.rejects(readdir(outputDirectory), /ENOENT/);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("module source generation preserves authored browser modules", async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "eversync-sidebar-generated-"));
  const authoredRoot = path.join(repositoryRoot, "scripts/release/sidebar-module-sources");

  try {
    await runScript(generateScript, [temporaryRoot]);
    for (const moduleId of [
      "context-caveman",
      "audit",
      "api-endpoints",
      "provider-stats",
      "free-provider-rankings",
      "activity",
      "acp-agents",
      "runtime",
      "webhooks",
      "batch",
      "batch-files",
      "profile",
      "tokens",
      "cache",
      "costs-budget",
      "costs-free-tiers",
      "logs-proxy",
      "logs-console",
      "logs-timeline",
      "memory",
      "agent-skills",
      "chaos-config",
      "skills",
      "mcp",
      "a2a",
      "plugins",
      "leaderboard",
      "settings-appearance",
      "settings-access-tokens",
      "settings-cache",
      "embedded-services",
      "combos-live",
      "quota",
      "costs-quota-share",
      "compression-studio",
      "cli-code",
      "cli-agents",
      "cloud-agents",
      "agent-bridge",
      "traffic-inspector",
      "discovery",
      "media",
      "settings-ai",
      "settings-routing",
      "settings-resilience",
      "settings-advanced",
      "settings-security",
      "settings-feature-flags",
      "audit-mcp",
      "audit-a2a",
      "playground",
      "search-tools",
      "translator",
    ]) {
      const authoredSource = await readFile(path.join(authoredRoot, `${moduleId}.tsx`), "utf8");
      const generatedModule = path.join(temporaryRoot, moduleId, "index.tsx");
      assert.equal(await readFile(generatedModule, "utf8"), authoredSource);
      assert.match(authoredSource, /getHost\(\)\s*\.fetch/);
      assert.doesNotMatch(authoredSource, /next-intl|next\/navigation/);
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("strict source mode rejects Node built-ins and private application aliases", async () => {
  for (const forbiddenImport of [
    "node:fs",
    "fs/promises",
    "@/lib/localDb",
    "@omniroute/open-sse",
  ]) {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "eversync-sidebar-source-"));
    const sourceRoot = path.join(temporaryRoot, "modules");
    const outputDirectory = path.join(temporaryRoot, "output");

    try {
      await writeStrictSources(
        sourceRoot,
        `import ${JSON.stringify(forbiddenImport)};\nexport default function Module() { return null; }\n`
      );

      await assert.rejects(
        runScript(buildScript, [
          "--source-mode=strict",
          `--source-root=${sourceRoot}`,
          `--outdir=${outputDirectory}`,
        ]),
        (error: Error & { stderr?: string }) => {
          assert.match(error.stderr ?? error.message, /forbidden module import/i);
          assert.match(
            error.stderr ?? error.message,
            new RegExp(forbiddenImport.replace("/", "\\/"))
          );
          return true;
        }
      );
      await assert.rejects(readdir(outputDirectory), /ENOENT/);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }
});

test("strict source mode rejects transitive private imports, relative escapes, and unlisted dependencies", async () => {
  for (const scenario of [
    {
      name: "transitive private import",
      entry: 'import "./child"; export default function Module() { return null; }\n',
      child: 'import "@/lib/localDb";\n',
      expected: /forbidden module import.*@\/lib\/localDb/i,
    },
    {
      name: "relative source escape",
      entry: 'import "../../outside"; export default function Module() { return null; }\n',
      outside: "export const escaped = true;\n",
      expected: /outside the allowed module roots/i,
    },
    {
      name: "unlisted dependency",
      entry: 'import "left-pad"; export default function Module() { return null; }\n',
      expected: /dependency.*left-pad.*allowlist/i,
    },
  ]) {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "eversync-sidebar-boundary-"));
    const sourceRoot = path.join(temporaryRoot, "modules");
    const outputDirectory = path.join(temporaryRoot, "output");
    try {
      await writeStrictSources(sourceRoot, scenario.entry);
      if (scenario.child) {
        await writeFile(path.join(sourceRoot, PLUGIN_CATALOG[0].id, "child.ts"), scenario.child);
      }
      if (scenario.outside) {
        await writeFile(path.join(sourceRoot, "outside.ts"), scenario.outside);
      }
      await assert.rejects(
        runScript(buildScript, [
          "--source-mode=strict",
          `--source-root=${sourceRoot}`,
          `--outdir=${outputDirectory}`,
        ]),
        (error: Error & { stderr?: string }) => {
          assert.match(error.stderr ?? error.message, scenario.expected, scenario.name);
          return true;
        }
      );
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }
});

test("strict source mode rejects non-literal dynamic imports", async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "eversync-sidebar-dynamic-import-"));
  const sourceRoot = path.join(temporaryRoot, "modules");
  const outputDirectory = path.join(temporaryRoot, "output");
  try {
    await writeStrictSources(
      sourceRoot,
      'const dependency = "./child"; export const load = () => import(dependency); export default function Module() { return null; }\n'
    );
    await writeFile(
      path.join(sourceRoot, PLUGIN_CATALOG[0].id, "child.ts"),
      "export const child = true;\n"
    );
    await assert.rejects(
      runScript(buildScript, [
        "--source-mode=strict",
        `--source-root=${sourceRoot}`,
        `--outdir=${outputDirectory}`,
      ]),
      /non-literal dynamic import/i
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("strict output rejects unresolved bare and unexpected static imports", async () => {
  const scriptSource = await readFile(buildScript, "utf8");
  assert.match(scriptSource, /assertSafeModuleOutput/);
  assert.match(scriptSource, /Unexpected static import/);
  assert.match(scriptSource, /Bare module import/);
});

test("manifest verification rejects tampered checksum, size, header, route, provenance, and files", async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "eversync-sidebar-tamper-"));
  try {
    const cases: Array<
      [string, (directory: string, manifest: SidebarModuleManifest) => Promise<void>]
    > = [
      [
        "checksum",
        async (directory, manifest) => {
          manifest.assets[0].sha256 = "0".repeat(64);
          await writeFile(
            path.join(directory, "manifest.json"),
            `${JSON.stringify(manifest, null, 2)}\n`
          );
        },
      ],
      [
        "size",
        async (directory, manifest) => {
          manifest.assets[0].size += 1;
          await writeFile(
            path.join(directory, "manifest.json"),
            `${JSON.stringify(manifest, null, 2)}\n`
          );
        },
      ],
      [
        "header",
        async (directory, manifest) => {
          const assetPath = path.join(directory, manifest.assets[0].file);
          const body = await readFile(assetPath, "utf8");
          await writeFile(
            assetPath,
            body.replace("EVERSYNC_SIDEBAR_PLUGIN_ENVELOPE", "TAMPERED_HEADER")
          );
        },
      ],
      [
        "route",
        async (directory, manifest) => {
          manifest.assets[0].route = "/tampered";
          await writeFile(
            path.join(directory, "manifest.json"),
            `${JSON.stringify(manifest, null, 2)}\n`
          );
        },
      ],
      [
        "provenance",
        async (directory, manifest) => {
          manifest.sourceSha = "not-a-sha";
          await writeFile(
            path.join(directory, "manifest.json"),
            `${JSON.stringify(manifest, null, 2)}\n`
          );
        },
      ],
      [
        "files",
        async (directory) => writeFile(path.join(directory, "unexpected.mjs"), "export {};\n"),
      ],
    ];

    for (const [name, tamper] of cases) {
      const directory = path.join(temporaryRoot, name);
      await runScript(buildScript, ["--source-mode=validation", `--outdir=${directory}`]);
      const manifest = JSON.parse(
        await readFile(path.join(directory, "manifest.json"), "utf8")
      ) as SidebarModuleManifest;
      await tamper(directory, manifest);
      await assert.rejects(
        runScript(verifyScript, [directory]),
        /manifest|asset|file set|provenance/i
      );
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("atomic promotion never removes the original when its first rename fails", async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "eversync-sidebar-first-rename-"));
  const outputDirectory = path.join(temporaryRoot, "output");
  try {
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(path.join(outputDirectory, "prior.txt"), "known-good");
    await assert.rejects(
      runScript(
        buildScript,
        [
          "--source-mode=validation",
          `--outdir=${outputDirectory}`,
          "--inject-first-rename-failure",
        ],
        { EVERSYNC_SIDEBAR_MODULE_SOURCE_SHA: "b".repeat(40) }
      ),
      /injected first rename failure/i
    );
    assert.equal(await readFile(path.join(outputDirectory, "prior.txt"), "utf8"), "known-good");
    assert.deepEqual(await readdir(outputDirectory), ["prior.txt"]);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("atomic promotion restores the prior output after the second rename fails", async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "eversync-sidebar-promotion-"));
  const outputDirectory = path.join(temporaryRoot, "output");
  try {
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(path.join(outputDirectory, "prior.txt"), "known-good");
    await assert.rejects(
      runScript(
        buildScript,
        [
          "--source-mode=validation",
          `--outdir=${outputDirectory}`,
          "--inject-second-rename-failure",
        ],
        { EVERSYNC_SIDEBAR_MODULE_SOURCE_SHA: "b".repeat(40) }
      ),
      /injected second rename failure/i
    );
    assert.equal(await readFile(path.join(outputDirectory, "prior.txt"), "utf8"), "known-good");
    assert.deepEqual(await readdir(outputDirectory), ["prior.txt"]);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
