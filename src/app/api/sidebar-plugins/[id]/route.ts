import { NextRequest, NextResponse } from "next/server";
import { buildErrorBody } from "@omniroute/open-sse/utils/error";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import {
  clearInstalledPlugin,
  installPluginBundle,
  readInstalledPlugin,
} from "@/lib/plugins/bundleStore";
import { getPluginDefinition } from "@/lib/plugins/registry";
import { sidebarPluginIdSchema } from "@/shared/validation/schemas";

async function resolvePlugin(params: Promise<{ id: string }>) {
  const parsed = sidebarPluginIdSchema.safeParse((await params).id);
  return parsed.success ? getPluginDefinition(parsed.data) : null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;
  const plugin = await resolvePlugin(params);
  if (!plugin) return NextResponse.json({ error: "Unknown dynamic plugin" }, { status: 404 });

  const installed = await readInstalledPlugin(plugin);
  return NextResponse.json({ installed: Boolean(installed), plugin: installed });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;
  const plugin = await resolvePlugin(params);
  if (!plugin) return NextResponse.json({ error: "Unknown dynamic plugin" }, { status: 404 });

  try {
    const installed = await installPluginBundle(plugin);
    return NextResponse.json({ installed: true, plugin: installed }, { status: 201 });
  } catch (error) {
    await clearInstalledPlugin(plugin);
    console.error("[sidebar-plugins] Installation failed:", error);
    return NextResponse.json(buildErrorBody(502, "Failed to install extension"), { status: 502 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;
  const plugin = await resolvePlugin(params);
  if (!plugin) return NextResponse.json({ error: "Unknown dynamic plugin" }, { status: 404 });

  await clearInstalledPlugin(plugin);
  return NextResponse.json({ installed: false });
}
