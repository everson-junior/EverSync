"use client";

import dynamic from "next/dynamic";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { SidebarItemId } from "@/shared/constants/sidebarVisibility";
import { getPluginDefinition } from "@/lib/plugins/registry";
import PluginErrorBoundary from "./PluginErrorBoundary";
import {
  createSidebarPluginHost,
  resolveSidebarPluginComponent,
  toPluginLoadError,
  type SidebarPluginComponent,
  type SidebarPluginHost,
} from "./pluginHostRuntime";
import { initializeSidebarPluginRuntime } from "./pluginRuntimeBridge";

interface PluginRouteHostProps {
  pluginId: SidebarItemId;
}

interface DynamicExtensionProps {
  pluginId: SidebarItemId;
  host: SidebarPluginHost;
}

export function PluginLoadingState() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[60vh] items-center justify-center gap-3 text-sm text-text-muted"
    >
      <span className="material-symbols-outlined animate-spin text-[20px]" aria-hidden="true">
        progress_activity
      </span>
      Loading module
    </div>
  );
}

function ExtensionLoader({ pluginId, host }: DynamicExtensionProps) {
  const [Extension, setExtension] = useState<SidebarPluginComponent | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    initializeSidebarPluginRuntime(host);
    void import(
      /* webpackIgnore: true */ `/api/sidebar-plugins/${encodeURIComponent(pluginId)}/bundle`
    )
      .then((extensionModule: { default?: unknown }) => {
        const plugin = getPluginDefinition(pluginId);
        if (!plugin) throw new Error(`Unknown sidebar plugin '${pluginId}'`);
        const component = resolveSidebarPluginComponent(
          extensionModule.default,
          { id: plugin.id, route: plugin.route },
          host
        );
        if (active) setExtension(() => component);
      })
      .catch((error: unknown) => {
        if (active) setLoadError(toPluginLoadError(pluginId, error));
      });
    return () => {
      active = false;
    };
  }, [host, pluginId]);

  if (loadError) throw loadError;
  return Extension ? <Extension /> : <PluginLoadingState />;
}

const DynamicExtension = dynamic<DynamicExtensionProps>(async () => ExtensionLoader, {
  ssr: false,
  loading: () => <PluginLoadingState />,
});

export default function PluginRouteHost({ pluginId }: PluginRouteHostProps) {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const host = useMemo(
    () =>
      createSidebarPluginHost({
        fetch: globalThis.fetch.bind(globalThis),
        route: pathname,
        locale,
        navigation: {
          push: router.push,
          replace: router.replace,
          refresh: router.refresh,
          back: router.back,
        },
      }),
    [locale, pathname, router]
  );

  return (
    <PluginErrorBoundary resetKey={`${pluginId}:${host.route}`}>
      <DynamicExtension pluginId={pluginId} host={host} />
    </PluginErrorBoundary>
  );
}
