import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ImagePlus } from "lucide-react";

export function PostComposer({ onPosted }: { onPosted?: () => void }) {
  const [caption, setCaption] = useState("");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);

  async function upload(file: File) {
    setLoading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        toast.error("Sign in to post.");
        return;
      }

      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${u.user.id}/posts/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("generated-images")
        .upload(path, file, { contentType: file.type || "image/png" });

      if (upErr) throw upErr;

      const { data: signed, error: signErr } = await supabase.storage
        .from("generated-images")
        .createSignedUrl(path, 60 * 60 * 24 * 365);

      if (signErr || !signed) throw signErr ?? new Error("Could not sign URL");

      const { error } = await supabase.from("posts").insert({
        user_id: u.user.id,
        image_url: signed.signedUrl,
        storage_path: path,
        caption: caption.trim() || null,
        prompt: prompt.trim() || null,
        source: "upload",
      } as never);

      if (error) throw error;
      toast.success("Posted to the grid.");
      setCaption("");
      setPrompt("");
      onPosted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="paper-card p-5 space-y-4">
      <div className="mono-label">NEW_POST</div>
      <input
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Caption (optional)"
        className="w-full border border-line bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
      />
      <input
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Prompt / description (optional)"
        className="w-full border border-line bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
      />
      <label className="flex cursor-pointer items-center justify-center gap-2 border-2 border-dashed border-line py-8 hover:border-primary transition-colors">
        <ImagePlus className="size-5" />
        <span className="mono-label">{loading ? "Uploading…" : "Upload your image"}</span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={loading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}
