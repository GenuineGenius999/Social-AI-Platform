import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { MessageChannel } from "@/lib/chat.types";

export type UnreadCounts = {
  global: number;
  dm: Record<string, number>;
  groups: Record<string, number>;
  notifications: number;
  totalMessages: number;
};

const empty: UnreadCounts = { global: 0, dm: {}, groups: {}, notifications: 0, totalMessages: 0 };

export function useUnreadCounts(me: string | null) {
  const [counts, setCounts] = useState<UnreadCounts>(empty);

  const refresh = useCallback(async () => {
    if (!me) {
      setCounts(empty);
      return;
    }

    const [{ data: cursors }, { count: notifCount }] = await Promise.all([
      supabase.from("read_cursors").select("channel,thread_id,last_read_at").eq("user_id", me),
      supabase.from("notifications").select("*", { count: "exact", head: true }).eq("user_id", me).is("read_at", null),
    ]);

    const cursorMap = new Map<string, string>();
    for (const c of cursors ?? []) {
      cursorMap.set(`${c.channel}:${c.thread_id}`, c.last_read_at);
    }

    const globalSince = cursorMap.get("global:global") ?? "1970-01-01T00:00:00Z";
    const { count: globalCount } = await supabase
      .from("global_messages")
      .select("*", { count: "exact", head: true })
      .gt("created_at", globalSince)
      .neq("user_id", me)
      .is("deleted_at", null);

    const { data: dmPeers } = await supabase
      .from("direct_messages")
      .select("sender_id,recipient_id")
      .or(`sender_id.eq.${me},recipient_id.eq.${me}`);

    const peerIds = [...new Set((dmPeers ?? []).map((m) => (m.sender_id === me ? m.recipient_id : m.sender_id)))];
    const dm: Record<string, number> = {};
    for (const peer of peerIds) {
      const since = cursorMap.get(`direct:${peer}`) ?? "1970-01-01T00:00:00Z";
      const { count } = await supabase
        .from("direct_messages")
        .select("*", { count: "exact", head: true })
        .eq("sender_id", peer)
        .eq("recipient_id", me)
        .gt("created_at", since)
        .is("deleted_at", null);
      if ((count ?? 0) > 0) dm[peer] = count ?? 0;
    }

    const { data: myGroups } = await supabase.from("chat_group_members").select("group_id").eq("user_id", me);
    const groups: Record<string, number> = {};
    for (const g of myGroups ?? []) {
      const since = cursorMap.get(`group:${g.group_id}`) ?? "1970-01-01T00:00:00Z";
      const { count } = await supabase
        .from("group_messages")
        .select("*", { count: "exact", head: true })
        .eq("group_id", g.group_id)
        .neq("user_id", me)
        .gt("created_at", since)
        .is("deleted_at", null);
      if ((count ?? 0) > 0) groups[g.group_id] = count ?? 0;
    }

    const totalMessages = (globalCount ?? 0) + Object.values(dm).reduce((a, b) => a + b, 0) + Object.values(groups).reduce((a, b) => a + b, 0);

    setCounts({
      global: globalCount ?? 0,
      dm,
      groups,
      notifications: notifCount ?? 0,
      totalMessages,
    });
  }, [me]);

  useEffect(() => {
    refresh();
    if (!me) return;

    // React StrictMode (and fast refresh) can mount/unmount twice; ensure we don't
    // reuse an already-subscribed channel with the same topic.
    const topic = `realtime:unread-${me}`;
    for (const existing of supabase.getChannels()) {
      if (existing.topic === topic) supabase.removeChannel(existing);
    }

    const ch = supabase
      .channel(`unread-${me}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "direct_messages" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "group_messages" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "global_messages" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "read_cursors" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, refresh)
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [me, refresh]);

  return { counts, refresh };
}

export async function markThreadRead(me: string, channel: MessageChannel, threadId: string) {
  await supabase.from("read_cursors").upsert(
    { user_id: me, channel, thread_id: threadId, last_read_at: new Date().toISOString() },
    { onConflict: "user_id,channel,thread_id" },
  );
}
