import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { FeedGrid } from "@/components/FeedGrid";
import { PostComposer } from "@/components/PostComposer";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Image, MessageCircle, Sparkles, Users, Zap } from "lucide-react";

const HERO_SAMPLES = [
  {
    url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80",
    title: "Neon Dreams",
    author: "Community",
  },
  {
    url: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=800&q=80",
    title: "Digital Canvas",
    author: "Studio",
  },
  {
    url: "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=800&q=80",
    title: "Abstract Flow",
    author: "Makers",
  },
];

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const qc = useQueryClient();

  const stats = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;

      const [{ count: totalPosts }, { count: myGenerations }, { count: myChats }, { data: profile }] = await Promise.all([
        supabase.from("posts").select("*", { count: "exact", head: true }),
        supabase.from("generations").select("*", { count: "exact", head: true }).eq("user_id", u.user.id),
        supabase.from("ai_conversations").select("*", { count: "exact", head: true }).eq("user_id", u.user.id),
        supabase.from("profiles").select("username,display_name,avatar_url").eq("id", u.user.id).single(),
      ]);

      return {
        totalPosts: totalPosts ?? 0,
        myGenerations: myGenerations ?? 0,
        myChats: myChats ?? 0,
        profile: profile as { username: string; display_name: string | null; avatar_url: string | null } | null,
      };
    },
  });

  const cards = [
    { label: "Community posts", value: stats.data?.totalPosts ?? "—", icon: Users, to: "/feed" as const },
    { label: "Your renders", value: stats.data?.myGenerations ?? "—", icon: Sparkles, to: "/studio" as const },
    { label: "AI threads", value: stats.data?.myChats ?? "—", icon: MessageCircle, to: "/chat" as const },
    { label: "Create now", value: "→", icon: Image, to: "/studio" as const },
  ];

  const name = stats.data?.profile?.display_name ?? stats.data?.profile?.username ?? "maker";

  return (
    <AppShell>
      <div className="p-4 lg:p-8 space-y-10">
        {/* Hero */}
        <section className="relative overflow-hidden paper-card">
          <div className="grid lg:grid-cols-2 gap-0">
            <div className="p-6 lg:p-10 flex flex-col justify-center">
              <div className="mono-label">/HOME</div>
              <h1 className="font-display text-4xl lg:text-6xl uppercase mt-2 leading-none">
                Welcome, {name}
              </h1>
              <p className="mt-4 text-muted-foreground max-w-md leading-relaxed">
                Kinetik is your AI studio and social grid. Generate images, share stories, chat with makers, and explore the collective output — all in one place.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to="/studio" className="rust-button px-6 py-2.5 text-sm inline-flex items-center gap-2">
                  <Sparkles className="size-4" /> Open Studio
                </Link>
                <Link to="/feed" className="ink-button px-6 py-2.5 text-sm inline-flex items-center gap-2">
                  Browse Grid <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1 p-1 bg-paper-2 min-h-[220px] lg:min-h-0">
              {HERO_SAMPLES.map((s) => (
                <div key={s.url} className="relative overflow-hidden group">
                  <img src={s.url} alt={s.title} className="h-full w-full object-cover min-h-[120px] group-hover:scale-105 transition-transform duration-700" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                    <span className="text-[10px] text-paper font-mono">{s.title}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Stats */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Zap className="size-4 text-primary" />
            <span className="mono-label">PLATFORM_SNAPSHOT</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map(({ label, value, icon: Icon, to }) => (
              <Link key={label} to={to} className="paper-card p-6 hover:border-primary transition-colors block">
                <Icon className="size-5 text-primary mb-3" />
                <div className="font-display text-4xl">{value}</div>
                <div className="mono-label mt-1">{label}</div>
              </Link>
            ))}
          </div>
        </section>

        {/* Post composer */}
        <section>
          <div className="mono-label mb-3">SHARE_YOUR_STORY</div>
          <PostComposer onPosted={() => qc.invalidateQueries({ queryKey: ["feed"] })} />
        </section>

        {/* Feed preview */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-2xl uppercase">Latest from the grid</h2>
            <Link to="/feed" className="mono-label text-primary hover:underline">
              View all →
            </Link>
          </div>
          <FeedGrid showHeader={false} limit={6} />
        </section>
      </div>
    </AppShell>
  );
}
