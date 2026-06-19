import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePresence } from "@/hooks/use-presence";
import { NotificationProvider } from "@/components/notifications/NotificationProvider";
import { ActiveChatProvider } from "@/hooks/use-active-chat";

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
  const [me, setMe] = useState<string | null>(null);
  usePresence();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setMe(session?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <ActiveChatProvider>
      <NotificationProvider me={me}>
        <Outlet />
      </NotificationProvider>
    </ActiveChatProvider>
  );
}
