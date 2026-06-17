import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const ONLINE_WINDOW_MS = 2 * 60 * 1000;

// Singleton realtime channel (avoids "postgres_changes after subscribe()" crashes)
let presenceChannel: ReturnType<typeof supabase.channel> | null = null;
let presenceUsers = 0;

export function useOnlineUsers() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["online-users"],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString();
      const { data } = await supabase.from("user_sessions").select("user_id").gte("last_seen", cutoff);
      return new Set((data ?? []).map((r) => r.user_id));
    },
    refetchInterval: 45_000,
  });

  useEffect(() => {
    presenceUsers += 1;
    if (!presenceChannel) {
      presenceChannel = supabase
        .channel("online-presence")
        .on("postgres_changes", { event: "*", schema: "public", table: "user_sessions" }, () => {
          qc.invalidateQueries({ queryKey: ["online-users"] });
        })
        .subscribe();
    }

    return () => {
      presenceUsers -= 1;
      if (presenceUsers <= 0 && presenceChannel) {
        supabase.removeChannel(presenceChannel);
        presenceChannel = null;
        presenceUsers = 0;
      }
    };
  }, [qc]);

  return query;
}

export function OnlineDot({ userId, className = "" }: { userId: string; className?: string }) {
  const online = useOnlineUsers();
  const isOnline = online.data?.has(userId) ?? false;
  return (
    <span
      className={`inline-block size-2 shrink-0 rounded-full border border-background ${
        isOnline ? "bg-green-500 live-dot" : "bg-muted-foreground/40"
      } ${className}`}
      title={isOnline ? "Online" : "Offline"}
    />
  );
}

export function useIsOnline(userId: string | null) {
  const online = useOnlineUsers();
  const [isOnline, setIsOnline] = useState(false);
  useEffect(() => {
    if (!userId) {
      setIsOnline(false);
      return;
    }
    setIsOnline(online.data?.has(userId) ?? false);
  }, [userId, online.data]);
  return isOnline;
}

