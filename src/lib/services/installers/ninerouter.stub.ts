/**
 * Stub for `src/lib/services/installers/ninerouter.ts` activated by
 * `OMNIROUTE_BUILD_PROFILE=minimal`. The 9router install / spawn helpers are
 * removed from the built bundle. See SECURITY.md and
 * docs/security/SOCKET_DEV_FINDINGS.md.
 */
import { featureDisabledError } from "@/lib/build-profile/featureDisabled";

const FEATURE = "9router-installer";

export const NINEROUTER_PACKAGE = "9router";
export const NINEROUTER_INSTALL_DIR = "";

export interface InstallResult {
  installedVersion: string;
  installPath: string;
  durationMs: number;
}

export async function getInstalledVersion(): Promise<string | null> {
  return null;
}

export async function getLatestVersion(): Promise<string | null> {
  return null;
}

export async function install(_version = "latest"): Promise<never> {
  throw featureDisabledError(FEATURE);
}

export async function installNinerouter(): Promise<never> {
  throw featureDisabledError(FEATURE);
}

export async function update(): Promise<never> {
  throw featureDisabledError(FEATURE);
}

export async function uninstall(): Promise<never> {
  throw featureDisabledError(FEATURE);
}

export function resolveSpawnArgs(_apiKey: string, _port: number): never {
  throw featureDisabledError(FEATURE);
}
