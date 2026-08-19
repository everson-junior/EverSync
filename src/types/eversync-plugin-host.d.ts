import type React from "react";
import type {
  PluginHostNavigation,
  SidebarPluginHost,
  SidebarPluginPrimitives,
} from "@/shared/components/layouts/pluginHostRuntime";

export const React: typeof React;
export const fetch: typeof globalThis.fetch;
export const host: SidebarPluginHost;

export function getHost(): SidebarPluginHost;
export function getRoute(): string;
export function getLocale(): string;
export function getNavigation(): PluginHostNavigation;
export function getPrimitives(): SidebarPluginPrimitives;

export default host;
