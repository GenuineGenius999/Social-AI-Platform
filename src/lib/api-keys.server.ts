import process from "node:process";

export async function resolveOpenAIKey(userId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: userKey } = await supabaseAdmin
    .from("user_api_keys")
    .select("openai_api_key")
    .eq("user_id", userId)
    .maybeSingle();

  if (userKey?.openai_api_key?.trim()) {
    return userKey.openai_api_key.trim();
  }

  const { data: setting } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "openai_api_key")
    .maybeSingle();

  if (setting?.value?.trim()) {
    return setting.value.trim();
  }

  const envKey = process.env.OPENAI_API_KEY;
  if (!envKey) {
    throw new Error("No OpenAI API key configured. Add one in Admin settings or your account settings.");
  }
  return envKey;
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 7)}…${key.slice(-4)}`;
}
