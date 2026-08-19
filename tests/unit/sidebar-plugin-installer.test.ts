import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { serializeSidebarPluginEnvelopeHeader } from "../../src/lib/plugins/contract.ts";
import {
  clearInstalledPlugin,
  getPluginInstallFailureCategory,
  installPluginBundle,
  readInstalledPlugin,
  readVerifiedInstalledPlugin,
} from "../../src/lib/plugins/bundleStore.ts";
import type { SidebarPluginDefinition } from "../../src/lib/plugins/registry.ts";

const repositoryRoot = join(fileURLToPath(new URL("../..", import.meta.url)));

const plugin: SidebarPluginDefinition = {
  id: "mcp",
  version: "3.8.51",
  source: "github-release",
  bundleUrl: "https://example.test/mcp-3.8.51.mjs",
  bundleFile: "mcp-3.8.51.mjs",
  integrityEnv: "EVERSYNC_PLUGIN_SHA256_MCP",
  route: "/dashboard/mcp",
};

function bundle(overrides: { id?: string; route?: string; contractRange?: string } = {}): Buffer {
  const envelope = {
    id: overrides.id ?? plugin.id,
    route: overrides.route ?? plugin.route,
    version: plugin.version,
    contractRange: overrides.contractRange ?? ">=1.0.0 <2.0.0",
  };
  return Buffer.from(`${serializeSidebarPluginEnvelopeHeader(envelope)}export default {
  id: ${JSON.stringify(overrides.id ?? plugin.id)},
  route: ${JSON.stringify(overrides.route ?? plugin.route)},
  version: ${JSON.stringify(plugin.version)},
  contractRange: ${JSON.stringify(overrides.contractRange ?? ">=1.0.0 <2.0.0")},
  factory(host) { return host; }
};`);
}

function checksum(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}

async function withPluginDataDir(run: (dataDir: string) => Promise<void>): Promise<void> {
  const dataDir = await mkdtemp(join(tmpdir(), "eversync-plugin-installer-"));
  const previousDataDir = process.env.DATA_DIR;
  const previousChecksum = process.env[plugin.integrityEnv];
  process.env.DATA_DIR = dataDir;

  try {
    await run(dataDir);
  } finally {
    if (previousDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDataDir;
    if (previousChecksum === undefined) delete process.env[plugin.integrityEnv];
    else process.env[plugin.integrityEnv] = previousChecksum;
    await rm(dataDir, { recursive: true, force: true });
  }
}

async function install(body: Buffer) {
  process.env[plugin.integrityEnv] = checksum(body);
  return installPluginBundle(plugin, async () => new Response(body, { status: 200 }));
}

test("an interrupted stream preserves the active bundle and removes temporary files", async () => {
  await withPluginDataDir(async (dataDir) => {
    const activeBody = bundle();
    const active = await install(activeBody);
    process.env[plugin.integrityEnv] = "a".repeat(64);
    const partial = Buffer.from("export default {");

    const error = await installPluginBundle(
      plugin,
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(partial);
              controller.error(new Error("socket reset with private upstream details"));
            },
          }),
          { status: 200 }
        )
    ).catch((reason: unknown) => reason);

    assert.equal(getPluginInstallFailureCategory(error), "download");
    assert.equal((error as Error).message, "Plugin download failed");

    assert.deepEqual(await readInstalledPlugin(plugin), active);
    assert.deepEqual(await readFile(active.bundlePath), activeBody);
    const cacheEntries = await readdir(join(dataDir, "sidebar-plugins"));
    assert.equal(
      cacheEntries.some((entry) => entry.includes(".tmp-")),
      false
    );
  });
});

test("caller cancellation cancels a stalled body and preserves the active bundle", async () => {
  await withPluginDataDir(async () => {
    const activeBody = bundle();
    const active = await install(activeBody);
    process.env[plugin.integrityEnv] = "a".repeat(64);
    const caller = new AbortController();
    let canceled = false;

    const error = await installPluginBundle(
      plugin,
      async () => {
        const response = new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(Buffer.from("export default {"));
              queueMicrotask(() => caller.abort(new Error("request closed")));
            },
            cancel() {
              canceled = true;
            },
          }),
          { status: 200 }
        );
        return response;
      },
      { signal: caller.signal }
    ).catch((reason: unknown) => reason);

    assert.equal(getPluginInstallFailureCategory(error), "download");
    assert.equal(canceled, true);
    assert.deepEqual(await readInstalledPlugin(plugin), active);
    assert.deepEqual(await readFile(active.bundlePath), activeBody);
  });
});

test("body-read deadline cancels a stalled mid-stream body and preserves the active bundle", async () => {
  await withPluginDataDir(async () => {
    const activeBody = bundle();
    const active = await install(activeBody);
    process.env[plugin.integrityEnv] = "a".repeat(64);
    let canceled = false;

    const error = await installPluginBundle(
      plugin,
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(Buffer.from("export default {"));
            },
            cancel() {
              canceled = true;
            },
          }),
          { status: 200 }
        ),
      { bodyReadTimeoutMs: 1 }
    ).catch((reason: unknown) => reason);

    assert.equal(getPluginInstallFailureCategory(error), "download");
    assert.equal(canceled, true);
    assert.deepEqual(await readInstalledPlugin(plugin), active);
    assert.deepEqual(await readFile(active.bundlePath), activeBody);
  });
});

test("a non-OK response body is canceled before reporting download failure", async () => {
  await withPluginDataDir(async () => {
    process.env[plugin.integrityEnv] = "a".repeat(64);
    let canceled = false;
    const responseBody = new ReadableStream<Uint8Array>({
      cancel() {
        canceled = true;
      },
    });

    const error = await installPluginBundle(
      plugin,
      async () => new Response(responseBody, { status: 503 })
    ).catch((reason: unknown) => reason);

    assert.equal(getPluginInstallFailureCategory(error), "download");
    assert.equal(canceled, true);
  });
});

test("downloaded JavaScript is never executed during envelope validation", async () => {
  await withPluginDataDir(async () => {
    delete (globalThis as { sidebarPluginExecuted?: boolean }).sidebarPluginExecuted;
    const body = Buffer.from(
      `${serializeSidebarPluginEnvelopeHeader({
        id: plugin.id,
        route: plugin.route,
        version: plugin.version,
        contractRange: ">=1.0.0 <2.0.0",
      })}globalThis.sidebarPluginExecuted = true; export default {};`
    );

    await install(body);

    assert.equal(
      (globalThis as { sidebarPluginExecuted?: boolean }).sidebarPluginExecuted,
      undefined
    );
  });
});

test("installer callers preserve active bundles on POST failure and propagate cancellation", async () => {
  const hookSource = await readFile(
    join(repositoryRoot, "src/shared/hooks/usePluginInstaller.ts"),
    "utf8"
  );
  const routeSource = await readFile(
    join(repositoryRoot, "src/app/api/sidebar-plugins/[id]/route.ts"),
    "utf8"
  );

  assert.doesNotMatch(hookSource, /method:\s*["']DELETE["']/);
  assert.match(
    routeSource,
    /installPluginBundle\(plugin, undefined, \{ signal: request\.signal \}\)/
  );
});

test("an oversized declared Content-Length is rejected before reading the stream", async () => {
  await withPluginDataDir(async () => {
    process.env[plugin.integrityEnv] = "a".repeat(64);
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        canceled = true;
      },
    });

    const error = await installPluginBundle(
      plugin,
      async () =>
        new Response(body, {
          status: 200,
          headers: { "Content-Length": String(10 * 1024 * 1024 + 1) },
        })
    ).catch((reason: unknown) => reason);

    assert.equal(getPluginInstallFailureCategory(error), "download");
    assert.match(String((error as Error & { cause?: Error }).cause?.message), /exceeds 10 MiB/);
    assert.equal(canceled, true);
  });
});

test("an oversized chunked stream is canceled and preserves the active bundle", async () => {
  await withPluginDataDir(async (dataDir) => {
    const activeBody = bundle();
    const active = await install(activeBody);
    process.env[plugin.integrityEnv] = "a".repeat(64);
    const chunk = Buffer.alloc(5 * 1024 * 1024);
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.enqueue(Buffer.from([0]));
      },
      cancel() {
        canceled = true;
      },
    });

    const error = await installPluginBundle(
      plugin,
      async () => new Response(body, { status: 200 })
    ).catch((reason: unknown) => reason);

    assert.equal(getPluginInstallFailureCategory(error), "download");
    assert.match(String((error as Error & { cause?: Error }).cause?.message), /exceeds 10 MiB/);
    assert.equal(canceled, true);
    assert.deepEqual(await readInstalledPlugin(plugin), active);
    assert.deepEqual(await readFile(active.bundlePath), activeBody);
    assert.equal(
      (await readdir(join(dataDir, "sidebar-plugins"))).some((entry) => entry.includes(".tmp-")),
      false
    );
  });
});

test("a checksum mismatch preserves the currently installed valid bundle", async () => {
  await withPluginDataDir(async () => {
    const activeBody = bundle();
    const active = await install(activeBody);
    const replacement = Buffer.from(`${activeBody.toString("utf8")}\n// replacement`);
    process.env[plugin.integrityEnv] = checksum(Buffer.from("different"));

    await assert.rejects(
      installPluginBundle(plugin, async () => new Response(replacement, { status: 200 })),
      /checksum mismatch/
    );

    assert.deepEqual(await readInstalledPlugin(plugin), active);
    assert.deepEqual(await readFile(active.bundlePath), activeBody);
  });
});

test("caller abort before metadata commit preserves the active generation", async () => {
  await withPluginDataDir(async () => {
    const activeBody = bundle();
    const active = await install(activeBody);
    const replacement = Buffer.from(`${bundle().toString("utf8")}\n// replacement`);
    process.env[plugin.integrityEnv] = checksum(replacement);
    const caller = new AbortController();

    const error = await installPluginBundle(plugin, async () => new Response(replacement), {
      signal: caller.signal,
      beforeMetadataCommit: () => caller.abort(new Error("request closed before commit")),
    }).catch((reason: unknown) => reason);

    assert.equal((error as Error).name, "Error");
    assert.deepEqual(await readInstalledPlugin(plugin), active);
    assert.deepEqual(await readFile(active.bundlePath), activeBody);
  });
});

test("an incompatible replacement preserves the currently installed valid bundle", async () => {
  await withPluginDataDir(async () => {
    const activeBody = bundle();
    const active = await install(activeBody);
    const replacement = bundle({ contractRange: ">=2.0.0 <3.0.0" });
    process.env[plugin.integrityEnv] = checksum(replacement);

    const error = await installPluginBundle(
      plugin,
      async () => new Response(replacement, { status: 200 })
    ).catch((reason: unknown) => reason);
    assert.equal(getPluginInstallFailureCategory(error), "compatibility");
    assert.match(String((error as Error & { cause?: Error }).cause?.message), /Incompatible/);

    assert.deepEqual(await readInstalledPlugin(plugin), active);
    assert.deepEqual(await readFile(active.bundlePath), activeBody);
  });
});

test("a wrong module envelope is rejected before replacing the active bundle", async () => {
  await withPluginDataDir(async () => {
    const activeBody = bundle();
    const active = await install(activeBody);
    const replacement = bundle({ id: "a2a" });
    process.env[plugin.integrityEnv] = checksum(replacement);

    const error = await installPluginBundle(
      plugin,
      async () => new Response(replacement, { status: 200 })
    ).catch((reason: unknown) => reason);
    assert.equal(getPluginInstallFailureCategory(error), "compatibility");
    assert.match(String((error as Error & { cause?: Error }).cause?.message), /expected id 'mcp'/);

    assert.deepEqual(await readInstalledPlugin(plugin), active);
    assert.deepEqual(await readFile(active.bundlePath), activeBody);
  });
});

test("cache tampering invalidates an installed bundle", async () => {
  await withPluginDataDir(async () => {
    const active = await install(bundle());
    await writeFile(active.bundlePath, "tampered");

    assert.equal(await readInstalledPlugin(plugin), null);
  });
});

test("verified bundle reads return the exact bytes used for checksum validation", async () => {
  await withPluginDataDir(async () => {
    const activeBody = bundle();
    const active = await install(activeBody);

    const verified = await readVerifiedInstalledPlugin(plugin);
    assert.ok(verified);
    await writeFile(active.bundlePath, "tampered after verified read");

    assert.deepEqual(verified.body, activeBody);
    assert.equal(verified.plugin.checksum, checksum(verified.body));
  });
});

test("successful replacement promotes a unique bundle and removes temporary files", async () => {
  await withPluginDataDir(async (dataDir) => {
    const first = await install(bundle());
    const cacheDir = join(dataDir, "sidebar-plugins");
    const staleArtifacts = [
      plugin.bundleFile,
      `${plugin.bundleFile}.tmp-stale.mjs`,
      `${plugin.id}.json.tmp-stale`,
    ];
    const collisions = [
      `${plugin.bundleFile}-extended.tmp-keep.mjs`,
      `${plugin.id}-extended.json.tmp-keep`,
    ];
    await Promise.all(
      [...staleArtifacts, ...collisions].map((entry) => writeFile(join(cacheDir, entry), entry))
    );
    const replacement = Buffer.from(`${bundle().toString("utf8")}\n// valid replacement`);
    const second = await install(replacement);

    assert.notEqual(second.bundlePath, first.bundlePath);
    assert.deepEqual(await readFile(second.bundlePath), replacement);
    assert.deepEqual(await readInstalledPlugin(plugin), second);

    const cacheEntries = await readdir(cacheDir);
    assert.equal(
      cacheEntries.some((entry) => staleArtifacts.includes(entry)),
      false,
      "all stale exact-prefix artifacts should be removed"
    );
    assert.deepEqual(
      cacheEntries.filter((entry) => collisions.includes(entry)).sort(),
      collisions.sort()
    );
    await assert.rejects(readFile(first.bundlePath), /ENOENT/);
  });
});

test("install rejects unsafe plugin path segments before fetch or filesystem writes", async () => {
  await withPluginDataDir(async (dataDir) => {
    process.env[plugin.integrityEnv] = checksum(bundle());
    let fetchCalls = 0;
    const fetchBundle = async () => {
      fetchCalls += 1;
      return new Response(bundle());
    };

    for (const unsafe of [
      { ...plugin, id: "../outside" },
      { ...plugin, id: "..\\outside" },
      { ...plugin, bundleFile: "../outside.mjs" },
      { ...plugin, bundleFile: "..\\outside.mjs" },
    ]) {
      await assert.rejects(installPluginBundle(unsafe, fetchBundle), /safe path segments/);
    }

    assert.equal(fetchCalls, 0);
    assert.deepEqual(await readdir(dataDir), []);
  });
});

test("concurrent replacements serialize and leave only the latest valid generation", async () => {
  await withPluginDataDir(async (dataDir) => {
    const body = bundle();
    process.env[plugin.integrityEnv] = checksum(body);
    let releaseFirst!: () => void;
    const firstReady = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });

    const first = installPluginBundle(plugin, async () => {
      firstStarted();
      await firstReady;
      return new Response(body);
    });
    await started;
    const second = installPluginBundle(plugin, async () => new Response(body));
    releaseFirst();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    assert.notEqual(firstResult.bundlePath, secondResult.bundlePath);
    assert.deepEqual(await readInstalledPlugin(plugin), secondResult);
    const generations = (await readdir(join(dataDir, "sidebar-plugins"))).filter((entry) =>
      entry.startsWith(`${plugin.bundleFile}.generation-`)
    );
    assert.deepEqual(generations, [secondResult.bundlePath.split(/[\\/]/).at(-1)]);
  });
});

test("install and delete serialize with final state determined by operation order", async () => {
  await withPluginDataDir(async () => {
    const body = bundle();
    process.env[plugin.integrityEnv] = checksum(body);
    let releaseInstall!: () => void;
    const installBlocked = new Promise<void>((resolve) => {
      releaseInstall = resolve;
    });
    let markInstallStarted!: () => void;
    const installStarted = new Promise<void>((resolve) => {
      markInstallStarted = resolve;
    });

    const installFirst = installPluginBundle(plugin, async () => {
      markInstallStarted();
      await installBlocked;
      return new Response(body);
    });
    await installStarted;
    const deleteSecond = clearInstalledPlugin(plugin);
    releaseInstall();
    await Promise.all([installFirst, deleteSecond]);
    assert.equal(await readInstalledPlugin(plugin), null);

    let releaseBlocker!: () => void;
    const blockerWait = new Promise<void>((resolve) => {
      releaseBlocker = resolve;
    });
    let markBlockerStarted!: () => void;
    const blockerStarted = new Promise<void>((resolve) => {
      markBlockerStarted = resolve;
    });
    const blocker = installPluginBundle(plugin, async () => {
      markBlockerStarted();
      await blockerWait;
      return new Response(body);
    });
    await blockerStarted;
    const deleteFirst = clearInstalledPlugin(plugin);
    const installSecond = installPluginBundle(plugin, async () => new Response(body));
    releaseBlocker();
    const [, , installed] = await Promise.all([blocker, deleteFirst, installSecond]);
    assert.deepEqual(await readInstalledPlugin(plugin), installed);
  });
});

test("clear removes orphan and malformed plugin artifacts without prefix collisions", async () => {
  await withPluginDataDir(async (dataDir) => {
    const cacheDir = join(dataDir, "sidebar-plugins");
    await mkdir(cacheDir, { recursive: true });
    const operationA = "11111111-1111-4111-8111-111111111111";
    const operationB = "22222222-2222-4222-8222-222222222222";
    const owned = [
      `${plugin.id}.json`,
      `${plugin.id}.json.tmp-${operationA}`,
      plugin.bundleFile,
      `${plugin.bundleFile}.generation-${operationA}`,
      `${plugin.bundleFile}.generation-${operationB}`,
      `${plugin.bundleFile}.tmp-${operationA}.mjs`,
    ];
    const collisions = [
      `${plugin.id}-extended.json`,
      `${plugin.bundleFile}-extended.generation-keep`,
      `x${plugin.bundleFile}.generation-keep`,
    ];
    await Promise.all(
      [...owned, ...collisions].map((entry) =>
        writeFile(join(cacheDir, entry), entry === `${plugin.id}.json` ? "{malformed" : entry)
      )
    );

    await clearInstalledPlugin(plugin);

    assert.deepEqual((await readdir(cacheDir)).sort(), collisions.sort());
  });
});

test("clear removes all orphan artifacts when plugin metadata is missing", async () => {
  await withPluginDataDir(async (dataDir) => {
    const cacheDir = join(dataDir, "sidebar-plugins");
    await mkdir(cacheDir, { recursive: true });
    const artifacts = [
      plugin.bundleFile,
      `${plugin.bundleFile}.generation-orphan`,
      `${plugin.bundleFile}.generation-malformed-suffix`,
      `${plugin.bundleFile}.tmp-orphan.mjs`,
      `${plugin.id}.json.tmp-orphan`,
    ];
    await Promise.all(artifacts.map((entry) => writeFile(join(cacheDir, entry), entry)));

    await clearInstalledPlugin(plugin);

    assert.deepEqual(await readdir(cacheDir), []);
  });
});

test("clear rejects unsafe artifact names without deleting outside the plugin cache", async () => {
  await withPluginDataDir(async (dataDir) => {
    const sentinel = join(dataDir, "sentinel");
    await writeFile(sentinel, "keep");
    const unsafe = { ...plugin, id: "../sentinel", bundleFile: "../sentinel" };

    await assert.rejects(clearInstalledPlugin(unsafe), /safe path segments/);
    assert.equal(await readFile(sentinel, "utf8"), "keep");
  });
});
