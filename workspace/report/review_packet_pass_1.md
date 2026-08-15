# Mantis Security Review Packet

## Scope

Pass 1 reviewed production request authorization, LLM request routing, and the prompt-injection compatibility middleware. This pass did not run reproduction or patch stages by design.

## Executive Summary

One conditionally production-viable finding remains after independent review. It affects an operator-enabled privacy control on wrapper-only client API routes. Two initial candidates were rejected: one was protected by the global authorization pipeline, and one relied on treating a bounded heuristic scan as a complete security boundary.

## Findings

### Medium: PII redaction result is not applied by injection-guard facade

- ID: `f2-pii-redaction-facade`
- Discovery snapshot: legacy, not recorded
- Exposure: Client API
- Final risk score: 6/10
- Production viability: Conditional viable
- Reproduction status: Statically confirmed; no runtime reproduction was executed in this pipeline

When `PII_REDACTION_ENABLED` is enabled, the input sanitizer builds a redacted copy of request content. `evaluatePromptInjection()` returns detection metadata but not that redacted copy, and `withInjectionGuard()` supplies downstream handlers with the original parsed request. Wrapper-only endpoints such as embeddings can therefore forward detectable PII to the selected upstream provider despite the enabled request-redaction setting.

The affected flow is implemented across `src/shared/utils/inputSanitizer.ts`, `src/lib/guardrails/promptInjection.ts`, `src/middleware/promptInjectionGuard.ts`, and `src/app/api/v1/embeddings/route.ts`.

Impact is conditional on an operator opting in to request PII redaction, which is disabled by default. Once enabled, the control fails for routes using the compatibility wrapper without the full guardrail registry pipeline.

Recommended remediation: extend the prompt-injection decision interface to carry the sanitized payload and have `withInjectionGuard()` pass that payload downstream, or route wrapper-only APIs through the same PIIMaskerGuardrail path that applies `modifiedPayload`. Add regression tests proving that an embeddings request with a detectable email is redacted before provider dispatch when the feature flag is enabled.

## Disposition

- `f1-provider-node-credential-redirection`: rejected during review because the global `/api/*` proxy invokes the authorization pipeline before the handler.
- `f3-prompt-scan-bound`: rejected during review because the bounded regex scan is an explicit performance tradeoff and not a complete authorization boundary.

## Limitations

`mantis-reproduce` and `mantis-patch` were intentionally not run. The remaining finding is supported by static control-flow evidence and should receive a focused regression test before remediation.
