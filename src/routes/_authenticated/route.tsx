import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { usePresence } from "@/hooks/use-presence";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_banned,status")
      .eq("id", data.user.id)
      .single();

    const p = profile as { is_banned?: boolean; status?: string } | null;
    if (p?.is_banned || p?.status === "suspended") {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }

    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  usePresence();
  return <Outlet />;
}
