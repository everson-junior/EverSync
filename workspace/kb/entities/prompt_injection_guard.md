# Prompt Injection Guard

**Component:** `src/middleware/promptInjectionGuard.ts`
**Criticality:** STANDARD

This compatibility middleware delegates prompt inspection to the guardrail registry. It clones request bodies before JSON parsing, blocks detected requests, and passes the parsed body to downstream handlers.

**Trust boundary:** JSON request bodies are attacker-controlled before inspection and downstream processing.

**Security constraints:** The guard is fail-closed when its own processing throws. Metadata headers are best-effort because Web Request headers can be immutable.

Related vulnerability class: [Input Validation](../vulnerabilities/Input-Validation.md).
