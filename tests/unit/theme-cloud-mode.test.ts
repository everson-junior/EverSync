import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

test("globals.css defines .cloud theme tokens and @custom-variant cloud", () => {
  const cssPath = path.join(rootDir, "src/app/globals.css");
  const cssContent = fs.readFileSync(cssPath, "utf-8");

  assert.ok(
    cssContent.includes("@custom-variant cloud"),
    "globals.css must define @custom-variant cloud"
  );
  assert.ok(cssContent.includes(".cloud {"), "globals.css must contain .cloud theme rules");
  assert.ok(
    cssContent.includes("#8a5cf5"),
    "globals.css .cloud theme must use Roxo Ametista (#8a5cf5)"
  );
  assert.ok(
    cssContent.includes("#00d2ff"),
    "globals.css .cloud theme must use Ciano Elétrico (#00d2ff)"
  );
  assert.ok(
    cssContent.includes("#081627"),
    "globals.css .cloud theme must use Azul Profundo (#081627)"
  );
});

test("en.json and pt-BR.json contain cloud theme translation strings", () => {
  const enPath = path.join(rootDir, "src/i18n/messages/en.json");
  const ptBrPath = path.join(rootDir, "src/i18n/messages/pt-BR.json");

  const en = JSON.parse(fs.readFileSync(enPath, "utf-8"));
  const ptBr = JSON.parse(fs.readFileSync(ptBrPath, "utf-8"));

  assert.equal(en.header.switchToCloudMode, "Switch to cloud mode");
  assert.equal(en.settings.themeCloud, "Cloud");
  assert.equal(ptBr.header.switchToCloudMode, "Alternar para o modo nuvem");
  assert.equal(ptBr.settings.themeCloud, "Nuvem");
});

test("ThemeToggle component handles cloud theme state and icon", () => {
  const togglePath = path.join(rootDir, "src/shared/components/ThemeToggle.tsx");
  const content = fs.readFileSync(togglePath, "utf-8");

  assert.ok(
    content.includes('icon = "cloud"'),
    "ThemeToggle must set cloud icon when switching to cloud mode"
  );
  assert.ok(content.includes("switchToCloudMode"), "ThemeToggle must use switchToCloudMode label");
});

test("themeStore and useTheme hook support cloud mode", () => {
  const storePath = path.join(rootDir, "src/store/themeStore.ts");
  const hookPath = path.join(rootDir, "src/shared/hooks/useTheme.ts");

  const storeContent = fs.readFileSync(storePath, "utf-8");
  const hookContent = fs.readFileSync(hookPath, "utf-8");

  assert.ok(storeContent.includes('newTheme = "cloud"'), "themeStore must cycle to cloud theme");
  assert.ok(
    storeContent.includes('classList.add("cloud")'),
    "themeStore must apply cloud class to root element"
  );
  assert.ok(hookContent.includes("isCloud"), "useTheme hook must expose isCloud boolean flag");
});
