import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const HeartbeatInput = z.object({
  machineId: z.string().min(8).max(64),
  osName: z.string().max(64),
  osVersion: z.string().max(64).optional(),
  userAgent: z.string().max(512).optional(),
});

export const sendHeartbeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => HeartbeatInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("user_sessions")
      .select("id,machine_number")
      .eq("user_id", context.userId)
      .eq("machine_id", data.machineId)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin
        .from("user_sessions")
        .update({
          os_name: data.osName,
          os_version: data.osVersion ?? "",
          user_agent: data.userAgent ?? "",
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      return { machineNumber: existing.machine_number };
    }

    const { count } = await supabaseAdmin
      .from("user_sessions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", context.userId);

    const machineNumber = (count ?? 0) + 1;

    await supabaseAdmin.from("user_sessions").insert({
      user_id: context.userId,
      machine_id: data.machineId,
      machine_number: machineNumber,
      os_name: data.osName,
      os_version: data.osVersion ?? "",
      user_agent: data.userAgent ?? "",
      last_seen_at: new Date().toISOString(),
    });

    return { machineNumber };
  });
