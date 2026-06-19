import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ChatInput } from "@/components/chat/ChatInput";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { UserAvatar } from "@/components/UserAvatar";
import { useBlockedUsers, useHiddenMessages, useReactions } from "@/hooks/use-chat-social";
import { OnlineDot, useIsOnline } from "@/hooks/use-online-status";
import { markThreadRead, useUnreadCounts } from "@/hooks/use-unread-counts";
import { useSetActiveChat } from "@/hooks/use-active-chat";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/lib/chat.types";
import { friendlyDbError } from "@/lib/db-errors";
import { toast } from "sonner";
import { Hash, MessageCircle, Plus, Search, Settings, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/messages")({ component: Messages });

type Tab = "global" | "groups" | "dm";

type GroupInfo = {
  id: string;
  name: string;
  description: string | null;
  visibility: "public" | "private";
  cover_url: string | null;
  avatar_url: string | null;
  bio: string | null;
};

function Messages() {
  const [tab, setTab] = useState<Tab>("global");
  const [me, setMe] = useState<string | null>(null);
  const [myProfile, setMyProfile] = useState<Profile | null>(null);
  const [profileMap, setProfileMap] = useState<Record<string, Profile>>({});
  const [dmPartners, setDmPartners] = useState<Profile[]>([]);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [publicGroups, setPublicGroups] = useState<GroupInfo[]>([]);
  const [activeDm, setActiveDm] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [dmSearch, setDmSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const { counts, refresh: refreshUnread } = useUnreadCounts(me);
  const setActiveChat = useSetActiveChat();

  useEffect(() => {
    setActiveChat({ tab, dmUserId: activeDm, groupId: activeGroup });
  }, [tab, activeDm, activeGroup, setActiveChat]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      setMe(uid);
      if (uid) {
        const { data: prof } = await supabase.from("profiles").select("id,username,display_name,avatar_url").eq("id", uid).single();
        if (prof) setMyProfile(prof as Profile);
      }
    });
  }, []);

  useEffect(() => {
    if (!me) return;
    supabase
      .from("direct_messages")
      .select("sender_id,recipient_id")
      .or(`sender_id.eq.${me},recipient_id.eq.${me}`)
      .order("created_at", { ascending: false })
      .limit(200)
      .then(async ({ data }) => {
        const ids = new Set<string>();
        for (const m of data ?? []) {
          const other = m.sender_id === me ? m.recipient_id : m.sender_id;
          ids.add(other);
        }
        if (ids.size === 0) {
          setDmPartners([]);
          return;
        }
        const { data: profs } = await supabase
          .from("profiles")
          .select("id,username,display_name,avatar_url")
          .in("id", [...ids]);
        setDmPartners((profs ?? []) as Profile[]);
      });
  }, [me, activeDm]);

  useEffect(() => {
    if (!me) return;
    supabase
      .from("chat_group_members")
      .select("group_id, chat_groups(id,name,description,visibility,cover_url,avatar_url,bio)")
      .eq("user_id", me)
      .then(({ data }) => {
        const list = (data ?? [])
          .map((r) => r.chat_groups as GroupInfo | null)
          .filter(Boolean) as GroupInfo[];
        setGroups(list);
      });
    supabase
      .from("chat_groups")
      .select("id,name,description,visibility,cover_url,avatar_url,bio")
      .eq("visibility", "public")
      .limit(20)
      .then(({ data }) => setPublicGroups((data ?? []) as GroupInfo[]));
  }, [me, showCreateGroup, showGroupSettings]);

  useEffect(() => {
    const ids = new Set<string>();
    dmPartners.forEach((p) => ids.add(p.id));
    if (myProfile) ids.add(myProfile.id);
    if (activeDm) ids.add(activeDm);
    searchResults.forEach((p) => ids.add(p.id));
    if (ids.size === 0) return;
    supabase
      .from("profiles")
      .select("id,username,display_name,avatar_url")
      .in("id", [...ids])
      .then(({ data }) => {
        setProfileMap(Object.fromEntries((data ?? []).map((p) => [p.id, p as Profile])));
      });
  }, [dmPartners, myProfile, activeDm, searchResults]);

  useEffect(() => {
    if (!dmSearch.trim()) {
      setSearchResults([]);
      return;
    }
    const term = dmSearch.trim();
    const isUuid = /^[0-9a-f-]{36}$/i.test(term);
    const query = isUuid
      ? supabase.from("profiles").select("id,username,display_name,avatar_url").eq("id", term).limit(5)
      : supabase.from("profiles").select("id,username,display_name,avatar_url").ilike("username", `%${term}%`).limit(8);
    query.then(({ data }) => setSearchResults(((data ?? []) as Profile[]).filter((p) => p.id !== me)));
  }, [dmSearch, me]);

  const tabs: { id: Tab; label: string; icon: typeof Hash; badge?: number }[] = [
    { id: "global", label: "Global", icon: Hash, badge: counts.global },
    { id: "groups", label: "Groups", icon: Users, badge: Object.values(counts.groups).reduce((a, b) => a + b, 0) },
    { id: "dm", label: "Private", icon: MessageCircle, badge: Object.values(counts.dm).reduce((a, b) => a + b, 0) },
  ];

  const allProfiles = useMemo(() => Object.values(profileMap), [profileMap]);

  return (
    <AppShell>
      <div className="grid lg:grid-cols-[280px_1fr] min-h-[calc(100vh-3.5rem)] lg:min-h-screen">
        <aside className="border-b lg:border-b-0 lg:border-r-2 border-foreground bg-paper-2 p-4">
          <div className="mono-label mb-3">/CHANNELS</div>
          <div className="flex flex-col gap-1 mb-6">
            {tabs.map(({ id, label, icon: Icon, badge }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex items-center gap-2 border-l-2 px-3 py-2.5 text-sm transition-colors ${
                  tab === id ? "border-primary bg-card text-primary" : "border-transparent hover:border-foreground/40"
                }`}
              >
                <Icon className="size-4" />
                <span className="flex-1 text-left">{label}</span>
                {(badge ?? 0) > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-mono grid place-items-center">
                    {badge! > 99 ? "99+" : badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {tab === "dm" && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <input
                  value={dmSearch}
                  onChange={(e) => setDmSearch(e.target.value)}
                  placeholder="Search by @username or ID"
                  className="w-full border border-line bg-background pl-8 pr-3 py-2 text-xs focus:border-primary focus:outline-none"
                />
              </div>
              {searchResults.length > 0 && (
                <div className="space-y-1 border border-line bg-card p-1">
                  <div className="mono-label px-2 py-1">SEARCH</div>
                  {searchResults.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => { setActiveDm(u.id); setDmSearch(""); setSearchResults([]); }}
                      className="flex w-full items-center gap-2 text-left px-2 py-2 text-xs hover:bg-paper-2"
                    >
                      <UserAvatar avatarUrl={u.avatar_url} username={u.username} size="sm" />
                      <span className="truncate">@{u.username}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="mono-label">CONVERSATIONS</div>
              {dmPartners.length === 0 && !dmSearch && <div className="text-xs text-muted-foreground px-2">Search a user to start chatting.</div>}
              {dmPartners.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setActiveDm(u.id)}
                  className={`flex w-full items-center gap-2 text-left px-2 py-2 text-xs border-l-2 ${
                    activeDm === u.id ? "border-primary bg-card" : "border-transparent hover:border-foreground/40"
                  }`}
                >
                  <span className="relative">
                    <UserAvatar avatarUrl={u.avatar_url} username={u.username} size="sm" />
                    <OnlineDot userId={u.id} className="absolute -bottom-0.5 -right-0.5 size-2!" />
                  </span>
                  <span className="flex-1 truncate">@{u.username}</span>
                  {(counts.dm[u.id] ?? 0) > 0 && (
                    <span className="min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-mono grid place-items-center">
                      {counts.dm[u.id]}
                    </span>
                  )}
                </button>
              ))}
              <Link to="/users" className="block text-xs text-primary hover:underline px-2 pt-1">Browse all users →</Link>
            </div>
          )}

          {tab === "groups" && (
            <div className="space-y-2">
              <button type="button" onClick={() => setShowCreateGroup(true)} className="ink-button w-full py-2 text-xs flex items-center justify-center gap-1">
                <Plus className="size-3.5" /> New group
              </button>
              <div className="mono-label">MY GROUPS</div>
              <div className="space-y-1">
                {groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setActiveGroup(g.id)}
                    className={`flex w-full items-center gap-2 text-left px-2 py-2 text-xs border-l-2 ${
                      activeGroup === g.id ? "border-primary bg-card" : "border-transparent hover:border-foreground/40"
                    }`}
                  >
                    {g.avatar_url ? (
                      <img src={g.avatar_url} alt="" className="size-6 rounded-full object-cover border border-line shrink-0" />
                    ) : (
                      <span className="size-6 rounded-full bg-card border border-line grid place-items-center font-mono text-[10px] shrink-0">{g.name[0]}</span>
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="font-medium block truncate">{g.name}</span>
                      <span className="block text-muted-foreground truncate text-[10px]">{g.visibility === "public" ? "Public" : "Private"}</span>
                    </span>
                    {(counts.groups[g.id] ?? 0) > 0 && (
                      <span className="min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-mono grid place-items-center shrink-0">
                        {counts.groups[g.id]}
                      </span>
                    )}
                  </button>
                ))}
                {groups.length === 0 && <div className="mono-label">No groups yet.</div>}
              </div>
              {publicGroups.filter((g) => !groups.some((m) => m.id === g.id)).length > 0 && (
                <>
                  <div className="mono-label mt-4">DISCOVER PUBLIC</div>
                  {publicGroups.filter((g) => !groups.some((m) => m.id === g.id)).slice(0, 5).map((g) => (
                    <PublicGroupJoin key={g.id} group={g} me={me!} onJoined={() => setShowCreateGroup(false)} />
                  ))}
                </>
              )}
            </div>
          )}

          {tab === "global" && (
            <div className="mono-label">
              The Loom — shared realtime room for all makers.
              <div className="mt-3 flex items-center gap-2">
                <span className="size-2 bg-green-600 rounded-full live-dot" />
                <span>Live</span>
              </div>
            </div>
          )}
        </aside>

        <div className="flex flex-col h-[calc(100vh-7rem)] lg:h-screen">
          {tab === "global" && me && myProfile && (
            <GlobalRoom me={me} myProfile={myProfile} users={allProfiles} onRead={() => { markThreadRead(me, "global", "global"); refreshUnread(); }} />
          )}
          {tab === "dm" && me && myProfile && activeDm && (
            <DmRoom me={me} myProfile={myProfile} other={activeDm} users={allProfiles} onRead={() => { markThreadRead(me, "direct", activeDm); refreshUnread(); }} />
          )}
          {tab === "dm" && !activeDm && (
            <EmptyState title="Start a private chat" subtitle="Search by username or user ID — conversations appear here" />
          )}
          {tab === "groups" && me && myProfile && activeGroup && (
            <GroupRoom
              me={me}
              myProfile={myProfile}
              groupId={activeGroup}
              group={groups.find((g) => g.id === activeGroup) ?? null}
              users={allProfiles}
              onRead={() => { markThreadRead(me, "group", activeGroup); refreshUnread(); }}
              onManage={() => setShowGroupSettings(true)}
            />
          )}
          {tab === "groups" && !activeGroup && (
            <EmptyState title="Select or create a group" subtitle="Public groups can be discovered; private groups are invite-only" />
          )}
        </div>
      </div>

      {showCreateGroup && me && (
        <CreateGroupModal me={me} onClose={() => setShowCreateGroup(false)} onCreated={(id) => { setActiveGroup(id); setTab("groups"); setShowCreateGroup(false); }} />
      )}
      {showGroupSettings && me && activeGroup && (
        <GroupSettingsModal
          me={me}
          groupId={activeGroup}
          group={groups.find((g) => g.id === activeGroup) ?? null}
          onClose={() => setShowGroupSettings(false)}
          onUpdated={() => setShowGroupSettings(false)}
        />
      )}
    </AppShell>
  );
}

function PublicGroupJoin({ group, me, onJoined }: { group: GroupInfo; me: string; onJoined: () => void }) {
  const [loading, setLoading] = useState(false);
  async function join() {
    setLoading(true);
    const { error } = await supabase.from("chat_group_members").insert({ group_id: group.id, user_id: me, role: "member" });
    if (error) toast.error(error.message);
    else { toast.success(`Joined ${group.name}`); onJoined(); }
    setLoading(false);
  }
  return (
    <button type="button" disabled={loading} onClick={join} className="flex w-full items-center gap-2 text-left px-2 py-2 text-xs border border-line hover:border-primary">
      <span className="font-medium truncate flex-1">{group.name}</span>
      <span className="text-[10px] text-primary">{loading ? "…" : "Join"}</span>
    </button>
  );
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="grid flex-1 place-items-center p-8 text-center">
      <div>
        <div className="mono-label mb-2">NO_THREAD</div>
        <h2 className="font-display text-3xl uppercase">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

function CreateGroupModal({ me, onClose, onCreated }: { me: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [inviteSearch, setInviteSearch] = useState("");
  const [searchHits, setSearchHits] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!inviteSearch.trim()) { setSearchHits([]); return; }
    supabase.from("profiles").select("id,username,display_name,avatar_url").ilike("username", `%${inviteSearch.trim()}%`).neq("id", me).limit(8)
      .then(({ data }) => setSearchHits((data ?? []) as Profile[]));
  }, [inviteSearch, me]);

  async function create() {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const { data: group, error } = await supabase
        .from("chat_groups")
        .insert({ name: name.trim(), description: bio.trim() || null, bio: bio.trim() || null, visibility, created_by: me } as never)
        .select()
        .single();
      if (error) throw error;
      await supabase.from("chat_group_members").insert({ group_id: group.id, user_id: me, role: "admin" });
      if (selected.size > 0) {
        await supabase.from("chat_group_members").insert([...selected].map((uid) => ({ group_id: group.id, user_id: uid, role: "member" as const })));
      }
      toast.success("Group created");
      onCreated(group.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create group");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
      <div className="paper-card w-full max-w-md p-6 animate-enter max-h-[90vh] overflow-y-auto">
        <div className="mono-label mb-2">NEW_GROUP</div>
        <h3 className="font-display text-2xl uppercase mb-4">Create group</h3>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name" className="w-full border border-line bg-background px-3 py-2 text-sm mb-3 focus:border-primary focus:outline-none" />
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Bio (optional)" rows={2} className="w-full border border-line bg-background px-3 py-2 text-sm mb-3 focus:border-primary focus:outline-none resize-none" />
        <div className="flex gap-2 mb-4">
          {(["private", "public"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setVisibility(v)} className={`flex-1 py-2 text-xs border ${visibility === v ? "border-primary bg-primary/10" : "border-line"}`}>
              {v === "private" ? "Private" : "Public"}
            </button>
          ))}
        </div>
        <div className="mono-label mb-2">INVITE (search)</div>
        <input value={inviteSearch} onChange={(e) => setInviteSearch(e.target.value)} placeholder="Search @username" className="w-full border border-line bg-background px-3 py-2 text-sm mb-2 focus:border-primary focus:outline-none" />
        <div className="max-h-32 overflow-y-auto space-y-1 mb-4">
          {searchHits.map((u) => (
            <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-paper-2 px-2 py-1 rounded">
              <input type="checkbox" checked={selected.has(u.id)} onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n; })} />
              @{u.username}
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 border border-line py-2 text-sm hover:bg-paper-2">Cancel</button>
          <button type="button" disabled={loading} onClick={create} className="flex-1 rust-button py-2 text-sm">{loading ? "..." : "Create"}</button>
        </div>
      </div>
    </div>
  );
}

function GroupSettingsModal({ me, groupId, group, onClose, onUpdated }: { me: string; groupId: string; group: GroupInfo | null; onClose: () => void; onUpdated: () => void }) {
  const [name, setName] = useState(group?.name ?? "");
  const [bio, setBio] = useState(group?.bio ?? group?.description ?? "");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<Profile[]>([]);

  useEffect(() => {
    supabase.from("chat_group_members").select("role").eq("group_id", groupId).eq("user_id", me).single()
      .then(({ data }) => setIsAdmin((data as { role?: string } | null)?.role === "admin"));
    supabase.from("chat_group_members").select("user_id, profiles(id,username,display_name,avatar_url)").eq("group_id", groupId)
      .then(({ data }) => setMembers((data ?? []).map((r) => r.profiles as Profile).filter(Boolean)));
  }, [groupId, me]);

  async function uploadImage(field: "cover_url" | "avatar_url", file: File) {
    const path = `${me}/groups/${groupId}/${field}-${crypto.randomUUID()}.${file.name.split(".").pop()}`;
    const { error: upErr } = await supabase.storage.from("generated-images").upload(path, file);
    if (upErr) { toast.error(upErr.message); return null; }
    const { data: signed } = await supabase.storage.from("generated-images").createSignedUrl(path, 60 * 60 * 24 * 365);
    return signed?.signedUrl ?? null;
  }

  async function save() {
    if (!isAdmin) return;
    setLoading(true);
    const { error } = await supabase.from("chat_groups").update({ name: name.trim(), bio: bio.trim() || null, description: bio.trim() || null } as never).eq("id", groupId);
    if (error) toast.error(error.message);
    else { toast.success("Group updated"); onUpdated(); }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
      <div className="paper-card w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-2xl uppercase">Group settings</h3>
          <button type="button" onClick={onClose} className="mono-label">Close</button>
        </div>
        {!isAdmin && <p className="text-xs text-muted-foreground mb-4">Only admins can edit group details.</p>}
        {group?.cover_url && <img src={group.cover_url} alt="" className="w-full h-24 object-cover border border-line mb-3" />}
        {isAdmin && (
          <>
            <label className="mono-label block mb-1">Cover image</label>
            <input type="file" accept="image/*" className="text-xs mb-3" onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f) return;
              const url = await uploadImage("cover_url", f);
              if (url) await supabase.from("chat_groups").update({ cover_url: url } as never).eq("id", groupId);
              onUpdated();
            }} />
            <label className="mono-label block mb-1">Group icon</label>
            <input type="file" accept="image/*" className="text-xs mb-3" onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f) return;
              const url = await uploadImage("avatar_url", f);
              if (url) await supabase.from("chat_groups").update({ avatar_url: url } as never).eq("id", groupId);
              onUpdated();
            }} />
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-line px-3 py-2 text-sm mb-3" placeholder="Name" />
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={2} className="w-full border border-line px-3 py-2 text-sm mb-3 resize-none" placeholder="Bio" />
            <button type="button" disabled={loading} onClick={save} className="rust-button w-full py-2 text-sm mb-4">{loading ? "…" : "Save"}</button>
          </>
        )}
        <div className="mono-label mb-2">MEMBERS ({members.length})</div>
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-2 text-sm">
              <UserAvatar avatarUrl={m.avatar_url} username={m.username} size="sm" />
              <Link to="/u/$username" params={{ username: m.username }} className="hover:text-primary">@{m.username}</Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type BaseMsg = { id: string; user_id: string; content: string; image_url?: string | null; created_at: string; deleted_at?: string | null };
type DmMsg = { id: string; sender_id: string; recipient_id: string; content: string; image_url?: string | null; created_at: string; deleted_at?: string | null };

function GlobalRoom({ me, myProfile, users, onRead }: { me: string; myProfile: Profile; users: Profile[]; onRead: () => void }) {
  const [msgs, setMsgs] = useState<BaseMsg[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { blocked, blockUser } = useBlockedUsers(me);
  const { hidden, hideMessage, hideAllFromUser } = useHiddenMessages(me, "global");
  const visibleIds = useMemo(() => msgs.filter((m) => !hidden.has(m.id) && !blocked.has(m.user_id) && !m.deleted_at).map((m) => m.id), [msgs, hidden, blocked]);
  const { reactions, toggleReaction } = useReactions("global", visibleIds);
  const profileMap = useMemo(() => Object.fromEntries([...users, myProfile].map((u) => [u.id, u])), [users, myProfile]);

  useEffect(() => {
    supabase.from("global_messages").select("*").order("created_at", { ascending: true }).limit(150)
      .then(({ data, error }) => { if (error) toast.error(friendlyDbError(error.message)); else setMsgs((data ?? []) as BaseMsg[]); });
    const ch = supabase.channel("global-messages").on("postgres_changes", { event: "*", schema: "public", table: "global_messages" }, (payload) => {
      if (payload.eventType === "INSERT") setMsgs((cur) => [...cur, payload.new as BaseMsg]);
      if (payload.eventType === "UPDATE") setMsgs((cur) => cur.map((m) => (m.id === (payload.new as BaseMsg).id ? (payload.new as BaseMsg) : m)));
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [msgs]);
  useEffect(() => { onRead(); }, [onRead, msgs.length]);

  async function send({ content, imageUrl }: { content: string; imageUrl?: string | null }) {
    if (!content && !imageUrl) return;
    const { error } = await supabase.from("global_messages").insert({ user_id: me, content: content || " ", image_url: imageUrl ?? null } as never);
    if (error) toast.error(friendlyDbError(error.message));
  }

  const visible = msgs.filter((m) => !hidden.has(m.id) && !blocked.has(m.user_id) && !m.deleted_at);

  return (
    <>
      <RoomHeader code="GLOBAL_CHANNEL" title="The Loom" live />
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 lg:p-8 space-y-4">
        {visible.map((m) => (
          <MessageBubble
            key={m.id}
            id={m.id}
            content={m.content}
            imageUrl={m.image_url}
            channel="global"
            isOwn={m.user_id === me}
            author={profileMap[m.user_id]}
            reactions={reactions.filter((r) => r.message_id === m.id)}
            me={me}
            onReact={(emoji) => toggleReaction(m.id, emoji, me)}
            onDelete={m.user_id === me ? () => supabase.from("global_messages").update({ deleted_at: new Date().toISOString() }).eq("id", m.id) : undefined}
            onHide={() => hideMessage(m.id)}
            onBlock={m.user_id !== me ? async () => { await blockUser(m.user_id); await hideAllFromUser(m.user_id, msgs.filter((x) => x.user_id === m.user_id).map((x) => x.id)); toast.success("User blocked"); } : undefined}
          />
        ))}
      </div>
      <ChatInput value={input} onChange={setInput} onSend={send} placeholder="Message the room..." me={me} />
    </>
  );
}

function DmRoom({ me, myProfile, other, users, onRead }: { me: string; myProfile: Profile; other: string; users: Profile[]; onRead: () => void }) {
  const [msgs, setMsgs] = useState<DmMsg[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { blocked, blockUser } = useBlockedUsers(me);
  const { hidden, hideMessage, hideAllFromUser } = useHiddenMessages(me, "direct");
  const otherProfile = users.find((u) => u.id === other);
  const otherOnline = useIsOnline(other);
  const visibleIds = useMemo(() => msgs.filter((m) => !hidden.has(m.id) && !m.deleted_at).map((m) => m.id), [msgs, hidden]);
  const { reactions, toggleReaction } = useReactions("direct", visibleIds);

  useEffect(() => {
    supabase.from("direct_messages").select("*")
      .or(`and(sender_id.eq.${me},recipient_id.eq.${other}),and(sender_id.eq.${other},recipient_id.eq.${me})`)
      .order("created_at", { ascending: true }).limit(200)
      .then(({ data }) => setMsgs((data ?? []) as DmMsg[]));
    const ch = supabase.channel(`dm-${me}-${other}`).on("postgres_changes", { event: "*", schema: "public", table: "direct_messages" }, (payload) => {
      const m = payload.new as DmMsg;
      if (payload.eventType === "INSERT" && ((m.sender_id === me && m.recipient_id === other) || (m.sender_id === other && m.recipient_id === me))) setMsgs((cur) => [...cur, m]);
      if (payload.eventType === "UPDATE") setMsgs((cur) => cur.map((x) => (x.id === m.id ? m : x)));
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [me, other]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [msgs]);
  useEffect(() => { onRead(); }, [onRead, msgs.length]);

  if (blocked.has(other)) return <EmptyState title="User blocked" subtitle="Unblock from settings to resume chatting" />;

  const visible = msgs.filter((m) => !hidden.has(m.id) && !m.deleted_at);

  return (
    <>
      <RoomHeader code="PRIVATE_DM" title={`@${otherProfile?.username ?? "maker"}`} online={otherOnline} />
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 lg:p-8 space-y-4">
        {visible.map((m) => {
          const isOwn = m.sender_id === me;
          const author = isOwn ? myProfile : otherProfile;
          return (
            <MessageBubble
              key={m.id}
              id={m.id}
              content={m.content}
              imageUrl={m.image_url}
              channel="direct"
              isOwn={isOwn}
              author={author}
              reactions={reactions.filter((r) => r.message_id === m.id)}
              me={me}
              onReact={(emoji) => toggleReaction(m.id, emoji, me)}
              onDelete={isOwn ? () => supabase.from("direct_messages").update({ deleted_at: new Date().toISOString() }).eq("id", m.id) : undefined}
              onHide={() => hideMessage(m.id)}
              onBlock={!isOwn ? async () => { await blockUser(other); await hideAllFromUser(other, msgs.map((x) => x.id)); toast.success("User blocked"); } : undefined}
            />
          );
        })}
      </div>
      <ChatInput value={input} onChange={setInput} onSend={async ({ content, imageUrl }) => {
        if (!content && !imageUrl) return;
        const { error } = await supabase.from("direct_messages").insert({ sender_id: me, recipient_id: other, content: content || " ", image_url: imageUrl ?? null } as never);
        if (error) toast.error(error.message);
      }} placeholder="Private message..." me={me} />
    </>
  );
}

function GroupRoom({ me, myProfile, groupId, group, users, onRead, onManage }: { me: string; myProfile: Profile; groupId: string; group: GroupInfo | null; users: Profile[]; onRead: () => void; onManage: () => void }) {
  const [msgs, setMsgs] = useState<BaseMsg[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { blocked, blockUser } = useBlockedUsers(me);
  const { hidden, hideMessage, hideAllFromUser } = useHiddenMessages(me, "group");
  const profileMap = useMemo(() => Object.fromEntries([...users, myProfile].map((u) => [u.id, u])), [users, myProfile]);
  const visibleIds = useMemo(() => msgs.filter((m) => !hidden.has(m.id) && !blocked.has(m.user_id) && !m.deleted_at).map((m) => m.id), [msgs, hidden, blocked]);
  const { reactions, toggleReaction } = useReactions("group", visibleIds);

  useEffect(() => {
    supabase.from("group_messages").select("*").eq("group_id", groupId).order("created_at", { ascending: true }).limit(200)
      .then(({ data }) => setMsgs((data ?? []) as BaseMsg[]));
    const ch = supabase.channel(`group-${groupId}`).on("postgres_changes", { event: "*", schema: "public", table: "group_messages", filter: `group_id=eq.${groupId}` }, (payload) => {
      if (payload.eventType === "INSERT") setMsgs((cur) => [...cur, payload.new as BaseMsg]);
      if (payload.eventType === "UPDATE") setMsgs((cur) => cur.map((m) => (m.id === (payload.new as BaseMsg).id ? (payload.new as BaseMsg) : m)));
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [groupId]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [msgs]);
  useEffect(() => { onRead(); }, [onRead, msgs.length]);

  const visible = msgs.filter((m) => !hidden.has(m.id) && !blocked.has(m.user_id) && !m.deleted_at);

  return (
    <>
      {group?.cover_url && <div className="h-24 overflow-hidden border-b border-line"><img src={group.cover_url} alt="" className="w-full h-full object-cover" /></div>}
      <div className="p-4 border-b border-line flex items-center justify-between">
        <RoomHeaderInline code="GROUP_CHAT" title={group?.name ?? "Group"} subtitle={group?.bio ?? group?.description} />
        <button type="button" onClick={onManage} className="border border-line p-2 hover:bg-paper-2" aria-label="Group settings"><Settings className="size-4" /></button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 lg:p-8 space-y-4">
        {visible.map((m) => (
          <MessageBubble
            key={m.id}
            id={m.id}
            content={m.content}
            imageUrl={m.image_url}
            channel="group"
            isOwn={m.user_id === me}
            author={profileMap[m.user_id]}
            reactions={reactions.filter((r) => r.message_id === m.id)}
            me={me}
            onReact={(emoji) => toggleReaction(m.id, emoji, me)}
            onDelete={m.user_id === me ? () => supabase.from("group_messages").update({ deleted_at: new Date().toISOString() }).eq("id", m.id) : undefined}
            onHide={() => hideMessage(m.id)}
            onBlock={m.user_id !== me ? async () => { await blockUser(m.user_id); await hideAllFromUser(m.user_id, msgs.filter((x) => x.user_id === m.user_id).map((x) => x.id)); toast.success("User blocked"); } : undefined}
          />
        ))}
      </div>
      <ChatInput value={input} onChange={setInput} onSend={async ({ content, imageUrl }) => {
        if (!content && !imageUrl) return;
        const { error } = await supabase.from("group_messages").insert({ group_id: groupId, user_id: me, content: content || " ", image_url: imageUrl ?? null } as never);
        if (error) toast.error(error.message);
      }} placeholder={`Message ${group?.name ?? "group"}...`} me={me} />
    </>
  );
}

function RoomHeader({ code, title, live, online }: { code: string; title: string; live?: boolean; online?: boolean }) {
  return (
    <div className="p-4 border-b border-line flex items-center justify-between">
      <RoomHeaderInline code={code} title={title} online={online} />
      {live && <div className="size-2 bg-green-600 rounded-full live-dot" />}
    </div>
  );
}

function RoomHeaderInline({ code, title, subtitle, online }: { code: string; title: string; subtitle?: string | null; online?: boolean }) {
  return (
    <div>
      <div className="mono-label">/{code}</div>
      <div className="flex items-center gap-2">
        <h1 className="font-display text-3xl uppercase">{title}</h1>
        {online !== undefined && (
          <span className={`mono-label text-[10px] ${online ? "text-green-600" : "text-muted-foreground"}`}>{online ? "● Online" : "○ Offline"}</span>
        )}
      </div>
      {subtitle && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{subtitle}</p>}
    </div>
  );
}
