# Request Pipeline

**Component:** `open-sse/handlers/chatCore.ts`
**Criticality:** CRITICAL

`chatCore.ts` orchestrates request sanitization, format translation, memory and skill injection, provider credential resolution, execution, streaming, error handling, usage tracking, and guardrail hooks.

**Trust boundary:** User message content, request headers, provider configuration, and upstream responses cross from untrusted clients or third-party providers into server-side routing and persistence logic.

**Security constraints:** Error response construction is centralized through error utilities, and request processing has separate sanitization and guardrail hooks. The large integration surface warrants targeted review of transformations, forwarded headers, outbound URL formation, credential selection, and plugin hooks.

Related vulnerability classes: [Input Validation](../vulnerabilities/Input-Validation.md), [SSRF and Process Exposure](../vulnerabilities/SSRF-Process-Exposure.md).
