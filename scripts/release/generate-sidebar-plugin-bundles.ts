import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { PLUGIN_REGISTRY, PLUGIN_RELEASE_VERSION } from "../../src/lib/plugins/registry";

const outputDirectory = path.resolve(process.argv[2] ?? "plugin-bundles");
const bundle = Buffer.from(
  "export default function SidebarExtension({ services }) {\n" +
    "  void services.fetch;\n" +
    "  return `Dynamic extension loaded successfully at ${services.route}`;\n" +
    "}\n"
);
const checksum = createHash("sha256").update(bundle).digest("hex");

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const assets = [...PLUGIN_REGISTRY.values()].map((plugin) => ({
  id: plugin.id,
  route: plugin.route,
  file: plugin.bundleFile,
  sha256: checksum,
}));

await Promise.all(
  assets.map((asset) => writeFile(path.join(outputDirectory, asset.file), bundle, { mode: 0o644 }))
);
await writeFile(
  path.join(outputDirectory, "manifest.json"),
  `${JSON.stringify({ version: PLUGIN_RELEASE_VERSION, sha256: checksum, assets }, null, 2)}\n`,
  { mode: 0o644 }
);

console.log(`Generated ${assets.length} bundles in ${outputDirectory}`);
console.log(`EVERSYNC_PLUGIN_SHA256=${checksum}`);
