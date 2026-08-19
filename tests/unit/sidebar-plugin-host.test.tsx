import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import React, { act, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { HOST_PLUGIN_CONTRACT_VERSION } from "../../src/lib/plugins/contract.ts";
import PluginErrorBoundary from "../../src/shared/components/layouts/PluginErrorBoundary.tsx";
import { PluginLoadingState } from "../../src/shared/components/layouts/PluginRouteHost.tsx";
import {
  createSidebarPluginHost,
  PluginHostError,
  resolveSidebarPluginComponent,
} from "../../src/shared/components/layouts/pluginHostRuntime.ts";
import {
  initializeSidebarPluginRuntime,
  requireSidebarPluginRuntime,
} from "../../src/shared/components/layouts/pluginRuntimeBridge.ts";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  IS_REACT_ACT_ENVIRONMENT: true,
});

const roots: Root[] = [];

function createHost(fetch: typeof globalThis.fetch = globalThis.fetch.bind(globalThis)) {
  return createSidebarPluginHost({
    fetch,
    route: "/dashboard/mcp/tools",
    locale: "pt-BR",
    navigation: {
      push: () => undefined,
      replace: () => undefined,
      refresh: () => undefined,
      back: () => undefined,
    },
  });
}

function validEnvelope(factory: (host: ReturnType<typeof createHost>) => ComponentType) {
  return {
    id: "mcp",
    route: "/dashboard/mcp",
    version: "3.8.50",
    contractRange: `>=${HOST_PLUGIN_CONTRACT_VERSION} <2.0.0`,
    factory,
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = "";
});

describe("sidebar plugin browser host", () => {
  it("exposes the React namespace identity, route, locale, and stable delegated fetch", async () => {
    let receiver: unknown;
    const calls: unknown[][] = [];
    function installedFetch(this: unknown, ...args: unknown[]) {
      receiver = this;
      calls.push(args);
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    const delegatedFetch = installedFetch.bind(globalThis) as typeof globalThis.fetch;
    const host = createHost(delegatedFetch);

    assert.equal(host.React, React);
    assert.equal(host.route, "/dashboard/mcp/tools");
    assert.equal(host.locale, "pt-BR");
    assert.equal(host.fetch, delegatedFetch);
    assert.equal(typeof host.primitives.Button, "function");
    assert.equal(typeof host.primitives.Card, "function");
    assert.equal(Object.isFrozen(host.primitives), true);
    await host.fetch("/api/health");
    assert.equal(receiver, globalThis);
    assert.deepEqual(calls, [["/api/health"]]);
  });

  it("initializes top-level plugin imports with the existing React singleton and host", () => {
    const host = createHost();

    initializeSidebarPluginRuntime(host);
    const runtime = requireSidebarPluginRuntime();

    assert.equal(runtime.host, host);
    assert.equal(runtime.React, React);
    assert.equal(runtime.React, host.React);
    assert.equal(runtime.React.useState, React.useState);
    assert.equal(runtime.React.createContext, React.createContext);
  });

  it("renders an accessible loading state without claiming the feature is disabled", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => root.render(<PluginLoadingState />));

    assert.equal(
      container.querySelector('[role="status"]')?.textContent?.trim(),
      "progress_activityLoading module"
    );
    assert.doesNotMatch(container.textContent ?? "", /unavailable|indisponível/i);
  });

  it("validates id, route, and contract before invoking the factory", () => {
    let factoryCalls = 0;
    const envelope = validEnvelope(() => {
      factoryCalls += 1;
      return () => null;
    });

    assert.throws(
      () =>
        resolveSidebarPluginComponent(
          { ...envelope, route: "/dashboard/a2a" },
          { id: "mcp", route: "/dashboard/mcp" },
          createHost()
        ),
      (error: unknown) => error instanceof PluginHostError && error.category === "contract"
    );
    assert.equal(factoryCalls, 0);
  });

  it("returns the factory component without injecting private service props", () => {
    let receivedHost: ReturnType<typeof createHost> | null = null;
    const Extension = () => <div>loaded extension</div>;
    const host = createHost();
    const Resolved = resolveSidebarPluginComponent(
      validEnvelope((value) => {
        receivedHost = value;
        return Extension;
      }),
      { id: "mcp", route: "/dashboard/mcp" },
      host
    );

    assert.equal(receivedHost, host);
    assert.equal(Resolved, Extension);
  });

  it("categorizes render failures and keeps the surrounding shell mounted", async () => {
    const categories: string[] = [];
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    function BrokenExtension(): React.ReactNode {
      throw new Error("render failed");
    }

    await act(async () => {
      root.render(
        <div>
          <span>Basic shell</span>
          <PluginErrorBoundary resetKey="mcp" onError={(category) => categories.push(category)}>
            <BrokenExtension />
          </PluginErrorBoundary>
        </div>
      );
    });

    assert.match(container.textContent ?? "", /Basic shell/);
    assert.match(container.textContent ?? "", /Plugin unavailable \(render\)/);
    assert.deepEqual(categories, ["render"]);
  });
});
