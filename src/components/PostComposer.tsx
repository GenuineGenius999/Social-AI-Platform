import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ImagePlus, X } from "lucide-react";

export function PostComposer({ onPosted }: { onPosted?: () => void }) {
  const [caption, setCaption] = useState("");
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const next = [...files, ...Array.from(list)].slice(0, 10);
    setFiles(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  }

  function removeFile(i: number) {
    setFiles((cur) => cur.filter((_, idx) => idx !== i));
    setPreviews((cur) => {
      URL.revokeObjectURL(cur[i] ?? "");
      return cur.filter((_, idx) => idx !== i);
    });
  }

  async function submit() {
    if (files.length === 0) {
      toast.error("Add at least one image.");
      return;
    }
    setLoading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        toast.error("Sign in to post.");
        return;
      }

      const uploaded: { url: string; path: string }[] = [];
      for (const file of files) {
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
        uploaded.push({ url: signed.signedUrl, path });
      }

      const { data: post, error } = await supabase
        .from("posts")
        .insert({
          user_id: u.user.id,
          image_url: uploaded[0]!.url,
          storage_path: uploaded[0]!.path,
          caption: caption.trim() || null,
          prompt: prompt.trim() || null,
          source: "upload",
        } as never)
        .select("id")
        .single();
      if (error) throw error;

      if (uploaded.length > 1) {
        const rows = uploaded.map((img, i) => ({
          post_id: post.id,
          image_url: img.url,
          storage_path: img.path,
          sort_order: i,
        }));
        const { error: imgErr } = await supabase.from("post_images").insert(rows as never);
        if (imgErr) throw imgErr;
      }

      toast.success(uploaded.length > 1 ? "Story posted with carousel." : "Posted to the grid.");
      setCaption("");
      setPrompt("");
      setFiles([]);
      previews.forEach((p) => URL.revokeObjectURL(p));
      setPreviews([]);
      onPosted?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      if (/bucket not found/i.test(msg)) toast.error("Storage bucket missing. Run: npm run db:push");
      else if (/could not find the table|post_images/i.test(msg)) toast.error("Run migration: supabase/migrations/20260619100000_platform_v2_upgrade.sql");
      else toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="paper-card p-5 space-y-4">
      <div className="mono-label">NEW_STORY</div>
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

      {previews.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {previews.map((src, i) => (
            <div key={src} className="relative size-20 border border-line overflow-hidden">
              <img src={src} alt="" className="size-full object-cover" />
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="absolute top-0.5 right-0.5 bg-ink/70 text-paper rounded-full p-0.5"
                aria-label="Remove"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 border-2 border-dashed border-line py-6 hover:border-primary transition-colors">
          <ImagePlus className="size-5" />
          <span className="mono-label">{files.length ? "Add more images" : "Choose images (carousel story)"}</span>
          <input type="file" accept="image/*" multiple className="hidden" disabled={loading} onChange={(e) => addFiles(e.target.files)} />
        </label>
        <button type="button" disabled={loading || files.length === 0} onClick={submit} className="rust-button px-8 py-3 text-sm shrink-0">
          {loading ? "Posting…" : "Post"}
        </button>
      </div>
      {files.length > 1 && <p className="text-xs text-muted-foreground">{files.length} images will appear as one carousel story.</p>}
    </div>
  );
}
