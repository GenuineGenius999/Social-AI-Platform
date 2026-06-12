import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { MessageChannel, Reaction } from "@/lib/chat.types";

export function useBlockedUsers(me: string | null) {
  const [blocked, setBlocked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!me) return;
    supabase.from("blocked_users").select("blocked_id").eq("blocker_id", me).then(({ data }) => {
      setBlocked(new Set((data ?? []).map((b) => b.blocked_id)));
    });
  }, [me]);

  const blockUser = useCallback(async (blockedId: string) => {
    if (!me) return;
    await supabase.from("blocked_users").insert({ blocker_id: me, blocked_id: blockedId });
    setBlocked((s) => new Set([...s, blockedId]));
  }, [me]);

  const unblockUser = useCallback(async (blockedId: string) => {
    if (!me) return;
    await supabase.from("blocked_users").delete().eq("blocker_id", me).eq("blocked_id", blockedId);
    setBlocked((s) => { const n = new Set(s); n.delete(blockedId); return n; });
  }, [me]);

  return { blocked, blockUser, unblockUser };
}

export function useHiddenMessages(me: string | null, channel: MessageChannel) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!me) return;
    supabase.from("hidden_messages").select("message_id").eq("user_id", me).eq("channel", channel).then(({ data }) => {
      setHidden(new Set((data ?? []).map((h) => h.message_id)));
    });
  }, [me, channel]);

  const hideMessage = useCallback(async (messageId: string) => {
    if (!me) return;
    await supabase.from("hidden_messages").insert({ user_id: me, message_id: messageId, channel });
    setHidden((s) => new Set([...s, messageId]));
  }, [me, channel]);

  const hideAllFromUser = useCallback(async (userId: string, messageIds: string[]) => {
    if (!me || messageIds.length === 0) return;
    const rows = messageIds.map((message_id) => ({ user_id: me, message_id, channel }));
    await supabase.from("hidden_messages").upsert(rows, { onConflict: "user_id,message_id,channel" });
    setHidden((s) => new Set([...s, ...messageIds]));
  }, [me, channel]);

  return { hidden, hideMessage, hideAllFromUser };
}

export function useReactions(channel: MessageChannel, messageIds: string[]) {
  const [reactions, setReactions] = useState<Reaction[]>([]);

  const load = useCallback(async () => {
    if (messageIds.length === 0) { setReactions([]); return; }
    const { data } = await supabase
      .from("message_reactions")
      .select("*")
      .eq("channel", channel)
      .in("message_id", messageIds);
    setReactions((data ?? []) as Reaction[]);
  }, [channel, messageIds]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel(`reactions-${channel}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [channel, load]);

  const toggleReaction = useCallback(async (messageId: string, emoji: string, me: string) => {
    const existing = reactions.find((r) => r.message_id === messageId && r.emoji === emoji && r.user_id === me);
    if (existing) {
      await supabase.from("message_reactions").delete().eq("id", existing.id);
    } else {
      await supabase.from("message_reactions").insert({ message_id: messageId, channel, user_id: me, emoji });
    }
    load();
  }, [channel, reactions, load]);

  return { reactions, toggleReaction };
}
