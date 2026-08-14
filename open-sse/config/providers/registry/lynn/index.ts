import type { RegistryEntry } from "../../shared.ts";

export const lynnProvider: RegistryEntry = {
  id: "lynn",
  alias: "lynn",
  format: "openai",
  executor: "default",
  baseUrl: "https://proxy.dta.totvs.ai/v1/chat/completions",
  modelsUrl: "https://proxy.dta.totvs.ai/v1/models",
  authType: "apikey",
  authHeader: "x-api-key",
  passthroughModels: true,
  models: [{ id: "gpt-5.6-terra", name: "LYNN - GPT 5.6 Terra" }],
};
