import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { getOpenAIKeySetting, saveOpenAIKeySetting } from "@/lib/admin.functions";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: AdminSettings,
});

function AdminSettings() {
  const qc = useQueryClient();
  const getKey = useServerFn(getOpenAIKeySetting);
  const saveKey = useServerFn(saveOpenAIKeySetting);
  const [apiKey, setApiKey] = useState("");

  const setting = useQuery({
    queryKey: ["admin-openai-key"],
    queryFn: () => getKey(),
  });

  const save = useMutation({
    mutationFn: () => saveKey({ data: { openaiApiKey: apiKey.trim() || null } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-openai-key"] });
      setApiKey("");
      toast.success("OpenAI API key updated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  useEffect(() => {
    if (setting.data && !setting.data.hasKey) setApiKey("");
  }, [setting.data]);

  return (
    <AppShell>
      <div className="p-4 lg:p-8 max-w-xl">
        <Link to="/admin" className="inline-flex items-center gap-2 mono-label hover:text-primary mb-4">
          <ArrowLeft className="size-4" /> Admin
        </Link>
        <div className="mono-label">/ADMIN/SETTINGS</div>
        <h1 className="font-display text-4xl uppercase mt-1">OpenAI API Key</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Platform default key used when users don&apos;t provide their own. Falls back to{" "}
          <code className="text-xs">OPENAI_API_KEY</code> env var if unset.
        </p>

        <div className="paper-card p-6 mt-6 space-y-4">
          <div>
            <div className="mono-label mb-1">CURRENT</div>
            {setting.data?.hasKey ? (
              <p className="font-mono text-sm">{setting.data.masked}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Using environment variable {setting.data?.usesEnvFallback ? "(OPENAI_API_KEY)" : "(not set)"}
              </p>
            )}
            {setting.data?.updatedAt && (
              <p className="text-xs text-muted-foreground mt-1">Updated {new Date(setting.data.updatedAt).toLocaleString()}</p>
            )}
          </div>

          <div>
            <label className="mono-label block mb-2">NEW API KEY</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full border border-line bg-background px-3 py-2 font-mono text-sm focus:border-primary focus:outline-none"
            />
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={() => save.mutate()} disabled={save.isPending} className="rust-button px-6 py-2 text-sm">
              {save.isPending ? "Saving…" : "Save key"}
            </button>
            {setting.data?.hasKey && (
              <button
                type="button"
                className="border border-line px-4 py-2 text-sm hover:bg-paper-2"
                onClick={() => {
                  saveKey({ data: { openaiApiKey: null } })
                    .then(() => {
                      qc.invalidateQueries({ queryKey: ["admin-openai-key"] });
                      toast.success("Key removed — using env fallback");
                    })
                    .catch((e) => toast.error(e instanceof Error ? e.message : "Remove failed"));
                }}
              >
                Remove (use env)
              </button>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
