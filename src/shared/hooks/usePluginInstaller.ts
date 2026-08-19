"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SidebarItemDefinition } from "@/shared/constants/sidebarVisibility";

export type PluginInstallState = "idle" | "installing" | "installed" | "error";

interface PluginInstallResult {
  installed: boolean;
  error?: string;
}

export function usePluginInstaller() {
  const [stateById, setStateById] = useState<Record<string, PluginInstallState>>({});
  const activeInstall = useRef<{ id: string; controller: AbortController } | null>(null);

  useEffect(
    () => () => {
      const active = activeInstall.current;
      active?.controller.abort();
      activeInstall.current = null;
    },
    []
  );

  const install = useCallback(async (item: SidebarItemDefinition): Promise<PluginInstallResult> => {
    if (item.isNative) return { installed: true };

    const previous = activeInstall.current;
    previous?.controller.abort();
    const controller = new AbortController();
    activeInstall.current = { id: item.id, controller };
    setStateById((current) => ({
      ...current,
      ...(previous ? { [previous.id]: "idle" as const } : {}),
      [item.id]: "installing",
    }));

    try {
      const response = await fetch(`/api/sidebar-plugins/${encodeURIComponent(item.id)}`, {
        method: "POST",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Installation failed (${response.status})`);
      if (activeInstall.current?.controller !== controller) {
        return { installed: false, error: "Installation cancelled" };
      }
      setStateById((current) => ({ ...current, [item.id]: "installed" }));
      return { installed: true };
    } catch (error) {
      if (controller.signal.aborted) return { installed: false, error: "Installation cancelled" };
      setStateById((current) => ({ ...current, [item.id]: "error" }));
      return {
        installed: false,
        error: error instanceof Error ? error.message : "Installation failed",
      };
    } finally {
      if (activeInstall.current?.controller === controller) activeInstall.current = null;
    }
  }, []);

  return { install, stateById };
}
