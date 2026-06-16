import { useRef, useState } from "react";
import { ImagePlus, Smile } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { REACTION_EMOJIS } from "@/lib/chat.types";
import { toast } from "sonner";

const CHAT_EMOJIS = [...REACTION_EMOJIS, "🎉", "💯", "🙌", "😊", "🤔", "👀", "✨"];

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSend: (payload: { content: string; imageUrl?: string | null }) => void;
  placeholder: string;
  me: string;
};

export function ChatInput({ value, onChange, onSend, placeholder, me }: Props) {
  const [uploading, setUploading] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadImage(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${me}/chat/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("generated-images").upload(path, file, {
        contentType: file.type || "image/png",
      });
      if (upErr) throw upErr;
      const { data: signed, error: signErr } = await supabase.storage
        .from("generated-images")
        .createSignedUrl(path, 60 * 60 * 24 * 30);
      if (signErr || !signed) throw signErr ?? new Error("Could not sign URL");
      setPendingImage(signed.signedUrl);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Image upload failed");
    } finally {
      setUploading(false);
    }
  }

  function send() {
    if (!value.trim() && !pendingImage) return;
    onSend({ content: value.trim(), imageUrl: pendingImage });
    onChange("");
    setPendingImage(null);
    setShowEmoji(false);
  }

  return (
    <div className="border-t border-line p-4">
      {pendingImage && (
        <div className="mb-2 relative inline-block">
          <img src={pendingImage} alt="" className="max-h-32 rounded border border-line" />
          <button
            type="button"
            onClick={() => setPendingImage(null)}
            className="absolute -top-2 -right-2 size-5 rounded-full bg-ink text-paper text-xs"
          >
            ×
          </button>
        </div>
      )}
      <div className="flex gap-2 items-end">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setShowEmoji((s) => !s)}
            className="border border-line p-2.5 hover:bg-paper-2"
            aria-label="Emoji"
          >
            <Smile className="size-4" />
          </button>
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="border border-line p-2.5 hover:bg-paper-2 disabled:opacity-50"
            aria-label="Attach image"
          >
            <ImagePlus className="size-4" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadImage(f);
              e.target.value = "";
            }}
          />
        </div>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder={placeholder}
          className="flex-1 border border-line bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none rounded-sm"
        />
        <button type="button" onClick={send} disabled={uploading} className="rust-button px-6">
          Send
        </button>
      </div>
      {showEmoji && (
        <div className="mt-2 flex flex-wrap gap-1 border border-line bg-card p-2 rounded-sm">
          {CHAT_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onChange(value + emoji)}
              className="text-lg p-1 hover:bg-paper-2 rounded"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
