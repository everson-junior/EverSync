export const HOST_PLUGIN_CONTRACT_VERSION = "1.0.0";
export const SIDEBAR_PLUGIN_ENVELOPE_SENTINEL = "// EVERSYNC_SIDEBAR_PLUGIN_ENVELOPE ";
export const MAX_SIDEBAR_PLUGIN_ENVELOPE_HEADER_BYTES = 4096;

export type SidebarPluginFactory<THost = unknown, TModule = unknown> = (host: THost) => TModule;

export interface SidebarPluginSourceContract<
  THost = unknown,
  TReact = unknown,
  TNavigation = unknown,
  TPrimitives = unknown,
> {
  readonly React: TReact;
  readonly host: THost;
  readonly fetch: typeof globalThis.fetch;
  getHost: () => THost;
  getRoute: () => string;
  getLocale: () => string;
  getNavigation: () => TNavigation;
  getPrimitives: () => TPrimitives;
}

export interface SidebarPluginEnvelope<THost = unknown, TModule = unknown> {
  id: string;
  route: string;
  version: string;
  contractRange: string;
  factory: SidebarPluginFactory<THost, TModule>;
}

export type SidebarPluginEnvelopeHeader = Omit<SidebarPluginEnvelope, "factory">;

export interface ExpectedSidebarPlugin {
  id: string;
  route: string;
}

type Version = readonly [major: number, minor: number, patch: number];

function parseVersion(value: string): Version | null {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(left: Version, right: Version): number {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

function satisfiesComparator(version: Version, comparator: string): boolean | null {
  const match = /^(>=|<=|>|<|=)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(comparator);
  if (!match) return null;

  const operator = match[1] ?? "=";
  const target: Version = [Number(match[2]), Number(match[3]), Number(match[4])];
  const comparison = compareVersions(version, target);

  if (operator === ">=") return comparison >= 0;
  if (operator === "<=") return comparison <= 0;
  if (operator === ">") return comparison > 0;
  if (operator === "<") return comparison < 0;
  return comparison === 0;
}

function satisfiesRange(version: string, range: string): boolean | null {
  const parsedVersion = parseVersion(version);
  const comparators = range.trim().split(/\s+/).filter(Boolean);
  if (!parsedVersion || comparators.length === 0) return null;

  let compatible = true;
  for (const comparator of comparators) {
    const result = satisfiesComparator(parsedVersion, comparator);
    if (result === null) return null;
    compatible = compatible && result;
  }
  return compatible;
}

function requireString(
  envelope: Record<string, unknown>,
  field: keyof SidebarPluginEnvelopeHeader
): string {
  const value = envelope[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid sidebar plugin envelope: '${field}' must be a non-empty string`);
  }
  return value;
}

function validateSidebarPluginEnvelopeMetadata(
  value: unknown,
  expected: ExpectedSidebarPlugin
): SidebarPluginEnvelopeHeader {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid sidebar plugin envelope: expected an object");
  }

  const candidate = value as Record<string, unknown>;
  const id = requireString(candidate, "id");
  const route = requireString(candidate, "route");
  const version = requireString(candidate, "version");
  const contractRange = requireString(candidate, "contractRange");
  if (!parseVersion(version)) {
    throw new Error(`Invalid sidebar plugin module version: '${version}'`);
  }
  if (id !== expected.id) {
    throw new Error(
      `Invalid sidebar plugin envelope: expected id '${expected.id}', received '${id}'`
    );
  }
  if (route !== expected.route) {
    throw new Error(
      `Invalid sidebar plugin envelope: expected route '${expected.route}', received '${route}'`
    );
  }

  const compatible = satisfiesRange(HOST_PLUGIN_CONTRACT_VERSION, contractRange);
  if (compatible === null) {
    throw new Error(`Invalid sidebar plugin contract range: '${contractRange}'`);
  }
  if (!compatible) {
    throw new Error(
      `Incompatible sidebar plugin contract: host ${HOST_PLUGIN_CONTRACT_VERSION} does not satisfy ${contractRange}`
    );
  }

  return { id, route, version, contractRange };
}

export function serializeSidebarPluginEnvelopeHeader(
  envelope: SidebarPluginEnvelopeHeader
): string {
  return `${SIDEBAR_PLUGIN_ENVELOPE_SENTINEL}${JSON.stringify(envelope)}\n`;
}

export function parseSidebarPluginEnvelopeHeader(
  bytes: Uint8Array,
  expected: ExpectedSidebarPlugin
): SidebarPluginEnvelopeHeader {
  const headerBytes = bytes.subarray(
    0,
    Math.min(bytes.byteLength, MAX_SIDEBAR_PLUGIN_ENVELOPE_HEADER_BYTES)
  );
  const newlineIndex = headerBytes.indexOf(10);
  if (newlineIndex === -1) {
    throw new Error("Invalid sidebar plugin envelope header: missing first-line terminator");
  }

  const firstLine = new TextDecoder("utf-8", { fatal: true })
    .decode(headerBytes.subarray(0, newlineIndex))
    .replace(/\r$/, "");
  if (!firstLine.startsWith(SIDEBAR_PLUGIN_ENVELOPE_SENTINEL)) {
    throw new Error("Invalid sidebar plugin envelope header: missing sentinel");
  }

  let value: unknown;
  try {
    value = JSON.parse(firstLine.slice(SIDEBAR_PLUGIN_ENVELOPE_SENTINEL.length));
  } catch (error) {
    throw new Error("Invalid sidebar plugin envelope header: malformed JSON", { cause: error });
  }
  return validateSidebarPluginEnvelopeMetadata(value, expected);
}

export function validateSidebarPluginEnvelope<THost = unknown, TModule = unknown>(
  value: unknown,
  expected: ExpectedSidebarPlugin
): SidebarPluginEnvelope<THost, TModule> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid sidebar plugin envelope: expected an object");
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.factory !== "function") {
    throw new Error("Invalid sidebar plugin envelope: 'factory' must be a function");
  }
  validateSidebarPluginEnvelopeMetadata(value, expected);

  return value as SidebarPluginEnvelope<THost, TModule>;
}
