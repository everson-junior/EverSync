import React from "react";
import * as ReactJsxRuntime from "react/jsx-runtime";
import type { SidebarPluginHost } from "./pluginHostRuntime";

const RUNTIME_KEY = "__EVERSYNC_SIDEBAR_PLUGIN_RUNTIME__";

export interface SidebarPluginRuntimeBridge {
  readonly host: SidebarPluginHost;
  readonly React: typeof React;
  readonly ReactJsxRuntime: typeof ReactJsxRuntime;
}

declare global {
  var __EVERSYNC_SIDEBAR_PLUGIN_RUNTIME__: SidebarPluginRuntimeBridge | undefined;
}

export function initializeSidebarPluginRuntime(host: SidebarPluginHost): void {
  const current = globalThis.__EVERSYNC_SIDEBAR_PLUGIN_RUNTIME__;
  if (current?.host === host) return;
  globalThis.__EVERSYNC_SIDEBAR_PLUGIN_RUNTIME__ = Object.freeze({
    host,
    React,
    ReactJsxRuntime,
  });
}

export function requireSidebarPluginRuntime(): SidebarPluginRuntimeBridge {
  const runtime = globalThis.__EVERSYNC_SIDEBAR_PLUGIN_RUNTIME__;
  if (!runtime) throw new Error("Sidebar plugin runtime is not initialized");
  return runtime;
}
