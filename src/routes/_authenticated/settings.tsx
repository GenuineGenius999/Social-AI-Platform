import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { useBlockedUsers } from "@/hooks/use-chat-social";
import { getUserApiKeyStatus, saveUserApiKey } from "@/lib/settings.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Ban } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const getStatus = useServerFn(getUserApiKeyStatus);
  const saveKey = useServerFn(saveUserApiKey);
  const [apiKey, setApiKey] = useState("");
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  const { blocked, unblockUser } = useBlockedUsers(me);

  const status = useQuery({
    queryKey: ["user-api-key"],
    queryFn: () => getStatus(),
  });

  const save = useMutation({
    mutationFn: () => saveKey({ data: { openaiApiKey: apiKey.trim() || null } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["user-api-key"] });
      setApiKey("");
      toast.success(res.removed ? "Personal API key removed" : "Personal API key saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  return (
    <AppShell>
      <div className="p-4 lg:p-8 max-w-xl">
        <div className="mono-label">/SETTINGS</div>
        <h1 className="font-display text-5xl uppercase mt-1">Your Settings</h1>

        <div className="paper-card p-6 mt-8 space-y-4">
          <div>
            <h2 className="font-display text-xl uppercase">OpenAI API Key (optional)</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Use your own key for image generation and AI chat. If unset, the platform default is used.
            </p>
          </div>

          {status.data?.hasKey && (
            <p className="font-mono text-sm">
              Current: <span className="text-primary">{status.data.masked}</span>
            </p>
          )}

          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-... (leave empty to remove)"
            className="w-full border border-line bg-background px-3 py-2 font-mono text-sm focus:border-primary focus:outline-none"
          />

          <button type="button" onClick={() => save.mutate()} disabled={save.isPending} className="rust-button px-6 py-2 text-sm">
            {save.isPending ? "Saving…" : status.data?.hasKey ? "Update key" : "Save key"}
          </button>
        </div>

        <BlockedUsersSection blocked={blocked} unblockUser={unblockUser} />
      </div>
    </AppShell>
  );
}

function BlockedUsersSection({
  blocked,
  unblockUser,
}: {
  blocked: Set<string>;
  unblockUser: (id: string) => Promise<void>;
}) {
  const [profiles, setProfiles] = useState<{ id: string; username: string }[]>([]);

  useEffect(() => {
    if (blocked.size === 0) {
      setProfiles([]);
      return;
    }
    supabase
      .from("profiles")
      .select("id,username")
      .in("id", [...blocked])
      .then(({ data }) => setProfiles((data ?? []) as { id: string; username: string }[]));
  }, [blocked]);

  return (
    <div className="paper-card p-6 mt-6 space-y-4">
      <div className="flex items-center gap-2">
        <Ban className="size-5 text-muted-foreground" />
        <h2 className="font-display text-xl uppercase">Blocked users</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Users you blocked in private chat. Unblock to resume messaging.
      </p>
      {profiles.length === 0 ? (
        <p className="mono-label">No blocked users.</p>
      ) : (
        <ul className="space-y-2">
          {profiles.map((p) => (
            <li key={p.id} className="flex items-center justify-between border border-line px-3 py-2">
              <span className="font-mono text-sm">@{p.username}</span>
              <button
                type="button"
                onClick={async () => {
                  await unblockUser(p.id);
                  setProfiles((cur) => cur.filter((x) => x.id !== p.id));
                  toast.success(`Unblocked @${p.username}`);
                }}
                className="ink-button px-3 py-1 text-xs"
              >
                Unblock
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
