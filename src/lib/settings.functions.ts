import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { maskApiKey } from "@/lib/api-keys.server";
import { z } from "zod";

export const getUserApiKeyStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("user_api_keys")
      .select("openai_api_key,updated_at")
      .eq("user_id", context.userId)
      .maybeSingle();

    return {
      hasKey: !!data?.openai_api_key,
      masked: data?.openai_api_key ? maskApiKey(data.openai_api_key) : null,
      updatedAt: data?.updated_at ?? null,
    };
  });

const KeyInput = z.object({
  openaiApiKey: z.string().min(20).max(200).optional().nullable(),
});

export const saveUserApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => KeyInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!data.openaiApiKey) {
      await supabaseAdmin.from("user_api_keys").delete().eq("user_id", context.userId);
      return { ok: true, removed: true };
    }

    const { error } = await supabaseAdmin.from("user_api_keys").upsert({
      user_id: context.userId,
      openai_api_key: data.openaiApiKey.trim(),
      updated_at: new Date().toISOString(),
    });

    if (error) throw error;
    return { ok: true, removed: false };
  });
