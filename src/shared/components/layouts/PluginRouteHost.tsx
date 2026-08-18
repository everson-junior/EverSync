"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import FeatureDisabledNotice from "../FeatureDisabledNotice";
import type { SidebarItemId } from "@/shared/constants/sidebarVisibility";

interface PluginRouteHostProps {
  pluginId: SidebarItemId;
}

interface ExtensionProps {
  services: {
    fetch: typeof globalThis.fetch;
    route: string;
  };
}

interface DynamicExtensionProps extends ExtensionProps {
  pluginId: SidebarItemId;
}

function ExtensionLoader({ pluginId, services }: DynamicExtensionProps) {
  const [Extension, setExtension] = useState<ComponentType<ExtensionProps> | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    void import(
      /* webpackIgnore: true */ `/api/sidebar-plugins/${encodeURIComponent(pluginId)}/bundle`
    )
      .then((extensionModule: { default?: ComponentType<ExtensionProps> }) => {
        if (typeof extensionModule.default !== "function") {
          throw new Error(`Invalid extension contract for '${pluginId}'`);
        }
        if (active) setExtension(() => extensionModule.default as ComponentType<ExtensionProps>);
      })
      .catch((error: unknown) => {
        if (active)
          setLoadError(error instanceof Error ? error : new Error("Extension load failed"));
      });
    return () => {
      active = false;
    };
  }, [pluginId]);

  if (loadError) throw loadError;
  return Extension ? <Extension services={services} /> : <FeatureDisabledNotice />;
}

const DynamicExtension = dynamic<DynamicExtensionProps>(async () => ExtensionLoader, {
  ssr: false,
  loading: () => <FeatureDisabledNotice />,
});

/**
 * Browser extension contract: a self-contained ESM default React component.
 * Server globals (SQLite, open-sse, routeGuard) stay singletons behind authenticated
 * application APIs; extension bundles receive the existing CSRF/base-path fetch chain.
 */
export default function PluginRouteHost({ pluginId }: PluginRouteHostProps) {
  const services = useMemo(
    () => ({ fetch: globalThis.fetch.bind(globalThis), route: globalThis.location.pathname }),
    []
  );

  return <DynamicExtension pluginId={pluginId} services={services} />;
}
