import { createHash } from "node:crypto";
import { builtinModules } from "node:module";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { build, type Plugin } from "esbuild";
import {
  HOST_PLUGIN_CONTRACT_VERSION,
  serializeSidebarPluginEnvelopeHeader,
} from "../../src/lib/plugins/contract";
import { PLUGIN_CATALOG } from "../../src/lib/plugins/catalog";
import { PLUGIN_RELEASE_VERSION } from "../../src/lib/plugins/registry";
import {
  validateSidebarModuleManifestDirectory,
  type SidebarModuleManifest,
  type SidebarModuleManifestAsset,
  type SidebarModuleSourceMode,
} from "./sidebar-module-manifest";

const CONTRACT_RANGE = ">=1.0.0 <2.0.0";
const repositoryRoot = process.cwd();
const execFileAsync = promisify(execFile);
const HOST_MODULE_PATH = "@eversync/plugin-host";
const REACT_RUNTIME_URL = "/api/sidebar-plugins/runtime/react";
const JSX_RUNTIME_URL = "/api/sidebar-plugins/runtime/react-jsx-runtime";
const PLUGIN_HOST_RUNTIME_URL = "/api/sidebar-plugins/runtime/plugin-host";
const ALLOWED_OUTPUT_IMPORTS = new Set([
  REACT_RUNTIME_URL,
  JSX_RUNTIME_URL,
  PLUGIN_HOST_RUNTIME_URL,
]);
const NODE_BUILTINS = new Set(
  builtinModules.flatMap((moduleName) => [moduleName, moduleName.replace(/^node:/, "")])
);

function option(name: string): string | undefined {
  return process.argv.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1);
}

function sourceMode(): SidebarModuleSourceMode {
  const value = option("--source-mode") ?? process.env.EVERSYNC_SIDEBAR_MODULE_SOURCE_MODE;
  if (value === "validation" || value === "strict") return value;
  throw new Error("Use --source-mode=validation or --source-mode=strict");
}

function selectedCatalog(): readonly (typeof PLUGIN_CATALOG)[number][] {
  const selected = option("--only");
  if (!selected) return PLUGIN_CATALOG;
  const ids = new Set(selected.split(",").filter(Boolean));
  const entries = PLUGIN_CATALOG.filter((entry) => ids.has(entry.id));
  if (entries.length !== ids.size) {
    throw new Error(`Unknown sidebar module id in --only=${selected}`);
  }
  return entries;
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function packageName(importPath: string): string {
  if (importPath.startsWith("@")) return importPath.split("/").slice(0, 2).join("/");
  return importPath.split("/")[0];
}

async function exists(filePath: string): Promise<boolean> {
  return access(filePath).then(
    () => true,
    () => false
  );
}

function validationSource(id: string, route: string): string {
  return (
    `const moduleId = ${JSON.stringify(id)};\n` +
    "const ValidationComponent = () => null;\n" +
    `export default {\n` +
    `  id: moduleId,\n` +
    `  route: ${JSON.stringify(route)},\n` +
    `  version: ${JSON.stringify(PLUGIN_RELEASE_VERSION)},\n` +
    `  contractRange: ${JSON.stringify(CONTRACT_RANGE)},\n` +
    "  factory(host) {\n" +
    '    if (!host || typeof host !== "object") throw new Error(`Missing host for ${moduleId}`);\n' +
    "    return ValidationComponent;\n" +
    "  },\n" +
    "};\n"
  );
}

function rejectNonLiteralDynamicImports(source: string, sourcePath: string): void {
  const dynamicImports = source.matchAll(/\bimport\s*\(([^)]*)\)/g);
  for (const match of dynamicImports) {
    const argument = match[1].trim();
    if (!/^(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')$/.test(argument)) {
      throw new Error(`Non-literal dynamic import '${argument.slice(0, 160)}' in ${sourcePath}`);
    }
  }
}

function assertSafeModuleOutput(source: string, id: string): void {
  if (/\bDynamic require of\b|\b__require\s*\(/.test(source)) {
    throw new Error(`CommonJS dynamic require shim remains in output for '${id}'`);
  }
  const staticImports = source.matchAll(
    /\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g
  );
  for (const match of staticImports) {
    const importPath = match[1];
    if (importPath.includes("${")) continue;
    if (!importPath.startsWith(".") && !importPath.startsWith("/") && !importPath.includes(":")) {
      throw new Error(
        `Bare module import '${importPath}' remains in output for '${id}': ${match[0].slice(0, 240)}`
      );
    }
    if (!ALLOWED_OUTPUT_IMPORTS.has(importPath)) {
      throw new Error(`Unexpected static import '${importPath}' remains in output for '${id}'`);
    }
  }
  rejectNonLiteralDynamicImports(source, `output for '${id}'`);
}

function moduleBoundaryPlugin(sourceRoot: string, entryRoot: string): Plugin {
  const sharedRoot = path.join(sourceRoot, "shared");
  const dependenciesRoot = path.join(repositoryRoot, "node_modules");
  const officialSourceRoot =
    path.resolve(sourceRoot) === path.join(repositoryRoot, "src", "modules");
  return {
    name: "sidebar-module-contract-boundary",
    setup(buildContext) {
      buildContext.onResolve({ filter: /^react-markdown$/ }, () => ({
        path: "sidebar-module-markdown",
        namespace: "module-shim",
      }));
      buildContext.onResolve({ filter: /MarkdownMessage$/ }, () => ({
        path: "sidebar-module-markdown",
        namespace: "module-shim",
      }));
      buildContext.onLoad(
        { filter: /^sidebar-module-markdown$/, namespace: "module-shim" },
        () => ({
          contents: `import React from "react";
export default function SidebarModuleMarkdown({ content, className }) {
  return React.createElement("div", {
    className,
    style: { whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
  }, content);
}`,
          loader: "js",
        })
      );
      buildContext.onResolve({ filter: /shared\/components\/MonacoEditor$/ }, () => ({
        path: "sidebar-module-editor",
        namespace: "module-shim",
      }));
      buildContext.onLoad({ filter: /^sidebar-module-editor$/, namespace: "module-shim" }, () => ({
        contents: `import React from "react";
export default function SidebarModuleEditor(props) {
  const { value = "", onChange, height = 320, ...rest } = props;
  return React.createElement("textarea", {
    ...rest,
    value,
    onChange: (event) => onChange?.(event.currentTarget.value),
    style: { width: "100%", height: typeof height === "number" ? height : String(height), fontFamily: "monospace", ...props.style },
  });
}`,
        loader: "js",
      }));
      buildContext.onResolve({ filter: /\.css$/ }, () => ({
        path: "sidebar-module-style",
        namespace: "empty-style",
      }));
      buildContext.onLoad({ filter: /.*/, namespace: "empty-style" }, () => ({
        contents: "export {};",
        loader: "js",
      }));
      buildContext.onResolve({ filter: /.*/ }, (args) => {
        if (ALLOWED_OUTPUT_IMPORTS.has(args.path)) return { path: args.path, external: true };
        if (
          args.path === "react" ||
          args.path === "react/jsx-runtime" ||
          args.path === HOST_MODULE_PATH
        ) {
          const runtimeUrl =
            args.path === "react"
              ? REACT_RUNTIME_URL
              : args.path === "react/jsx-runtime"
                ? JSX_RUNTIME_URL
                : PLUGIN_HOST_RUNTIME_URL;
          return { path: runtimeUrl, external: true };
        }
        if (!args.importer) return undefined;
        const importPath = args.path;
        const bareImport = !importPath.startsWith(".") && !path.isAbsolute(importPath);
        const normalizedBuiltin = importPath.replace(/^node:/, "").split("/")[0];
        if (
          importPath.startsWith("node:") ||
          NODE_BUILTINS.has(importPath) ||
          NODE_BUILTINS.has(normalizedBuiltin)
        ) {
          return {
            errors: [{ text: `Forbidden module import '${importPath}' in ${args.importer}` }],
          };
        }
        if (!officialSourceRoot && bareImport) {
          return {
            errors: [
              {
                text:
                  importPath.startsWith("@/") || importPath.startsWith("@omniroute/")
                    ? `Forbidden module import '${importPath}' in ${args.importer}`
                    : `Dependency '${packageName(importPath)}' is not in the module dependency allowlist`,
              },
            ],
          };
        }
        if (importPath.startsWith(".") || path.isAbsolute(importPath)) {
          const resolved = path.resolve(path.dirname(args.importer), importPath);
          if (
            !isWithin(entryRoot, resolved) &&
            !isWithin(sharedRoot, resolved) &&
            (!officialSourceRoot ||
              (!isWithin(repositoryRoot, resolved) && !isWithin(dependenciesRoot, resolved)))
          ) {
            return {
              errors: [
                {
                  text: `Resolved source '${resolved}' is outside the allowed module roots`,
                },
              ],
            };
          }
        }
        return undefined;
      });
      buildContext.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async (args) => {
        if (!isWithin(sourceRoot, args.path)) return undefined;
        const source = await readFile(args.path, "utf8");
        rejectNonLiteralDynamicImports(source, args.path);
        const extension = path.extname(args.path);
        const loader = extension === ".tsx" ? "tsx" : extension === ".ts" ? "ts" : "jsx";
        return { contents: source, loader };
      });
    },
  };
}

function strictAdapterSource(entry: string, id: string, route: string): string {
  const entryUrl = JSON.stringify(entry.replaceAll("\\", "/"));
  return (
    `import implementation from ${entryUrl};\n` +
    `import { getHost } from ${JSON.stringify(HOST_MODULE_PATH)};\n` +
    `const moduleId = ${JSON.stringify(id)};\n` +
    `const moduleRoute = ${JSON.stringify(route)};\n` +
    "export default {\n" +
    "  id: moduleId, route: moduleRoute,\n" +
    `  version: ${JSON.stringify(PLUGIN_RELEASE_VERSION)},\n` +
    `  contractRange: ${JSON.stringify(CONTRACT_RANGE)},\n` +
    "  factory(host) {\n" +
    "    if (!host || !host.React) throw new Error(`Missing host React for ${moduleId}`);\n" +
    "      if (getHost() !== host) throw new Error(`Host runtime mismatch for ${moduleId}`);\n" +
    "      const value = typeof implementation === 'function' ? implementation : implementation?.default;\n" +
    "      if (typeof value !== 'function') throw new Error(`Module ${moduleId} must default-export a component or module function`);\n" +
    "      return function SidebarPluginComponent(props) {\n" +
    "        return value(props);\n" +
    "      };\n" +
    "  },\n" +
    "};\n"
  );
}

async function strictEntries(
  sourceRoot: string,
  catalog: readonly (typeof PLUGIN_CATALOG)[number][]
): Promise<Map<string, string>> {
  const entries = new Map<string, string>();
  const missing: string[] = [];
  for (const catalogEntry of catalog) {
    const entry = path.join(sourceRoot, catalogEntry.id, "index.tsx");
    if (await exists(entry)) entries.set(catalogEntry.id, entry);
    else missing.push(catalogEntry.id);
  }
  if (missing.length > 0) {
    throw new Error(
      `Strict source mode requires ${catalog.length} module entries; missing: ${missing.join(", ")}`
    );
  }
  return entries;
}

async function compileSource(
  id: string,
  route: string,
  mode: SidebarModuleSourceMode,
  sourceRoot: string,
  entries: Map<string, string>
): Promise<Buffer> {
  const entry = entries.get(id);
  let result;
  try {
    result = await build({
      stdin: {
        contents:
          mode === "validation"
            ? validationSource(id, route)
            : strictAdapterSource(entry!, id, route),
        loader: "tsx",
        sourcefile: mode === "validation" ? `${id}.validation.js` : `${id}.adapter.tsx`,
        resolveDir: mode === "validation" ? repositoryRoot : path.dirname(entry!),
      },
      bundle: true,
      write: false,
      platform: "browser",
      format: "esm",
      target: "es2022",
      jsx: "automatic",
      plugins: [moduleBoundaryPlugin(sourceRoot, path.dirname(entry ?? sourceRoot))],
      legalComments: "none",
      minifySyntax: true,
      treeShaking: true,
      logLevel: "silent",
    });
  } catch (error) {
    throw new Error(`Failed to compile sidebar module '${id}'`, { cause: error });
  }
  const javascript = result.outputFiles[0]?.contents;
  if (!javascript) throw new Error(`esbuild did not emit JavaScript for '${id}'`);
  assertSafeModuleOutput(Buffer.from(javascript).toString("utf8"), id);
  const header = serializeSidebarPluginEnvelopeHeader({
    id,
    route,
    version: PLUGIN_RELEASE_VERSION,
    contractRange: CONTRACT_RANGE,
  });
  return Buffer.concat([Buffer.from(header), Buffer.from(javascript)]);
}

async function resolveSourceSha(): Promise<string> {
  const override = process.env.EVERSYNC_SIDEBAR_MODULE_SOURCE_SHA;
  if (override !== undefined) {
    if (!/^[a-f0-9]{40,64}$/.test(override)) {
      throw new Error("EVERSYNC_SIDEBAR_MODULE_SOURCE_SHA must be a 40-64 character lowercase SHA");
    }
    return override;
  }
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    windowsHide: true,
  });
  const sourceSha = stdout.trim();
  if (!/^[a-f0-9]{40,64}$/.test(sourceSha)) throw new Error("Unable to determine build source SHA");
  return sourceSha;
}

async function promoteOutput(stagingDirectory: string, outputDirectory: string): Promise<void> {
  const backupDirectory = `${outputDirectory}.backup-${process.pid}`;
  const hadOutput = await exists(outputDirectory);
  await mkdir(path.dirname(outputDirectory), { recursive: true });
  await rm(backupDirectory, { recursive: true, force: true });
  let originalMoved = false;
  try {
    if (hadOutput) {
      if (process.argv.includes("--inject-first-rename-failure")) {
        throw new Error("Injected first rename failure");
      }
      await rename(outputDirectory, backupDirectory);
      originalMoved = true;
    }
    if (process.argv.includes("--inject-second-rename-failure")) {
      throw new Error("Injected second rename failure");
    }
    await rename(stagingDirectory, outputDirectory);
    await rm(backupDirectory, { recursive: true, force: true });
  } catch (error) {
    if (originalMoved) {
      await rm(outputDirectory, { recursive: true, force: true });
      await rename(backupDirectory, outputDirectory);
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const mode = sourceMode();
  const catalog = selectedCatalog();
  const outputDirectory = path.resolve(option("--outdir") ?? "plugin-bundles");
  const sourceRoot = path.resolve(option("--source-root") ?? "src/modules");
  const sourceSha = await resolveSourceSha();
  const entries =
    mode === "strict" ? await strictEntries(sourceRoot, catalog) : new Map<string, string>();
  const stagingDirectory = `${outputDirectory}.tmp-${process.pid}`;
  await rm(stagingDirectory, { recursive: true, force: true });
  await mkdir(stagingDirectory, { recursive: true });

  try {
    const assets: SidebarModuleManifestAsset[] = [];
    for (const catalogEntry of catalog) {
      const body = await compileSource(
        catalogEntry.id,
        catalogEntry.route,
        mode,
        sourceRoot,
        entries
      );
      const file = `${catalogEntry.id}-${PLUGIN_RELEASE_VERSION}.mjs`;
      await writeFile(path.join(stagingDirectory, file), body, { mode: 0o644 });
      assets.push({
        id: catalogEntry.id,
        route: catalogEntry.route,
        file,
        size: body.byteLength,
        sha256: createHash("sha256").update(body).digest("hex"),
        version: PLUGIN_RELEASE_VERSION,
        contractRange: CONTRACT_RANGE,
      });
    }

    const manifest: SidebarModuleManifest = {
      releaseVersion: PLUGIN_RELEASE_VERSION,
      contractVersion: HOST_PLUGIN_CONTRACT_VERSION,
      sourceMode: mode,
      sourceSha,
      assets,
    };
    await writeFile(
      path.join(stagingDirectory, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { mode: 0o644 }
    );
    if (catalog.length === PLUGIN_CATALOG.length) {
      await validateSidebarModuleManifestDirectory(stagingDirectory);
    }
    await promoteOutput(stagingDirectory, outputDirectory);
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
  }

  console.log(`Built ${catalog.length} sidebar modules in ${outputDirectory}`);
}

await main();
