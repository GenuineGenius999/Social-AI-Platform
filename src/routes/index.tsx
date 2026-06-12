import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FeedGrid } from "@/components/FeedGrid";
import { PostComposer } from "@/components/PostComposer";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import logo from "@/assets/logo.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kinetik — Public Grid" },
      { name: "description", content: "Community grid of AI-generated and uploaded images." },
    ],
  }),
  component: HomeFeed,
});

function HomeFeed() {
  const qc = useQueryClient();
  const [user, setUser] = useState<{ username?: string; isAdmin?: boolean } | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        setUser(null);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("username,is_admin")
        .eq("id", data.user.id)
        .single();
      setUser({ username: profile?.username, isAdmin: (profile as { is_admin?: boolean })?.is_admin });
    });
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="flex items-center justify-between border-b-2 border-foreground px-6 py-4 lg:px-10">
        <div className="flex items-center gap-3">
          <img src={logo} alt="Kinetik" className="size-10 rounded-sm" width={40} height={40} />
          <span className="font-display text-2xl uppercase tracking-tighter">Kinetik_</span>
        </div>
        <div className="flex items-center gap-4 mono-label">
          {user ? (
            <>
              <span className="hidden sm:inline text-muted-foreground">@{user.username}</span>
              <Link to="/studio" className="hover:text-primary transition-colors">
                Studio
              </Link>
              <Link to="/settings" className="hover:text-primary transition-colors">
                Settings
              </Link>
              {user.isAdmin && (
                <Link to="/admin" className="text-primary hover:underline">
                  Admin
                </Link>
              )}
            </>
          ) : (
            <Link to="/auth" className="ink-button rounded-sm px-4 py-2 text-xs normal-case tracking-normal">
              Sign in
            </Link>
          )}
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-6 py-10 lg:px-10">
        {user && (
          <div className="mb-8">
            <PostComposer onPosted={() => qc.invalidateQueries({ queryKey: ["feed"] })} />
          </div>
        )}
        <FeedGrid />
      </main>

      <footer className="border-t border-line px-6 py-8 mono-label lg:px-10">
        © Kinetik Collective · OpenAI DALL·E 3 · Supabase
      </footer>
    </div>
  );
}
