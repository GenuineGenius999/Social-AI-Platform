import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FeedGrid } from "@/components/FeedGrid";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
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
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setAuthed(!!session));
    return () => sub.subscription.unsubscribe();
  }, []);

  const feed = (
    <div className="p-4 lg:p-8 animate-enter">
      <FeedGrid />
    </div>
  );

  if (authed === null) {
    return <div className="min-h-screen grid place-items-center mono-label">Loading grid…</div>;
  }

  if (authed) {
    return <AppShell>{feed}</AppShell>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="flex items-center justify-between border-b-2 border-foreground px-6 py-4 lg:px-10">
        <div className="flex items-center gap-3">
          <img src={logo} alt="Kinetik" className="size-10 rounded-sm" width={40} height={40} />
          <span className="font-display text-2xl uppercase tracking-tighter">Kinetik_</span>
        </div>
        <div className="flex items-center gap-4 mono-label">
          <Link to="/auth" className="hover:text-primary transition-colors">
            Sign in
          </Link>
          <Link to="/auth" className="ink-button rounded-sm px-4 py-2 text-xs normal-case tracking-normal">
            Join collective
          </Link>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl">{feed}</main>
      <footer className="border-t border-line px-6 py-8 mono-label lg:px-10">
        © Kinetik Collective · GPT Image · Supabase
      </footer>
    </div>
  );
}
