import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "./auth-middleware";

export const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { data: profile, error } = await context.supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", context.userId)
      .single();

    if (error || !profile?.is_admin) {
      throw new Error("Forbidden: admin access required");
    }

    return next({ context: { ...context, isAdmin: true as const } });
  });
