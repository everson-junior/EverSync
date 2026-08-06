/**
 * liveServerAllowList — extract of the host/origin allow-list logic from
 * `src/server/ws/liveServer.ts`.
 *
 * Lives in its own module so unit tests can exercise it without booting the
 * full WebSocket server. The behaviour here MUST match the one used by the
 * connection handler exactly.
 *
 * Bug #1 (plans/2026-06-23-omniroute-v3.8.34-deep-audit.md) added the
 * `LIVE_WS_ALLOWED_HOSTS` opt-in for LAN/Tailscale deployments.
 */

const DEFAULT_HOST = "127.0.0.1";

/**
 * Default origins allowed to open a WebSocket against the local dashboard.
 * These match the loopback HTTP listener at port 20128.
 */
export const DEFAULT_ALLOWED_ORIGINS: readonly string[] = Object.freeze([
  "http://127.0.0.1:23026",
  "http://localhost:23026",
  "http://[::1]:23026",
  "http://127.0.0.1:20128",
  "http://localhost:20128",
  "http://[::1]:20128",
  "http://127.0.0.1:24026",
  "http://localhost:24026",
  "http://[::1]:24026",
]);

/**
 * Parse a comma-separated env value into a set of trimmed, non-empty entries.
 * Centralized so tests can exercise empty / whitespace / dup behaviour.
 */
export function parseCsvEnv(value: string | undefined | null): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

/**
 * Build the static origin allow-list from defaults + LIVE_WS_ALLOWED_ORIGINS.
 */
export function buildAllowedOrigins(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const port = env.PORT || env.OMNIROUTE_PORT || "23026";
  const dynamicOrigins = [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    `http://[::1]:${port}`,
  ];
  if (env.NEXT_PUBLIC_BASE_URL) {
    try {
      const u = new URL(env.NEXT_PUBLIC_BASE_URL);
      dynamicOrigins.push(u.origin);
    } catch {}
  }
  if (env.BASE_URL) {
    try {
      const u = new URL(env.BASE_URL);
      dynamicOrigins.push(u.origin);
    } catch {}
  }
  const extra = parseCsvEnv(env.LIVE_WS_ALLOWED_ORIGINS);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...dynamicOrigins, ...extra]);
}

/**
 * Build the host-based allow-list (LAN/Tailscale extension).
 */
export function buildAllowedHosts(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return parseCsvEnv(env.LIVE_WS_ALLOWED_HOSTS);
}

/**
 * Parse the host portion of an Origin URL.
 *
 * Returns `null` when the input is not a well-formed absolute URL — callers
 * should treat `null` as "not a match".
 */
export function originHost(origin: string): { host: string; hostname: string } | null {
  try {
    const url = new URL(origin);
    return { host: url.host, hostname: url.hostname };
  } catch {
    return null;
  }
}

/**
 * Whether the given Origin's host (or `host:port`) is in the host
 * allow-list. Returns false when the list is empty.
 */
export function originHostMatches(origin: string, allowedHosts: Set<string>): boolean {
  if (allowedHosts.size === 0) return false;
  const parsed = originHost(origin);
  if (!parsed) return false;
  return allowedHosts.has(parsed.host) || allowedHosts.has(parsed.hostname);
}

/**
 * Top-level Origin allow decision. The contract:
 *
 *   - When `origin` is undefined (no Origin header, e.g. CLI/MCP), we only
 *     accept the request when the WS listener is bound to loopback. This
 *     prevents drive-by LAN clients from omitting Origin to bypass the
 *     browser-side check.
 *
 *   - When `origin` is present, we accept it if it matches an entry in the
 *     static origin list (defaults + LIVE_WS_ALLOWED_ORIGINS), matches any loopback
 *     origin, or if its host matches an entry in the LAN allow-list (LIVE_WS_ALLOWED_HOSTS).
 */
export function isOriginAllowed(
  origin: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  options: { allowedOrigins?: Set<string>; allowedHosts?: Set<string> } = {}
): boolean {
  const allowedOrigins = options.allowedOrigins ?? buildAllowedOrigins(env);
  const allowedHosts = options.allowedHosts ?? buildAllowedHosts(env);

  if (!origin) {
    const host = env.LIVE_WS_HOST || DEFAULT_HOST;
    return host === "127.0.0.1" || host === "::1" || host === "localhost";
  }
  if (allowedOrigins.has(origin)) return true;
  if (originHostMatches(origin, allowedHosts)) return true;

  // Allow any loopback origin (e.g. http://localhost:23026, http://127.0.0.1:23026)
  const parsed = originHost(origin);
  if (
    parsed &&
    (parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "::1" ||
      parsed.hostname === "[::1]")
  ) {
    return true;
  }

  // Allow Electron internal app/file origins when bound to loopback host
  if (origin === "file://" || origin === "null" || origin.startsWith("app://")) {
    const host = env.LIVE_WS_HOST || DEFAULT_HOST;
    if (host === "127.0.0.1" || host === "::1" || host === "localhost") {
      return true;
    }
  }

  return false;
}
