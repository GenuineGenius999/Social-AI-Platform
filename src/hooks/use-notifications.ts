import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AppNotification } from "@/lib/notifications";

export function useNotifications(me: string | null) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    if (!me) {
      setItems([]);
      setUnread(0);
      return;
    }
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", me)
      .order("created_at", { ascending: false })
      .limit(50);
    const list = (data ?? []) as AppNotification[];
    setItems(list);
    setUnread(list.filter((n) => !n.read_at).length);
  }, [me]);

  useEffect(() => {
    load();
    if (!me) return;

    const topic = `realtime:notifications-${me}`;
    for (const existing of supabase.getChannels()) {
      if (existing.topic === topic) supabase.removeChannel(existing);
    }

    const ch = supabase
      .channel(`notifications-${me}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${me}` },
        (payload) => {
          const n = payload.new as AppNotification;
          setItems((cur) => [n, ...cur].slice(0, 50));
          setUnread((c) => c + 1);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${me}` },
        () => load(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [me, load]);

  const markRead = useCallback(
    async (id: string) => {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
      setItems((cur) => cur.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
      setUnread((c) => Math.max(0, c - 1));
    },
    [],
  );

  const markAllRead = useCallback(async () => {
    if (!me) return;
    const now = new Date().toISOString();
    await supabase.from("notifications").update({ read_at: now }).eq("user_id", me).is("read_at", null);
    setItems((cur) => cur.map((n) => ({ ...n, read_at: n.read_at ?? now })));
    setUnread(0);
  }, [me]);

  return { items, unread, load, markRead, markAllRead };
}
