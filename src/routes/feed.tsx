import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FeedGrid } from "@/components/FeedGrid";
import { PostComposer } from "@/components/PostComposer";
import { AppShell } from "@/components/AppShell";
import { PublicShell } from "@/components/PublicShell";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/feed")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Kinetik — Public Grid" },
      { name: "description", content: "Community grid of AI-generated and uploaded images." },
    ],
  }),
  component: FeedPage,
});

function FeedPage() {
  const qc = useQueryClient();
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setAuthed(!!session));
    return () => sub.subscription.unsubscribe();
  }, []);

  const content = (
    <div className="p-4 lg:p-8 space-y-8 animate-enter">
      <div>
        <div className="mono-label">/PUBLIC_GRID</div>
        <h1 className="font-display text-5xl uppercase mt-1">Collective Output</h1>
        <p className="mt-2 text-muted-foreground max-w-xl">
          Browse community posts. {authed ? "Upload images or share renders from Studio." : "Sign in to post and interact."}
        </p>
      </div>
      {authed && <PostComposer onPosted={() => qc.invalidateQueries({ queryKey: ["feed"] })} />}
      <FeedGrid showHeader={false} />
    </div>
  );

  if (authed === null) {
    return <div className="min-h-screen grid place-items-center mono-label">Loading…</div>;
  }

  if (authed) return <AppShell>{content}</AppShell>;
  return <PublicShell>{content}</PublicShell>;
}
