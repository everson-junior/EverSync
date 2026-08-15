# EverSync Architecture

## System shape

EverSync is a production Next.js application and installable Node.js CLI that routes LLM requests to multiple upstream providers. The `src/app/api/` routes accept dashboard and client traffic, route authorization is evaluated in `src/server/authz/`, and request processing enters the `open-sse/` handler and executor layers.

## Primary flows

1. A client request reaches an App Router endpoint.
2. Authorization classifies the route and applies locality or management policy.
3. Chat requests enter `open-sse/handlers/chatCore.ts`, where request normalization, guardrails, routing, provider credentials, translation, and upstream execution occur.
4. The application returns JSON or streaming SSE responses and records usage or audit data.

## Trust boundaries

- Internet or LAN client input to API routes.
- Authenticated management traffic to privileged configuration and service-management routes.
- User-controlled LLM messages and tool payloads to the routing pipeline.
- Provider credentials and request bodies crossing to external upstream providers.
- Local machine commands and embedded-service lifecycle actions guarded as local-only.

## Availability

The public API, authentication and routing pipeline are CRITICAL. Local-only lifecycle features are STANDARD because they can start processes or alter local host state.
