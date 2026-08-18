import { notFound } from "next/navigation";
import { getPluginForRoute } from "@/lib/plugins/registry";

interface PluginPageProps {
  params: Promise<{ pluginRoute: string[] }>;
}

export default async function PluginPage({ params }: PluginPageProps) {
  const { pluginRoute } = await params;
  const pathname = `/dashboard/${pluginRoute.join("/")}`;

  if (!getPluginForRoute(pathname)) notFound();
  return null;
}
