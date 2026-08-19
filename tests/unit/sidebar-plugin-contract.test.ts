import assert from "node:assert/strict";
import test from "node:test";
import {
  HOST_PLUGIN_CONTRACT_VERSION,
  parseSidebarPluginEnvelopeHeader,
  serializeSidebarPluginEnvelopeHeader,
  validateSidebarPluginEnvelope,
  type SidebarPluginEnvelope,
} from "../../src/lib/plugins/contract.ts";

function validEnvelope(overrides: Partial<SidebarPluginEnvelope> = {}): SidebarPluginEnvelope {
  return {
    id: "mcp",
    route: "/dashboard/mcp",
    version: "3.8.50",
    contractRange: `>=${HOST_PLUGIN_CONTRACT_VERSION} <2.0.0`,
    factory: () => null,
    ...overrides,
  };
}

test("accepts a well-formed compatible sidebar plugin envelope", () => {
  const envelope = validEnvelope();

  assert.equal(
    validateSidebarPluginEnvelope(envelope, { id: "mcp", route: "/dashboard/mcp" }),
    envelope
  );
});

test("rejects malformed sidebar plugin envelopes deterministically", () => {
  assert.throws(() => validateSidebarPluginEnvelope(null, { id: "mcp", route: "/dashboard/mcp" }), {
    message: "Invalid sidebar plugin envelope: expected an object",
  });
  assert.throws(
    () =>
      validateSidebarPluginEnvelope(
        { ...validEnvelope(), factory: "not-a-function" },
        { id: "mcp", route: "/dashboard/mcp" }
      ),
    { message: "Invalid sidebar plugin envelope: 'factory' must be a function" }
  );
  assert.throws(
    () =>
      validateSidebarPluginEnvelope(validEnvelope({ version: "" }), {
        id: "mcp",
        route: "/dashboard/mcp",
      }),
    { message: "Invalid sidebar plugin envelope: 'version' must be a non-empty string" }
  );
  for (const version of ["banana", "1.0"]) {
    assert.throws(
      () =>
        validateSidebarPluginEnvelope(validEnvelope({ version }), {
          id: "mcp",
          route: "/dashboard/mcp",
        }),
      { message: `Invalid sidebar plugin module version: '${version}'` }
    );
  }
  assert.throws(
    () =>
      validateSidebarPluginEnvelope(validEnvelope({ contractRange: "^1.0.0" }), {
        id: "mcp",
        route: "/dashboard/mcp",
      }),
    { message: "Invalid sidebar plugin contract range: '^1.0.0'" }
  );
});

test("rejects an incompatible host contract range", () => {
  assert.throws(
    () =>
      validateSidebarPluginEnvelope(validEnvelope({ contractRange: ">=2.0.0 <3.0.0" }), {
        id: "mcp",
        route: "/dashboard/mcp",
      }),
    {
      message: `Incompatible sidebar plugin contract: host ${HOST_PLUGIN_CONTRACT_VERSION} does not satisfy >=2.0.0 <3.0.0`,
    }
  );
});

test("rejects an envelope with the wrong module id", () => {
  assert.throws(
    () =>
      validateSidebarPluginEnvelope(validEnvelope({ id: "a2a" }), {
        id: "mcp",
        route: "/dashboard/mcp",
      }),
    { message: "Invalid sidebar plugin envelope: expected id 'mcp', received 'a2a'" }
  );
});

test("rejects an envelope with the wrong module route", () => {
  assert.throws(
    () =>
      validateSidebarPluginEnvelope(validEnvelope({ route: "/dashboard/a2a" }), {
        id: "mcp",
        route: "/dashboard/mcp",
      }),
    {
      message:
        "Invalid sidebar plugin envelope: expected route '/dashboard/mcp', received '/dashboard/a2a'",
    }
  );
});

test("round-trips deterministic non-executable envelope metadata from bundle bytes", () => {
  const envelope = validEnvelope();
  const header = serializeSidebarPluginEnvelopeHeader({
    id: envelope.id,
    route: envelope.route,
    version: envelope.version,
    contractRange: envelope.contractRange,
  });
  const bytes = Buffer.from(`${header}throw new Error("must not execute");`);

  assert.deepEqual(parseSidebarPluginEnvelopeHeader(bytes, envelope), {
    id: envelope.id,
    route: envelope.route,
    version: envelope.version,
    contractRange: envelope.contractRange,
  });
});

test("rejects missing, malformed, and incompatible envelope headers", () => {
  const expected = { id: "mcp", route: "/dashboard/mcp" };
  assert.throws(
    () => parseSidebarPluginEnvelopeHeader(Buffer.from("export default {}\n"), expected),
    {
      message: "Invalid sidebar plugin envelope header: missing sentinel",
    }
  );
  assert.throws(
    () =>
      parseSidebarPluginEnvelopeHeader(
        Buffer.from("// EVERSYNC_SIDEBAR_PLUGIN_ENVELOPE {nope}\n"),
        expected
      ),
    { message: "Invalid sidebar plugin envelope header: malformed JSON" }
  );
  assert.throws(
    () =>
      parseSidebarPluginEnvelopeHeader(
        Buffer.from(
          serializeSidebarPluginEnvelopeHeader({
            id: "mcp",
            route: "/dashboard/mcp",
            version: "3.8.50",
            contractRange: ">=2.0.0 <3.0.0",
          })
        ),
        expected
      ),
    /Incompatible sidebar plugin contract/
  );
});
