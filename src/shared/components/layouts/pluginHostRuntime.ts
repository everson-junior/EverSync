import React, { type ComponentType } from "react";
import Button from "../Button";
import Card from "../Card";
import {
  validateSidebarPluginEnvelope,
  type ExpectedSidebarPlugin,
  type SidebarPluginEnvelope,
  type SidebarPluginSourceContract,
} from "@/lib/plugins/contract";

export type PluginHostFailureCategory = "load" | "contract" | "render";

export class PluginHostError extends Error {
  readonly category: PluginHostFailureCategory;

  constructor(category: PluginHostFailureCategory, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PluginHostError";
    this.category = category;
  }
}

export interface PluginHostNavigation {
  push: (href: string) => void;
  replace: (href: string) => void;
  refresh: () => void;
  back: () => void;
}

export interface SidebarPluginHost {
  React: typeof React;
  fetch: typeof globalThis.fetch;
  route: string;
  locale: string;
  navigation: PluginHostNavigation;
  primitives: SidebarPluginPrimitives;
  getRoute: () => string;
  getLocale: () => string;
  getNavigation: () => PluginHostNavigation;
}

export interface SidebarPluginPrimitives {
  readonly Button: typeof Button;
  readonly Card: typeof Card;
}

export type BrowserSidebarPluginSourceContract = SidebarPluginSourceContract<
  SidebarPluginHost,
  typeof React,
  PluginHostNavigation,
  SidebarPluginPrimitives
>;

export type SidebarPluginComponent = ComponentType<Record<string, never>>;
export type BrowserSidebarPluginEnvelope = SidebarPluginEnvelope<
  SidebarPluginHost,
  SidebarPluginComponent
>;

interface CreateSidebarPluginHostOptions {
  fetch: typeof globalThis.fetch;
  route: string;
  locale: string;
  navigation: PluginHostNavigation;
}

const APPROVED_PRIMITIVES: SidebarPluginPrimitives = Object.freeze({ Button, Card });

export function createSidebarPluginHost({
  fetch,
  route,
  locale,
  navigation,
}: CreateSidebarPluginHostOptions): SidebarPluginHost {
  const frozenNavigation = Object.freeze(navigation);
  return Object.freeze({
    React,
    fetch,
    route,
    locale,
    navigation: frozenNavigation,
    primitives: APPROVED_PRIMITIVES,
    getRoute: () => route,
    getLocale: () => locale,
    getNavigation: () => frozenNavigation,
  });
}

export function resolveSidebarPluginComponent(
  value: unknown,
  expected: ExpectedSidebarPlugin,
  host: SidebarPluginHost
): SidebarPluginComponent {
  try {
    const envelope = validateSidebarPluginEnvelope<SidebarPluginHost, SidebarPluginComponent>(
      value,
      expected
    );
    const component = envelope.factory(host);
    if (typeof component !== "function") {
      throw new Error("factory must return a React component");
    }
    return component;
  } catch (error) {
    if (error instanceof PluginHostError) throw error;
    throw new PluginHostError(
      "contract",
      `Sidebar plugin '${expected.id}' failed contract validation`,
      { cause: error }
    );
  }
}

export function toPluginLoadError(pluginId: string, error: unknown): PluginHostError {
  if (error instanceof PluginHostError) return error;
  return new PluginHostError("load", `Sidebar plugin '${pluginId}' failed to load`, {
    cause: error,
  });
}
