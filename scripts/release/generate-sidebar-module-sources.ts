import { access, copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { PLUGIN_CATALOG } from "../../src/lib/plugins/catalog";

const sourceRoot = path.resolve(process.argv[2] ?? "src/modules");
const authoredSourceRoot = path.resolve("scripts/release/sidebar-module-sources");
await rm(sourceRoot, { recursive: true, force: true });

for (const entry of PLUGIN_CATALOG) {
  const moduleDirectory = path.join(sourceRoot, entry.id);
  const moduleEntry = path.join(moduleDirectory, "index.tsx");
  const authoredEntry = path.join(authoredSourceRoot, `${entry.id}.tsx`);
  try {
    await access(authoredEntry);
    await mkdir(moduleDirectory, { recursive: true });
    await copyFile(authoredEntry, moduleEntry);
    continue;
  } catch {
    // Modules without an authored browser implementation use the standard adapter.
  }
  const pagePath = path.resolve(
    "src/app/(dashboard)/dashboard",
    entry.route.replace(/^\/dashboard\/?/, ""),
    "page.tsx"
  );
  let importPath = path.relative(moduleDirectory, pagePath).replaceAll("\\", "/");
  if (!importPath.startsWith(".")) importPath = `./${importPath}`;

  await mkdir(moduleDirectory, { recursive: true });
  await writeFile(moduleEntry, `export { default } from ${JSON.stringify(importPath)};\n`, {
    mode: 0o644,
  });
}

console.log(`Generated ${PLUGIN_CATALOG.length} sidebar module source adapters in ${sourceRoot}`);
