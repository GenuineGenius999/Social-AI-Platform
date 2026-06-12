import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SignUpInput = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  username: z.string().min(3).max(30),
});

/** Creates the user server-side (no confirmation email) to avoid Supabase SMTP rate limits. */
export const signUpWithEmail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SignUpInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const isAdmin =
      data.email.toLowerCase() === "admin@genai.com" ||
      data.username.toLowerCase() === "genaisocial";

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { username: data.username, is_admin: isAdmin },
    });

    if (createError) {
      const msg = createError.message.toLowerCase();
      if (msg.includes("already") && (msg.includes("registered") || msg.includes("exists"))) {
        throw new Error("An account with this email already exists. Try signing in.");
      }
      throw createError;
    }

    if (isAdmin && created.user) {
      await supabaseAdmin.from("profiles").update({ is_admin: true } as never).eq("id", created.user.id);
    }

    const { data: sessionData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (signInError || !sessionData.session) {
      throw new Error(signInError?.message ?? "Account created but sign-in failed. Try signing in.");
    }

    return {
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
    };
  });
