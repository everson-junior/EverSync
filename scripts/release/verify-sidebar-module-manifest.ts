import path from "node:path";
import { validateSidebarModuleManifestDirectory } from "./sidebar-module-manifest";

const outputDirectory = path.resolve(process.argv[2] ?? "plugin-bundles");
const manifest = await validateSidebarModuleManifestDirectory(outputDirectory);
console.log(`Verified ${manifest.assets.length} sidebar module assets in ${outputDirectory}`);
