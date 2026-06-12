import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { chatWithOpenAI, downloadImageAsBuffer, generateImageWithOpenAI } from "@/lib/openai.server";
import { z } from "zod";

const ImgInput = z.object({ prompt: z.string().min(3).max(2000) });

export const generateImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ImgInput.parse(d))
  .handler(async ({ data, context }) => {
    const { url } = await generateImageWithOpenAI(data.prompt);
    const { buf, mime } = await downloadImageAsBuffer(url);
    const ext = mime.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
    const path = `${context.userId}/${crypto.randomUUID()}.${ext}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const up = await supabaseAdmin.storage.from("generated-images").upload(path, buf, { contentType: mime });
    if (up.error) throw new Error(up.error.message);

    const signed = await supabaseAdmin.storage.from("generated-images").createSignedUrl(path, 60 * 60 * 24 * 365);
    if (signed.error || !signed.data) throw new Error("Could not sign URL");

    const { data: gen, error } = await context.supabase
      .from("generations")
      .insert({ user_id: context.userId, prompt: data.prompt, image_url: signed.data.signedUrl })
      .select()
      .single();
    if (error) throw error;
    return gen;
  });

const ChatInput = z.object({
  conversationId: z.string().uuid().nullable(),
  message: z.string().min(1).max(8000),
});

export const sendChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ChatInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    let convId = data.conversationId;
    if (!convId) {
      const { data: c, error } = await supabase
        .from("ai_conversations")
        .insert({ user_id: userId, title: data.message.slice(0, 60) })
        .select()
        .single();
      if (error) throw error;
      convId = c.id;
    }

    const { data: hist } = await supabase
      .from("ai_messages")
      .select("role,content")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });

    await supabase.from("ai_messages").insert({ conversation_id: convId, role: "user", content: data.message });

    const messages = [
      {
        role: "system" as const,
        content:
          "You are Kinetik, an expert AI creative assistant for image makers. Help with prompt engineering, composition, lighting, style references, and critique. Be concise, opinionated, and practical.",
      },
      ...(hist ?? []).map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      })),
      { role: "user" as const, content: data.message },
    ];

    const reply = await chatWithOpenAI(messages);
    await supabase.from("ai_messages").insert({ conversation_id: convId, role: "assistant", content: reply });
    await supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);

    return { conversationId: convId, reply };
  });
