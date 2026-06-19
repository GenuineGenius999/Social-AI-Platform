import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const HeartbeatInput = z.object({
  machineId: z.string().min(8).max(64),
  osName: z.string().max(64),
  osVersion: z.string().max(64).optional(),
  userAgent: z.string().max(512).optional(),
});

function resolveClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "";
  return request.headers.get("x-real-ip") ?? request.headers.get("cf-connecting-ip") ?? "";
}

async function resolveCountry(ip: string): Promise<string | null> {
  if (!ip || ip === "127.0.0.1" || ip.startsWith("192.168.") || ip.startsWith("10.")) return "Local";
  try {
    const res = await fetch(`https://ipapi.co/${ip}/country_name/`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    return text && !text.includes("Undefined") ? text : null;
  } catch {
    return null;
  }
}

export const sendHeartbeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => HeartbeatInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const request = getRequest();
    const ipAddress = request ? resolveClientIp(request) : "";
    const countryName = ipAddress ? await resolveCountry(ipAddress) : null;

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
          ip_address: ipAddress || null,
          country_name: countryName,
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
      ip_address: ipAddress || null,
      country_name: countryName,
      last_seen_at: new Date().toISOString(),
    });

    return { machineNumber };
  });
