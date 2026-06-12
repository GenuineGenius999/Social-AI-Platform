import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { getUserApiKeyStatus, saveUserApiKey } from "@/lib/settings.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const getStatus = useServerFn(getUserApiKeyStatus);
  const saveKey = useServerFn(saveUserApiKey);
  const [apiKey, setApiKey] = useState("");

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
      </div>
    </AppShell>
  );
}
