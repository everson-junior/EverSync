import { z } from "zod";
import { HIDEABLE_SIDEBAR_ITEM_IDS } from "@/shared/constants/sidebarVisibility";

export const sidebarPluginIdSchema = z.enum(HIDEABLE_SIDEBAR_ITEM_IDS);

export const installSidebarPluginSchema = z
  .object({
    id: sidebarPluginIdSchema,
  })
  .strict();
