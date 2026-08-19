import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { usePluginInstaller } from "../../../src/shared/hooks/usePluginInstaller";
import type { SidebarItemDefinition } from "../../../src/shared/constants/sidebarVisibility";

type HookResult = ReturnType<typeof usePluginInstaller>;

const dom = new JSDOM("<!doctype html><html><body></body></html>");
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  IS_REACT_ACT_ENVIRONMENT: true,
});

function item(id: string): SidebarItemDefinition {
  return { id, labelKey: id, icon: "", path: `/dashboard/${id}` } as SidebarItemDefinition;
}

function renderInstaller() {
  let latest: HookResult | null = null;
  function Wrapper() {
    latest = usePluginInstaller();
    return null;
  }

  const element = document.createElement("div");
  const root = createRoot(element);
  act(() => root.render(<Wrapper />));
  return { get: () => latest!, root };
}

afterEach(() => {
  mock.restoreAll();
});

describe("usePluginInstaller", () => {
  it("clears the superseded item's installing state and ignores its stale completion", async () => {
    const requests: Array<{ signal: AbortSignal; resolve: (response: Response) => void }> = [];
    mock.method(
      globalThis,
      "fetch",
      (_url, init) =>
        new Promise<Response>((resolve) =>
          requests.push({ signal: (init as RequestInit).signal as AbortSignal, resolve })
        )
    );
    const hook = renderInstaller();

    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    await act(async () => {
      first = hook.get().install(item("mcp"));
      await Promise.resolve();
      second = hook.get().install(item("a2a"));
      await Promise.resolve();
    });

    assert.equal(requests[0].signal.aborted, true);
    assert.deepEqual(hook.get().stateById, { mcp: "idle", a2a: "installing" });

    await act(async () => {
      requests[0].resolve(new Response(null, { status: 201 }));
      requests[1].resolve(new Response(null, { status: 201 }));
      await Promise.all([first, second]);
    });
    assert.deepEqual(hook.get().stateById, { mcp: "idle", a2a: "installed" });

    act(() => hook.root.unmount());
  });

  it("aborts the active install on unmount", () => {
    let signal!: AbortSignal;
    mock.method(globalThis, "fetch", (_url, init) => {
      signal = (init as RequestInit).signal as AbortSignal;
      return new Promise<Response>(() => undefined);
    });
    const hook = renderInstaller();

    act(() => {
      void hook.get().install(item("mcp"));
    });
    act(() => hook.root.unmount());

    assert.equal(signal.aborted, true);
  });
});
