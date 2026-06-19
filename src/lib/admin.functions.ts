import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";
import { maskApiKey } from "@/lib/api-keys.server";
import { z } from "zod";

const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;

export const getAdminStats = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [users, posts, generations, sessions] = await Promise.all([
      supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("posts").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("generations").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("user_sessions").select("*", { count: "exact", head: true }),
    ]);

    const since = new Date(Date.now() - ONLINE_THRESHOLD_MS).toISOString();
    const { count: online } = await supabaseAdmin
      .from("user_sessions")
      .select("*", { count: "exact", head: true })
      .gte("last_seen_at", since);

    return {
      users: users.count ?? 0,
      posts: posts.count ?? 0,
      generations: generations.count ?? 0,
      sessions: sessions.count ?? 0,
      online: online ?? 0,
    };
  });

export const getAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - ONLINE_THRESHOLD_MS).toISOString();

    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id,username,display_name,is_admin,is_banned,status,created_at")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const emailById = new Map((authUsers?.users ?? []).map((u) => [u.id, u.email ?? ""]));

    const { data: sessions } = await supabaseAdmin
      .from("user_sessions")
      .select("user_id,machine_id,machine_number,os_name,os_version,last_seen_at,ip_address,country_name")
      .order("last_seen_at", { ascending: false });

    const sessionsByUser = new Map<string, typeof sessions>();
    for (const s of sessions ?? []) {
      const list = sessionsByUser.get(s.user_id) ?? [];
      list.push(s);
      sessionsByUser.set(s.user_id, list);
    }

    return (profiles ?? []).map((p) => {
      const userSessions = sessionsByUser.get(p.id) ?? [];
      const latest = userSessions[0];
      const isOnline = latest ? new Date(latest.last_seen_at).getTime() > Date.now() - ONLINE_THRESHOLD_MS : false;
      return {
        ...p,
        email: emailById.get(p.id) ?? "",
        isOnline,
        machines: userSessions.map((s) => ({
          machineId: s.machine_id,
          machineNumber: s.machine_number,
          osName: s.os_name ?? "Unknown",
          osVersion: s.os_version ?? "",
          ipAddress: (s as { ip_address?: string | null }).ip_address ?? "",
          countryName: (s as { country_name?: string | null }).country_name ?? "",
          lastSeenAt: s.last_seen_at,
          isOnline: new Date(s.last_seen_at).getTime() > Date.now() - ONLINE_THRESHOLD_MS,
        })),
      };
    });
  });

const UserStatusInput = z.object({
  userId: z.string().uuid(),
  isBanned: z.boolean().optional(),
  status: z.enum(["active", "suspended"]).optional(),
  isAdmin: z.boolean().optional(),
});

export const updateUserStatus = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => UserStatusInput.parse(d))
  .handler(async ({ data, context }) => {
    if (data.userId === context.userId && data.isAdmin === false) {
      throw new Error("You cannot remove your own admin access.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = {};
    if (data.isBanned !== undefined) patch.is_banned = data.isBanned;
    if (data.status !== undefined) patch.status = data.status;
    if (data.isAdmin !== undefined) patch.is_admin = data.isAdmin;

    const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", data.userId);
    if (error) throw error;
    return { ok: true };
  });

export const getOpenAIKeySetting = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("value,updated_at")
      .eq("key", "openai_api_key")
      .maybeSingle();

    return {
      hasKey: !!data?.value,
      masked: data?.value ? maskApiKey(data.value) : null,
      updatedAt: data?.updated_at ?? null,
      usesEnvFallback: !data?.value,
    };
  });

const KeySettingInput = z.object({
  openaiApiKey: z.string().min(20).max(200).optional().nullable(),
});

export const saveOpenAIKeySetting = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => KeySettingInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!data.openaiApiKey) {
      await supabaseAdmin.from("app_settings").delete().eq("key", "openai_api_key");
      return { ok: true, removed: true };
    }

    const { error } = await supabaseAdmin.from("app_settings").upsert({
      key: "openai_api_key",
      value: data.openaiApiKey.trim(),
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    });

    if (error) throw error;
    return { ok: true, removed: false };
  });
