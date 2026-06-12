import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { generateImage } from "@/lib/ai.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/studio")({
  component: Studio,
});

function Studio() {
  const [prompt, setPrompt] = useState("Cinematic shot of an industrial loom spinning silk threads, golden hour, 35mm");
  const [caption, setCaption] = useState("");
  const qc = useQueryClient();
  const gen = useServerFn(generateImage);

  const history = useQuery({
    queryKey: ["generations"],
    queryFn: async () => {
      const { data } = await supabase.from("generations").select("*").order("created_at", { ascending: false }).limit(20);
      return data ?? [];
    },
  });

  const m = useMutation({
    mutationFn: (p: string) => gen({ data: { prompt: p } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["generations"] }); toast.success("Rendered."); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const latest = history.data?.[0];

  async function post() {
    if (!latest) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("posts").insert({
      user_id: u.user.id,
      image_url: latest.image_url,
      prompt: latest.prompt,
      caption: caption || null,
    });
    if (error) toast.error(error.message);
    else { toast.success("Posted to the grid."); setCaption(""); }
  }

  return (
    <AppShell>
      <div className="p-4 lg:p-8">
        <div className="mono-label">/STUDIO</div>
        <h1 className="font-display text-5xl uppercase mt-1">Generation</h1>

        <div className="mt-8 grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="paper-card p-6 space-y-5">
            <div>
              <label className="mono-label block mb-2">MODEL</label>
              <div className="border border-line bg-background px-3 py-2 text-sm font-mono">dall-e-3 · 1024×1024</div>
            </div>
            <div>
              <label className="mono-label block mb-2">PROMPT</label>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={6} className="w-full border border-line bg-background p-3 text-sm focus:border-primary focus:outline-none resize-none" />
            </div>
            <button disabled={m.isPending} onClick={() => m.mutate(prompt)} className="rust-button w-full py-4 text-2xl">
              {m.isPending ? "RENDERING..." : "RENDER"}
            </button>
          </div>

          <div className="space-y-4">
            <div className="paper-card aspect-[4/3] grid place-items-center grain overflow-hidden">
              {latest ? (
                <img src={latest.image_url} alt={latest.prompt} className="h-full w-full object-cover" />
              ) : m.isPending ? (
                <div className="mono-label">RENDERING…</div>
              ) : (
                <div className="mono-label">CANVAS_OUTPUT</div>
              )}
            </div>
            {latest && (
              <div className="paper-card p-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Optional caption for the grid..." className="flex-1 border border-line bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                <button onClick={post} className="ink-button px-6 py-2 text-sm">Post to grid</button>
              </div>
            )}
            <div>
              <div className="mono-label mb-2">HISTORY</div>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {(history.data ?? []).map((g) => (
                  <img key={g.id} src={g.image_url} alt={g.prompt} className="size-24 shrink-0 object-cover border border-line" />
                ))}
                {(history.data ?? []).length === 0 && <div className="mono-label">No renders yet.</div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
