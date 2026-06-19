import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { supabase } from "@/integrations/supabase/client";
import { OnlineDot } from "@/hooks/use-online-status";
import { Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/users")({
  component: UsersPage,
});

function UsersPage() {
  const [search, setSearch] = useState("");
  const [me, setMe] = useState<string | null>(null);
  const [myGroups, setMyGroups] = useState<string[]>([]);
  const [view, setView] = useState<"all" | "group">("all");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!me) return;
    supabase.from("chat_group_members").select("group_id").eq("user_id", me).then(({ data }) => {
      setMyGroups((data ?? []).map((g) => g.group_id));
    });
  }, [me]);

  const users = useQuery({
    queryKey: ["users-directory", search, view, myGroups],
    queryFn: async () => {
      if (view === "group" && myGroups.length > 0) {
        const { data: members } = await supabase
          .from("chat_group_members")
          .select("user_id, profiles(id,username,display_name,avatar_url,bio)")
          .in("group_id", myGroups);
        const map = new Map<string, { id: string; username: string; display_name: string | null; avatar_url: string | null; bio?: string | null }>();
        for (const m of members ?? []) {
          const p = m.profiles as { id: string; username: string; display_name: string | null; avatar_url: string | null; bio?: string | null } | null;
          if (p && p.id !== me) map.set(p.id, p);
        }
        let list = [...map.values()];
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          list = list.filter((p) => p.username.toLowerCase().includes(q) || p.id.includes(q));
        }
        return list.sort((a, b) => a.username.localeCompare(b.username));
      }

      const q = search.trim();
      let query = supabase.from("profiles").select("id,username,display_name,avatar_url,bio").order("username").limit(48);
      if (q) {
        const isUuid = /^[0-9a-f-]{36}$/i.test(q);
        query = isUuid
          ? supabase.from("profiles").select("id,username,display_name,avatar_url,bio").eq("id", q).limit(1)
          : supabase.from("profiles").select("id,username,display_name,avatar_url,bio").ilike("username", `%${q}%`).order("username").limit(48);
      }
      const { data } = await query;
      return ((data ?? []) as { id: string; username: string; display_name: string | null; avatar_url: string | null; bio?: string | null }[]).filter((p) => p.id !== me);
    },
    enabled: !!me,
  });

  return (
    <AppShell>
      <div className="p-4 lg:p-8">
        <div className="mono-label">/USERS</div>
        <h1 className="font-display text-5xl uppercase mt-1">Makers Directory</h1>
        <p className="mt-2 text-muted-foreground max-w-xl">Browse all platform users or see makers in your groups.</p>

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by @username or user ID"
              className="w-full border border-line bg-background pl-10 pr-4 py-2.5 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setView("all")} className={`px-4 py-2 text-xs border ${view === "all" ? "border-primary bg-primary/10" : "border-line"}`}>All users</button>
            <button type="button" onClick={() => setView("group")} className={`px-4 py-2 text-xs border ${view === "group" ? "border-primary bg-primary/10" : "border-line"}`}>My groups</button>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(users.data ?? []).map((u) => (
            <Link key={u.id} to="/u/$username" params={{ username: u.username }} className="paper-card p-4 flex items-start gap-3 hover:border-primary transition-colors">
              <span className="relative">
                <UserAvatar avatarUrl={u.avatar_url} username={u.username} size="lg" />
                <OnlineDot userId={u.id} className="absolute -bottom-0.5 -right-0.5 size-2.5!" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-display text-lg uppercase truncate">{u.display_name ?? u.username}</div>
                <div className="mono-label">@{u.username}</div>
                {u.bio && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{u.bio}</p>}
              </div>
            </Link>
          ))}
        </div>
        {(users.data ?? []).length === 0 && !users.isLoading && (
          <div className="mono-label text-center py-12 text-muted-foreground">No users found.</div>
        )}
      </div>
    </AppShell>
  );
}
