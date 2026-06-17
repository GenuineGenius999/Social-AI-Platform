import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ChatInput } from "@/components/chat/ChatInput";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { useBlockedUsers, useHiddenMessages, useReactions } from "@/hooks/use-chat-social";
import { OnlineDot, useIsOnline } from "@/hooks/use-online-status";
import { markThreadRead, useUnreadCounts } from "@/hooks/use-unread-counts";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/lib/chat.types";
import { friendlyDbError } from "@/lib/db-errors";
import { toast } from "sonner";
import { Hash, MessageCircle, Plus, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/messages")({ component: Messages });

type Tab = "global" | "groups" | "dm";

function Messages() {
  const [tab, setTab] = useState<Tab>("global");
  const [me, setMe] = useState<string | null>(null);
  const [users, setUsers] = useState<Profile[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string; description: string | null }[]>([]);
  const [activeDm, setActiveDm] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const { counts, refresh: refreshUnread } = useUnreadCounts(me);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
    supabase.from("profiles").select("id,username,display_name,avatar_url").limit(100).then(({ data }) => setUsers((data ?? []) as Profile[]));
  }, []);

  useEffect(() => {
    if (!me) return;
    supabase
      .from("chat_group_members")
      .select("group_id, chat_groups(id,name,description)")
      .eq("user_id", me)
      .then(({ data }) => {
        const list = (data ?? [])
          .map((r) => r.chat_groups as { id: string; name: string; description: string | null } | null)
          .filter(Boolean) as { id: string; name: string; description: string | null }[];
        setGroups(list);
      });
  }, [me, showCreateGroup]);

  const tabs: { id: Tab; label: string; icon: typeof Hash; badge?: number }[] = [
    { id: "global", label: "Global", icon: Hash, badge: counts.global },
    { id: "groups", label: "Groups", icon: Users, badge: Object.values(counts.groups).reduce((a, b) => a + b, 0) },
    { id: "dm", label: "Private", icon: MessageCircle, badge: Object.values(counts.dm).reduce((a, b) => a + b, 0) },
  ];

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
            <div className="space-y-1">
              <div className="mono-label mb-2">MAKERS</div>
              {users.filter((u) => u.id !== me).map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setActiveDm(u.id)}
                  className={`flex w-full items-center gap-2 text-left px-2 py-2 text-xs border-l-2 ${
                    activeDm === u.id ? "border-primary bg-card" : "border-transparent hover:border-foreground/40"
                  }`}
                >
                  <span className="relative">
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt="" className="size-6 rounded-full object-cover" />
                    ) : (
                      <span className="size-6 rounded-full bg-card border border-line grid place-items-center font-mono text-[10px]">
                        {u.username[0]}
                      </span>
                    )}
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
            </div>
          )}

          {tab === "groups" && (
            <div className="space-y-2">
              <button type="button" onClick={() => setShowCreateGroup(true)} className="ink-button w-full py-2 text-xs flex items-center justify-center gap-1">
                <Plus className="size-3.5" /> New group
              </button>
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
                    <span className="flex-1 min-w-0">
                      <span className="font-medium block truncate">{g.name}</span>
                      {g.description && <span className="block text-muted-foreground truncate">{g.description}</span>}
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
          {tab === "global" && me && <GlobalRoom me={me} users={users} onRead={() => { markThreadRead(me, "global", "global"); refreshUnread(); }} />}
          {tab === "dm" && me && activeDm && <DmRoom me={me} other={activeDm} users={users} onRead={() => { markThreadRead(me, "direct", activeDm); refreshUnread(); }} />}
          {tab === "dm" && !activeDm && (
            <EmptyState title="Select a maker" subtitle="Start a private 1:1 conversation" />
          )}
          {tab === "groups" && me && activeGroup && (
            <GroupRoom me={me} groupId={activeGroup} groupName={groups.find((g) => g.id === activeGroup)?.name ?? "Group"} users={users} onRead={() => { markThreadRead(me, "group", activeGroup); refreshUnread(); }} />
          )}
          {tab === "groups" && !activeGroup && (
            <EmptyState title="Select or create a group" subtitle="Collaborate with multiple makers in realtime" />
          )}
        </div>
      </div>

      {showCreateGroup && me && (
        <CreateGroupModal
          me={me}
          users={users}
          onClose={() => setShowCreateGroup(false)}
          onCreated={(id) => { setActiveGroup(id); setTab("groups"); setShowCreateGroup(false); }}
        />
      )}
    </AppShell>
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

function CreateGroupModal({
  me,
  users,
  onClose,
  onCreated,
}: {
  me: string;
  users: Profile[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const { data: group, error } = await supabase
        .from("chat_groups")
        .insert({ name: name.trim(), description: description.trim() || null, created_by: me })
        .select()
        .single();
      if (error) throw error;

      const { error: selfErr } = await supabase.from("chat_group_members").insert({ group_id: group.id, user_id: me, role: "admin" });
      if (selfErr) throw selfErr;

      if (selected.size > 0) {
        const others = [...selected].map((uid) => ({ group_id: group.id, user_id: uid, role: "member" as const }));
        const { error: mErr } = await supabase.from("chat_group_members").insert(others);
        if (mErr) throw mErr;
      }
      toast.success("Group created");
      onCreated(group.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create group";
      if (/row-level security|permission denied|violates/i.test(msg)) {
        toast.error("Group create blocked by DB policy. Run migration: supabase/migrations/20260612150000_messaging_notifications.sql");
      } else if (/relation .* does not exist|could not find the table/i.test(msg)) {
        toast.error("Database schema missing. Run supabase/bootstrap.sql or migrations in Supabase SQL Editor.");
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
      <div className="paper-card w-full max-w-md p-6 animate-enter">
        <div className="mono-label mb-2">NEW_GROUP</div>
        <h3 className="font-display text-2xl uppercase mb-4">Create group</h3>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name" className="w-full border border-line bg-background px-3 py-2 text-sm mb-3 focus:border-primary focus:outline-none" />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" rows={2} className="w-full border border-line bg-background px-3 py-2 text-sm mb-4 focus:border-primary focus:outline-none resize-none" />
        <div className="mono-label mb-2">INVITE MAKERS</div>
        <div className="max-h-40 overflow-y-auto space-y-1 mb-4">
          {users.filter((u) => u.id !== me).map((u) => (
            <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-paper-2 px-2 py-1 rounded">
              <input
                type="checkbox"
                checked={selected.has(u.id)}
                onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n; })}
              />
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

type BaseMsg = { id: string; user_id: string; content: string; image_url?: string | null; created_at: string; deleted_at?: string | null };
type DmMsg = { id: string; sender_id: string; recipient_id: string; content: string; image_url?: string | null; created_at: string; deleted_at?: string | null };

function GlobalRoom({ me, users, onRead }: { me: string; users: Profile[]; onRead: () => void }) {
  const [msgs, setMsgs] = useState<BaseMsg[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { blocked, blockUser } = useBlockedUsers(me);
  const { hidden, hideMessage, hideAllFromUser } = useHiddenMessages(me, "global");
  const visibleIds = useMemo(() => msgs.filter((m) => !hidden.has(m.id) && !blocked.has(m.user_id) && !m.deleted_at).map((m) => m.id), [msgs, hidden, blocked]);
  const { reactions, toggleReaction } = useReactions("global", visibleIds);
  const profileMap = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);

  useEffect(() => {
    supabase
      .from("global_messages")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(300)
      .then(({ data, error }) => {
        if (error) toast.error(friendlyDbError(error.message));
        else setMsgs((data ?? []) as BaseMsg[]);
      });
    const ch = supabase.channel("global-messages").on("postgres_changes", { event: "*", schema: "public", table: "global_messages" }, (payload) => {
      if (payload.eventType === "INSERT") setMsgs((cur) => [...cur, payload.new as BaseMsg]);
      if (payload.eventType === "UPDATE") setMsgs((cur) => cur.map((m) => (m.id === (payload.new as BaseMsg).id ? (payload.new as BaseMsg) : m)));
      if (payload.eventType === "DELETE") setMsgs((cur) => cur.filter((m) => m.id !== (payload.old as { id: string }).id));
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [msgs]);
  useEffect(() => { onRead(); }, [onRead, msgs.length]);

  async function send({ content, imageUrl }: { content: string; imageUrl?: string | null }) {
    if (!content && !imageUrl) return;
    const { error } = await supabase
      .from("global_messages")
      .insert({ user_id: me, content: content || " ", image_url: imageUrl ?? null } as never);
    if (error) toast.error(friendlyDbError(error.message));
  }

  async function deleteMsg(id: string) {
    const { error } = await supabase.from("global_messages").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message);
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
          onDelete={m.user_id === me ? () => deleteMsg(m.id) : undefined}
          onHide={() => hideMessage(m.id)}
          onBlock={m.user_id !== me ? async () => {
            await blockUser(m.user_id);
            const ids = msgs.filter((x) => x.user_id === m.user_id).map((x) => x.id);
            await hideAllFromUser(m.user_id, ids);
            toast.success("User blocked and history hidden");
          } : undefined}
        />
      ))}
      {visible.length === 0 && <div className="mono-label">No messages yet. Say hi to the collective.</div>}
    </div>
    <ChatInput value={input} onChange={setInput} onSend={send} placeholder="Message the room..." me={me} />
  </>
  );
}

function DmRoom({ me, other, users, onRead }: { me: string; other: string; users: Profile[]; onRead: () => void }) {
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
      .order("created_at", { ascending: true })
      .then(({ data }) => setMsgs((data ?? []) as DmMsg[]));
    const ch = supabase.channel(`dm-${me}-${other}`).on("postgres_changes", { event: "*", schema: "public", table: "direct_messages" }, (payload) => {
      const m = payload.new as DmMsg;
      if (payload.eventType === "INSERT" && ((m.sender_id === me && m.recipient_id === other) || (m.sender_id === other && m.recipient_id === me))) {
        setMsgs((cur) => [...cur, m]);
      }
      if (payload.eventType === "UPDATE") setMsgs((cur) => cur.map((x) => (x.id === m.id ? m : x)));
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [me, other]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [msgs]);
  useEffect(() => { onRead(); }, [onRead, msgs.length]);

  if (blocked.has(other)) {
    return <EmptyState title="User blocked" subtitle="Unblock from settings to resume chatting" />;
  }

  async function send({ content, imageUrl }: { content: string; imageUrl?: string | null }) {
    if (!content && !imageUrl) return;
    const { error } = await supabase.from("direct_messages").insert({
      sender_id: me,
      recipient_id: other,
      content: content || " ",
      image_url: imageUrl ?? null,
    } as never);
    if (error) toast.error(error.message);
  }

  async function deleteMsg(id: string) {
    await supabase.from("direct_messages").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  }

  const visible = msgs.filter((m) => !hidden.has(m.id) && !m.deleted_at);

  return (
  <>
    <RoomHeader code="PRIVATE_DM" title={`@${otherProfile?.username ?? "maker"}`} online={otherOnline} />
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 lg:p-8 space-y-4">
      {visible.map((m) => {
        const isOwn = m.sender_id === me;
        const author = isOwn ? undefined : otherProfile;
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
            onDelete={isOwn ? () => deleteMsg(m.id) : undefined}
            onHide={() => hideMessage(m.id)}
            onBlock={!isOwn ? async () => {
              await blockUser(other);
              await hideAllFromUser(other, msgs.map((x) => x.id));
              toast.success("User blocked");
            } : undefined}
          />
        );
      })}
      {visible.length === 0 && <div className="mono-label">Start a private thread.</div>}
    </div>
    <ChatInput value={input} onChange={setInput} onSend={send} placeholder="Private message..." me={me} />
  </>
  );
}

function GroupRoom({ me, groupId, groupName, users, onRead }: { me: string; groupId: string; groupName: string; users: Profile[]; onRead: () => void }) {
  const [msgs, setMsgs] = useState<BaseMsg[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { blocked, blockUser } = useBlockedUsers(me);
  const { hidden, hideMessage, hideAllFromUser } = useHiddenMessages(me, "group");
  const profileMap = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
  const visibleIds = useMemo(() => msgs.filter((m) => !hidden.has(m.id) && !blocked.has(m.user_id) && !m.deleted_at).map((m) => m.id), [msgs, hidden, blocked]);
  const { reactions, toggleReaction } = useReactions("group", visibleIds);

  useEffect(() => {
    supabase.from("group_messages").select("*").eq("group_id", groupId).order("created_at", { ascending: true }).then(({ data }) => setMsgs((data ?? []) as BaseMsg[]));
    const ch = supabase.channel(`group-${groupId}`).on("postgres_changes", { event: "*", schema: "public", table: "group_messages", filter: `group_id=eq.${groupId}` }, (payload) => {
      if (payload.eventType === "INSERT") setMsgs((cur) => [...cur, payload.new as BaseMsg]);
      if (payload.eventType === "UPDATE") setMsgs((cur) => cur.map((m) => (m.id === (payload.new as BaseMsg).id ? (payload.new as BaseMsg) : m)));
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [groupId]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [msgs]);
  useEffect(() => { onRead(); }, [onRead, msgs.length]);

  async function send({ content, imageUrl }: { content: string; imageUrl?: string | null }) {
    if (!content && !imageUrl) return;
    const { error } = await supabase.from("group_messages").insert({
      group_id: groupId,
      user_id: me,
      content: content || " ",
      image_url: imageUrl ?? null,
    } as never);
    if (error) toast.error(error.message);
  }

  async function deleteMsg(id: string) {
    await supabase.from("group_messages").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  }

  const visible = msgs.filter((m) => !hidden.has(m.id) && !blocked.has(m.user_id) && !m.deleted_at);

  return (
  <>
    <RoomHeader code="GROUP_CHAT" title={groupName} />
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
          onDelete={m.user_id === me ? () => deleteMsg(m.id) : undefined}
          onHide={() => hideMessage(m.id)}
          onBlock={m.user_id !== me ? async () => {
            await blockUser(m.user_id);
            const ids = msgs.filter((x) => x.user_id === m.user_id).map((x) => x.id);
            await hideAllFromUser(m.user_id, ids);
            toast.success("User blocked");
          } : undefined}
        />
      ))}
      {visible.length === 0 && <div className="mono-label">No messages in this group yet.</div>}
    </div>
    <ChatInput value={input} onChange={setInput} onSend={send} placeholder={`Message ${groupName}...`} me={me} />
  </>
  );
}

function RoomHeader({ code, title, live, online }: { code: string; title: string; live?: boolean; online?: boolean }) {
  return (
    <div className="p-4 border-b border-line flex items-center justify-between">
      <div>
        <div className="mono-label">/{code}</div>
        <div className="flex items-center gap-2">
          <h1 className="font-display text-3xl uppercase">{title}</h1>
          {online !== undefined && (
            <span className={`mono-label text-[10px] ${online ? "text-green-600" : "text-muted-foreground"}`}>
              {online ? "● Online" : "○ Offline"}
            </span>
          )}
        </div>
      </div>
      {live && <div className="size-2 bg-green-600 rounded-full live-dot" />}
    </div>
  );
}
