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
  const activeController = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      activeController.current?.abort();
      activeController.current = null;
    },
    []
  );

  const install = useCallback(async (item: SidebarItemDefinition): Promise<PluginInstallResult> => {
    if (item.isNative) return { installed: true };

    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    setStateById((current) => ({ ...current, [item.id]: "installing" }));

    try {
      const response = await fetch(`/api/sidebar-plugins/${encodeURIComponent(item.id)}`, {
        method: "POST",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Installation failed (${response.status})`);
      setStateById((current) => ({ ...current, [item.id]: "installed" }));
      return { installed: true };
    } catch (error) {
      if (controller.signal.aborted) return { installed: false, error: "Installation cancelled" };
      await fetch(`/api/sidebar-plugins/${encodeURIComponent(item.id)}`, {
        method: "DELETE",
      }).catch(() => undefined);
      setStateById((current) => ({ ...current, [item.id]: "error" }));
      return {
        installed: false,
        error: error instanceof Error ? error.message : "Installation failed",
      };
    } finally {
      if (activeController.current === controller) activeController.current = null;
    }
  }, []);

  return { install, stateById };
}
