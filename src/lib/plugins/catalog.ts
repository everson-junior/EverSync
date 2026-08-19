import { SIDEBAR_SECTIONS, getSectionItems } from "../../shared/constants/sidebarVisibility";
import type { SidebarItemId } from "../../shared/constants/sidebarVisibility";

export interface SidebarPluginCatalogEntry {
  id: SidebarItemId;
  route: string;
  integrityEnv: string;
}

function integrityEnvName(id: string): string {
  return `EVERSYNC_PLUGIN_SHA256_${id.replaceAll("-", "_").toUpperCase()}`;
}

function buildPluginCatalog(): readonly SidebarPluginCatalogEntry[] {
  const entries = SIDEBAR_SECTIONS.flatMap(getSectionItems)
    .filter((item) => !item.isNative && !item.external)
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
    entries.length !== 71 ||
    uniqueIds.size !== entries.length ||
    uniqueRoutes.size !== entries.length
  ) {
    throw new Error("Sidebar plugin catalog must contain exactly 71 unique ids and routes");
  }
  return Object.freeze(entries);
}

export const PLUGIN_CATALOG = buildPluginCatalog();
