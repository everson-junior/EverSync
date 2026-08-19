import { NextRequest, NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";

const source = `function requireRuntime() {
  const runtime = globalThis.__EVERSYNC_SIDEBAR_PLUGIN_RUNTIME__;
  if (!runtime) throw new Error("Sidebar plugin runtime is not initialized");
  return runtime;
}
export const React = requireRuntime().React;
export const getHost = () => requireRuntime().host;
export const getRoute = () => getHost().route;
export const getLocale = () => getHost().locale;
export const getNavigation = () => getHost().navigation;
export const getPrimitives = () => getHost().primitives;
export const fetch = (...args) => getHost().fetch(...args);
export const host = new Proxy({}, {
  get(_target, property) {
    return Reflect.get(getHost(), property);
  }
});
export default host;
`;

export async function GET(request: NextRequest) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;
  return new NextResponse(source, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
