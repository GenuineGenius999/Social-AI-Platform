import { useState } from "react";
import { MoreHorizontal, Trash2, Ban, EyeOff } from "lucide-react";
import type { MessageChannel, Profile, Reaction } from "@/lib/chat.types";
import { REACTION_EMOJIS } from "@/lib/chat.types";

type Props = {
  id: string;
  content: string;
  imageUrl?: string | null;
  channel: MessageChannel;
  isOwn: boolean;
  author?: Profile;
  reactions: Reaction[];
  me: string;
  onReact: (emoji: string) => void;
  onDelete?: () => void;
  onHide?: () => void;
  onBlock?: () => void;
};

export function MessageBubble({
  id,
  content,
  imageUrl,
  isOwn,
  author,
  reactions,
  me,
  onReact,
  onDelete,
  onHide,
  onBlock,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showReactions, setShowReactions] = useState(false);

  const grouped = REACTION_EMOJIS.map((emoji) => {
    const rs = reactions.filter((r) => r.emoji === emoji);
    return { emoji, count: rs.length, mine: rs.some((r) => r.user_id === me) };
  }).filter((g) => g.count > 0);

  return (
    <div className={`group relative flex gap-3 ${isOwn ? "flex-row-reverse" : ""}`}>
      {author?.avatar_url ? (
        <img src={author.avatar_url} alt="" className="size-8 shrink-0 rounded-full object-cover border border-line" />
      ) : (
        <div className="size-8 shrink-0 rounded-full bg-paper-2 border border-line grid place-items-center text-xs font-mono uppercase">
          {(author?.username ?? "?")[0]}
        </div>
      )}
      <div className={`max-w-[75%] ${isOwn ? "items-end" : "items-start"} flex flex-col`}>
        {!isOwn && author && (
          <span className="mono-label mb-1">@{author.username}</span>
        )}
        <div
          className={`relative px-4 py-2.5 text-sm leading-relaxed ${
            isOwn
              ? "bg-ink text-paper rounded-2xl rounded-tr-sm"
              : "bg-card border border-line rounded-2xl rounded-tl-sm"
          }`}
        >
          {imageUrl && (
            <a href={imageUrl} target="_blank" rel="noreferrer" className="block mb-2">
              <img src={imageUrl} alt="" className="max-w-full max-h-64 rounded-lg border border-line/50" />
            </a>
          )}
          {content && <p className="whitespace-pre-wrap">{content}</p>}
          <div className="absolute -bottom-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
            <button
              type="button"
              onClick={() => setShowReactions((s) => !s)}
              className="bg-card border border-line rounded-full px-2 py-0.5 text-xs shadow-sm hover:border-primary"
              aria-label="React"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen((s) => !s)}
              className="bg-card border border-line rounded-full p-1 shadow-sm hover:border-primary"
              aria-label="Options"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </div>
        </div>

        {showReactions && (
          <div className="mt-2 flex gap-1 rounded-full border border-line bg-card px-2 py-1 shadow-sm">
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => { onReact(emoji); setShowReactions(false); }}
                className="text-lg hover:scale-125 transition-transform"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {grouped.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {grouped.map((g) => (
              <button
                key={g.emoji}
                type="button"
                onClick={() => onReact(g.emoji)}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                  g.mine ? "border-primary bg-primary/10" : "border-line bg-card"
                }`}
              >
                {g.emoji} {g.count}
              </button>
            ))}
          </div>
        )}

        {menuOpen && (
          <div className="mt-1 z-10 rounded-md border border-line bg-card shadow-lg py-1 min-w-[140px]">
            {isOwn && onDelete && (
              <button type="button" onClick={() => { onDelete(); setMenuOpen(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-paper-2">
                <Trash2 className="size-3.5" /> Delete
              </button>
            )}
            {onHide && (
              <button type="button" onClick={() => { onHide(); setMenuOpen(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-paper-2">
                <EyeOff className="size-3.5" /> Hide
              </button>
            )}
            {!isOwn && onBlock && (
              <button type="button" onClick={() => { onBlock(); setMenuOpen(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-paper-2">
                <Ban className="size-3.5" /> Block user
              </button>
            )}
          </div>
        )}
      </div>
      <span className="sr-only">Message {id}</span>
    </div>
  );
}
