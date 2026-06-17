import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { createNotification, notificationStyleClass, type AppNotification } from "@/lib/notifications";
import { toast } from "sonner";
import { useNotifications } from "@/hooks/use-notifications";

type Ctx = ReturnType<typeof useNotifications>;
const NotificationCtx = createContext<Ctx | null>(null);

export function useNotificationContext() {
  const ctx = useContext(NotificationCtx);
  if (!ctx) throw new Error("useNotificationContext must be used within NotificationProvider");
  return ctx;
}

export function useOptionalNotificationContext() {
  return useContext(NotificationCtx);
}

function showStyledToast(n: AppNotification, onClick?: () => void) {
  const styleClass = notificationStyleClass(n.style_idx);
  toast(n.title, {
    description: n.body ?? undefined,
    duration: 6000,
    className: styleClass,
    action: n.link
      ? {
          label: "View",
          onClick: () => onClick?.(),
        }
      : undefined,
  });
}

export function NotificationProvider({ me, children }: { me: string | null; children: ReactNode }) {
  const nav = useNavigate();
  const notif = useNotifications(me);
  const groupIdsRef = useRef<Set<string>>(new Set());
  const shownToastIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!me) return;
    supabase
      .from("chat_group_members")
      .select("group_id")
      .eq("user_id", me)
      .then(({ data }) => {
        groupIdsRef.current = new Set((data ?? []).map((g) => g.group_id));
      });
  }, [me]);

  useEffect(() => {
    if (!me) return;

    const topic = `realtime:notify-events-${me}`;
    for (const existing of supabase.getChannels()) {
      if (existing.topic === topic) supabase.removeChannel(existing);
    }

    const ch = supabase
      .channel(`notify-events-${me}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, async (payload) => {
        const m = payload.new as { recipient_id: string; sender_id: string; content: string; id: string };
        if (m.recipient_id !== me) return;
        const { data: prof } = await supabase.from("profiles").select("username").eq("id", m.sender_id).single();
        try {
          await createNotification({
            userId: me,
            type: "new_message",
            title: `Message from @${prof?.username ?? "maker"}`,
            body: m.content.slice(0, 120),
            link: "/messages",
          });
        } catch {
          // table may not exist yet
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_messages" }, async (payload) => {
        const m = payload.new as { group_id: string; user_id: string; content: string };
        if (m.user_id === me || !groupIdsRef.current.has(m.group_id)) return;
        const { data: group } = await supabase.from("chat_groups").select("name").eq("id", m.group_id).single();
        try {
          await createNotification({
            userId: me,
            type: "new_group_message",
            title: `New in ${group?.name ?? "group"}`,
            body: m.content.slice(0, 120),
            link: "/messages",
          });
        } catch {
          // ignore
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, async (payload) => {
        const p = payload.new as { user_id: string; caption: string | null; id: string };
        if (p.user_id === me) return;
        const { data: prof } = await supabase.from("profiles").select("username").eq("id", p.user_id).single();
        try {
          await createNotification({
            userId: me,
            type: "new_post",
            title: `New post by @${prof?.username ?? "maker"}`,
            body: p.caption?.slice(0, 120) ?? "Fresh render on the grid.",
            link: `/post/${p.id}`,
          });
        } catch {
          // ignore
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "post_comments" }, async (payload) => {
        const c = payload.new as { post_id: string; user_id: string; content: string };
        if (c.user_id === me) return;
        const { data: post } = await supabase.from("posts").select("user_id").eq("id", c.post_id).single();
        if (!post || post.user_id !== me) return;
        const { data: prof } = await supabase.from("profiles").select("username").eq("id", c.user_id).single();
        try {
          await createNotification({
            userId: me,
            type: "new_comment",
            title: `@${prof?.username ?? "someone"} commented`,
            body: c.content.slice(0, 120),
            link: `/post/${c.post_id}`,
          });
        } catch {
          // ignore
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [me]);

  useEffect(() => {
    const latest = notif.items[0];
    if (!latest || latest.read_at) return;
    if (shownToastIds.current.has(latest.id)) return;
    shownToastIds.current.add(latest.id);
    showStyledToast(latest, () => {
      if (latest.link) {
        if (latest.link.startsWith("/post/")) {
          const postId = latest.link.replace("/post/", "");
          nav({ to: "/post/$postId", params: { postId } });
        } else {
          nav({ to: latest.link as "/messages" });
        }
      }
      notif.markRead(latest.id);
    });
  }, [notif.items, nav, notif]);

  return <NotificationCtx.Provider value={notif}>{children}</NotificationCtx.Provider>;
}
