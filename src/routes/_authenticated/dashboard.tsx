import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Image, MessageCircle, Sparkles, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const stats = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;

      const [posts, gens, convs] = await Promise.all([
        supabase.from("posts").select("*", { count: "exact", head: true }),
        supabase.from("generations").select("*", { count: "exact", head: true }).eq("user_id", u.user.id),
        supabase.from("ai_conversations").select("*", { count: "exact", head: true }).eq("user_id", u.user.id),
      ]);

      const { data: recent } = await supabase
        .from("posts")
        .select("id,image_url,caption,created_at")
        .order("created_at", { ascending: false })
        .limit(6);

      return {
        totalPosts: posts.count ?? 0,
        myGenerations: gens.count ?? 0,
        myChats: convs.count ?? 0,
        recentPosts: recent ?? [],
      };
    },
  });

  const cards = [
    { label: "Community posts", value: stats.data?.totalPosts ?? "—", icon: Users, to: "/feed" as const },
    { label: "Your renders", value: stats.data?.myGenerations ?? "—", icon: Sparkles, to: "/studio" as const },
    { label: "AI threads", value: stats.data?.myChats ?? "—", icon: MessageCircle, to: "/chat" as const },
    { label: "Quick create", value: "→", icon: Image, to: "/studio" as const },
  ];

  return (
    <AppShell>
      <div className="p-4 lg:p-8">
        <div className="mono-label">/DASHBOARD</div>
        <h1 className="font-display text-5xl uppercase mt-1">Welcome back</h1>
        <p className="mt-2 text-muted-foreground max-w-xl">
          Your workshop hub. Browse the grid, generate images, chat with makers, or open channels.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(({ label, value, icon: Icon, to }) => (
            <Link key={label} to={to} className="paper-card p-6 hover:border-primary transition-colors block">
              <Icon className="size-5 text-primary mb-3" />
              <div className="font-display text-4xl">{value}</div>
              <div className="mono-label mt-1">{label}</div>
            </Link>
          ))}
        </div>

        <div className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-2xl uppercase">Latest from the grid</h2>
            <Link to="/feed" className="mono-label text-primary hover:underline">
              View all →
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(stats.data?.recentPosts ?? []).map((p) => (
              <Link key={p.id} to="/post/$postId" params={{ postId: p.id }} className="paper-card overflow-hidden group block">
                <div className="aspect-[4/3] overflow-hidden grain">
                  <img src={p.image_url} alt="" className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </div>
                {p.caption && <p className="p-3 text-sm line-clamp-2">{p.caption}</p>}
              </Link>
            ))}
            {(stats.data?.recentPosts ?? []).length === 0 && (
              <p className="mono-label col-span-full text-muted-foreground">No posts yet. Be the first in Studio.</p>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
