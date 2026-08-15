KB_SNAPSHOT: UNPINNED

# EverSync Threat Model

## System Overview Summary

EverSync is a production LLM routing service with a Next.js API and dashboard, a Node.js CLI, SQLite-backed configuration, and an `open-sse` request pipeline that forwards client requests to external AI providers.

## Deployment Intent

Intent: PRODUCTION

The KB identifies externally reachable API routes, a package runtime entrypoint, Docker and Electron deployment artifacts, and CRITICAL service components. The sample-only checklist is not satisfied.

## Trust Boundaries

- **Client-to-API boundary:** Internet or LAN callers submit JSON, headers, uploaded content, and route parameters to App Router endpoints. [Route Authorization](entities/route_authorization.md) and [Prompt Injection Guard](entities/prompt_injection_guard.md) mediate subsets of this traffic.
- **Management-to-local-host boundary:** Management and service lifecycle features can expose process spawning, local configuration, service proxies, or browser automation. [Route Authorization](entities/route_authorization.md) must prevent remote access unless an explicitly safe bypass is authorized.
- **Client-to-provider boundary:** [Request Pipeline](entities/request_pipeline.md) accepts user-selected models and provider-related configuration before building outbound calls with provider credentials.
- **Provider-to-client boundary:** Third-party upstream responses are translated and streamed to clients, then may be cached, logged, or used for usage accounting.

## Threat Actors and Vectors

| Actor                                                       | Reachable boundary                   | Primary objective                                                                                          |
| ----------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Unauthenticated network attacker                            | Public client-to-API boundary        | Reach privileged routes, bypass authentication, force risky outbound actions                               |
| Low-privilege authenticated user                            | Client and management API boundaries | Escalate scope, access another tenant's provider credentials or configuration                              |
| Malicious prompt or tool caller                             | Request pipeline                     | Influence agentic hooks, tool data handling, routing or downstream execution                               |
| Malicious upstream provider or compromised provider account | Provider-to-client boundary          | Inject hostile response content, cause parser or streaming failures, exfiltrate sensitive request metadata |
| Local adversary or compromised LAN peer                     | Management-to-local-host boundary    | Trigger lifecycle operations or inspect local-only data                                                    |

## High-Risk Assets

| Asset                                              | Tier     | Rationale                                                                        |
| -------------------------------------------------- | -------- | -------------------------------------------------------------------------------- |
| Public API and chat routing availability           | CRITICAL | Production client requests depend on it continuously.                            |
| Provider credentials and encrypted connection data | CRITICAL | Exposure permits unauthorized upstream usage and potential customer impact.      |
| Authorization configuration and API keys           | CRITICAL | They control access to management and client API surfaces.                       |
| Local service lifecycle and host process execution | STANDARD | Compromise affects the operator host and embedded services.                      |
| Usage, audit, and routing data                     | STANDARD | Integrity and confidentiality affect billing, operations, and incident response. |

## Review Priorities

1. Validate route-locality decisions and management bypass behavior against remotely controllable request data.
2. Trace untrusted request values through routing, provider URL selection, header merging, plugin hooks, and external fetches.
3. Review response transformation and streaming error paths for sensitive-data disclosure or control-flow bypasses.
4. Verify that process-capable or local-service routes remain classified as local-only.
