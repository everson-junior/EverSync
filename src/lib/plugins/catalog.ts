import { SIDEBAR_SECTIONS, getSectionItems } from "../../shared/constants/sidebarVisibility";
import type { SidebarItemId } from "../../shared/constants/sidebarVisibility";

export interface SidebarPluginCatalogEntry {
  id: SidebarItemId;
  route: string;
  integrityEnv: string;
}

const PUBLISHABLE_PLUGIN_IDS = new Set<SidebarItemId>(["context-caveman"]);

function integrityEnvName(id: string): string {
  return `EVERSYNC_PLUGIN_SHA256_${id.replaceAll("-", "_").toUpperCase()}`;
}

function buildPluginCatalog(): readonly SidebarPluginCatalogEntry[] {
  const entries = SIDEBAR_SECTIONS.flatMap(getSectionItems)
    .filter((item) => !item.isNative && !item.external)
    .filter((item) => PUBLISHABLE_PLUGIN_IDS.has(item.id))
    .map((item) =>
      Object.freeze({
        id: item.id,
        route: item.href,
        integrityEnv: integrityEnvName(item.id),
      })
    );
  const uniqueIds = new Set(entries.map((entry) => entry.id));
  const uniqueRoutes = new Set(entries.map((entry) => entry.route));
  if (
    entries.length !== PUBLISHABLE_PLUGIN_IDS.size ||
    uniqueIds.size !== entries.length ||
    uniqueRoutes.size !== entries.length
  ) {
    throw new Error(
      "Sidebar plugin catalog must contain the configured unique publishable plugins"
    );
  }
  return Object.freeze(entries);
}

export const PLUGIN_CATALOG = buildPluginCatalog();
