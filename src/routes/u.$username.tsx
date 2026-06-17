import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PublicShell } from "@/components/PublicShell";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/u/$username")({
  ssr: false,
  component: UserProfilePage,
});

type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  gender: string | null;
};

function UserProfilePage() {
  const { username } = Route.useParams();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<{ id: string; image_url: string; caption: string | null; created_at: string }[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
  }, []);

  useEffect(() => {
    (async () => {
      const { data: p } = await supabase
        .from("profiles")
        .select("id,username,display_name,avatar_url,bio,gender")
        .eq("username", username)
        .single();
      setProfile((p ?? null) as Profile | null);
      if (!p) return;
      const { data: ps } = await supabase
        .from("posts")
        .select("id,image_url,caption,created_at")
        .eq("user_id", p.id)
        .order("created_at", { ascending: false })
        .limit(24);
      setPosts((ps ?? []) as typeof posts);
    })();
  }, [username]);

  const body = (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      <Link to="/feed" className="mono-label hover:text-primary">
        ← Back to feed
      </Link>

      {!profile ? (
        <div className="paper-card p-8 mt-6">
          <div className="mono-label">PROFILE</div>
          <h1 className="font-display text-4xl uppercase mt-2">User not found</h1>
        </div>
      ) : (
        <>
          <div className="paper-card p-6 mt-6">
            <div className="flex items-start gap-4">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="size-20 rounded-full border border-line object-cover" />
              ) : (
                <div className="size-20 rounded-full bg-paper-2 border border-line grid place-items-center font-mono text-2xl">
                  {profile.username[0].toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="mono-label">@{profile.username}</div>
                <h1 className="font-display text-4xl uppercase mt-1 truncate">
                  {profile.display_name ?? profile.username}
                </h1>
                {profile.bio && <p className="mt-3 text-sm text-muted-foreground whitespace-pre-wrap">{profile.bio}</p>}
                {profile.gender && <div className="mt-3 mono-label">Gender: {profile.gender}</div>}
              </div>
            </div>
          </div>

          <div className="mt-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-2xl uppercase">Posts</h2>
              <div className="mono-label">{posts.length}</div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((p) => (
                <Link key={p.id} to="/post/$postId" params={{ postId: p.id }} className="paper-card overflow-hidden group block">
                  <div className="aspect-[4/3] overflow-hidden grain bg-paper-2">
                    <img src={p.image_url} alt="" className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  </div>
                  {p.caption && <p className="p-3 text-sm line-clamp-2">{p.caption}</p>}
                </Link>
              ))}
              {posts.length === 0 && <p className="mono-label col-span-full text-muted-foreground">No posts yet.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );

  if (authed === null) return <div className="min-h-screen grid place-items-center mono-label">Loading…</div>;
  if (authed) return <AppShell>{body}</AppShell>;
  return <PublicShell>{body}</PublicShell>;
}

