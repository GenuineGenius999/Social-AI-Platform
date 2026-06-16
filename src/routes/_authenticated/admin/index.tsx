import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { getAdminStats } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { Users, Image, FileImage, Activity, Settings } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const qc = useQueryClient();
  const statsFn = useServerFn(getAdminStats);
  const stats = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => statsFn(),
  });

  useEffect(() => {
    const ch = supabase
      .channel("admin-stats-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_sessions" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-stats"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-stats"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "generations" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-stats"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-stats"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const cards = [
    { label: "Users", value: stats.data?.users ?? "—", icon: Users },
    { label: "Online now", value: stats.data?.online ?? "—", icon: Activity },
    { label: "Posts", value: stats.data?.posts ?? "—", icon: Image },
    { label: "Generations", value: stats.data?.generations ?? "—", icon: FileImage },
  ];

  return (
    <AppShell>
      <div className="p-4 lg:p-8">
        <div className="mono-label">/ADMIN</div>
        <h1 className="font-display text-5xl uppercase mt-1">Control Panel</h1>
        <p className="mt-2 text-muted-foreground">Manage users, API keys, and platform status.</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(({ label, value, icon: Icon }) => (
            <div key={label} className="paper-card p-6">
              <Icon className="size-5 text-primary mb-3" />
              <div className="font-display text-4xl">{value}</div>
              <div className="mono-label mt-1">{label}</div>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link to="/admin/users" className="paper-card p-6 hover:border-primary transition-colors block">
            <Users className="size-6 text-primary mb-2" />
            <h2 className="font-display text-2xl uppercase">Users</h2>
            <p className="text-sm text-muted-foreground mt-1">Online status, OS, machine numbers, bans.</p>
          </Link>
          <Link to="/admin/settings" className="paper-card p-6 hover:border-primary transition-colors block">
            <Settings className="size-6 text-primary mb-2" />
            <h2 className="font-display text-2xl uppercase">API Keys</h2>
            <p className="text-sm text-muted-foreground mt-1">Manage platform OpenAI API key.</p>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
