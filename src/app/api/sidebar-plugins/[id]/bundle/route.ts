import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import {
  clearInstalledPlugin,
  pluginBundlePath,
  readInstalledPlugin,
} from "@/lib/plugins/bundleStore";
import { getPluginDefinition } from "@/lib/plugins/registry";
import { sidebarPluginIdSchema } from "@/shared/validation/schemas";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  const parsed = sidebarPluginIdSchema.safeParse((await params).id);
  const plugin = parsed.success ? getPluginDefinition(parsed.data) : null;
  if (!plugin) return NextResponse.json({ error: "Unknown dynamic plugin" }, { status: 404 });

  const installed = await readInstalledPlugin(plugin);
  if (!installed)
    return NextResponse.json({ error: "Extension is not installed" }, { status: 404 });

  const body = await readFile(pluginBundlePath(plugin));
  const checksum = createHash("sha256").update(body).digest("hex");
  if (checksum !== installed.checksum) {
    await clearInstalledPlugin(plugin);
    return NextResponse.json({ error: "Cached extension checksum mismatch" }, { status: 409 });
  }

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
