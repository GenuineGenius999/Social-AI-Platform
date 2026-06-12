import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { detectOs, getMachineId } from "@/lib/device";
import { sendHeartbeat } from "@/lib/presence.functions";

export function usePresence() {
  const heartbeat = useServerFn(sendHeartbeat);

  useEffect(() => {
    let active = true;

    async function beat() {
      const { data } = await supabase.auth.getUser();
      if (!data.user || !active) return;
      const { osName, osVersion } = detectOs();
      try {
        await heartbeat({
          data: {
            machineId: getMachineId(),
            osName,
            osVersion,
            userAgent: navigator.userAgent.slice(0, 512),
          },
        });
      } catch {
        // ignore heartbeat errors
      }
    }

    beat();
    const id = setInterval(beat, 45_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [heartbeat]);
}
