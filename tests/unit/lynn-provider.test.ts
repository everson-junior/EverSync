import test from "node:test";
import assert from "node:assert/strict";

const { REGISTRY } = await import("../../open-sse/config/providers/index.ts");
const { APIKEY_PROVIDERS, ENTERPRISE_CLOUD_PROVIDER_IDS } =
  await import("../../src/shared/constants/providers.ts");

test("LYNN is a corporate OpenAI-compatible provider with standard model discovery", () => {
  const lynn = REGISTRY.lynn;

  assert.ok(lynn);
  assert.equal(lynn.format, "openai");
  assert.equal(lynn.baseUrl, "https://proxy.dta.totvs.ai/v1/chat/completions");
  assert.equal(lynn.modelsUrl, "https://proxy.dta.totvs.ai/v1/models");
  assert.equal(lynn.authHeader, "x-api-key");
  assert.equal(lynn.passthroughModels, true);
  assert.deepEqual(lynn.models, [{ id: "gpt-5.6-terra", name: "LYNN - GPT 5.6 Terra" }]);
  assert.equal(ENTERPRISE_CLOUD_PROVIDER_IDS.has("lynn"), true);
  assert.equal(APIKEY_PROVIDERS.lynn.name, "LYNN");
});
