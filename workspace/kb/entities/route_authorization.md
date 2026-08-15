# Route Authorization

**Component:** `src/server/authz/routeGuard.ts`
**Criticality:** CRITICAL

The route guard classifies privileged paths into local-only, always-protected, and management tiers. It checks loopback and private-LAN origin representations, recognizes local-only route prefixes and dynamic-path patterns, and prevents management-scope bypasses for spawn-capable prefixes.

**Trust boundary:** Remote request metadata and peer address classification determine whether callers can access local-process and management surfaces.

**Security constraints:** The local-only list covers routes that can spawn processes or proxy embedded services. Bypass prefixes are checked against the shared spawn-capable deny-list before a remote management scope can access a path.

Related vulnerability classes: [Authorization Bypass](../vulnerabilities/Authorization-Bypass.md), [SSRF and Process Exposure](../vulnerabilities/SSRF-Process-Exposure.md).
