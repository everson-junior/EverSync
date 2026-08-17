import test from "node:test";
import assert from "node:assert/strict";

const sidebarVisibility = await import("../../src/shared/constants/sidebarVisibility.ts");

test("sidebar removes the corporate providers navigation shortcut", () => {
  const section = sidebarVisibility.SIDEBAR_SECTIONS.find(
    (candidate) => candidate.id === "omni-proxy"
  );
  assert.ok(section, "expected omni-proxy sidebar section to exist");

  const items = sidebarVisibility.getSectionItems(section);
  assert.equal(
    items.some((item) => item.id === "corporate-providers"),
    false
  );
  assert.equal(
    items.some((item) => item.href === "/dashboard/providers?category=corporate"),
    false
  );
  assert.equal(
    items.some((item) => item.href === "/dashboard/providers"),
    true
  );
});
