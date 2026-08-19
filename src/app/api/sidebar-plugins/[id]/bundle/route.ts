import { NextRequest, NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { readVerifiedInstalledPlugin } from "@/lib/plugins/bundleStore";
import { getPluginDefinition } from "@/lib/plugins/registry";
import { sidebarPluginIdSchema } from "@/shared/validation/schemas";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  const parsed = sidebarPluginIdSchema.safeParse((await params).id);
  const plugin = parsed.success ? getPluginDefinition(parsed.data) : null;
  if (!plugin) return NextResponse.json({ error: "Unknown dynamic plugin" }, { status: 404 });

  const installed = await readVerifiedInstalledPlugin(plugin);
  if (!installed)
    return NextResponse.json({ error: "Extension is not installed" }, { status: 404 });

  return new NextResponse(installed.body, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
