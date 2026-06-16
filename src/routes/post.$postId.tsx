import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { PublicShell } from "@/components/PublicShell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Download, Star } from "lucide-react";
import { POST_REACTION_EMOJIS } from "@/components/FeedGrid";
import { downloadUrl } from "@/lib/download-client";

export const Route = createFileRoute("/post/$postId")({
  ssr: false,
  component: PostDetail,
});

type Post = {
  id: string;
  user_id: string;
  image_url: string;
  prompt: string | null;
  caption: string | null;
  created_at: string;
};

type Review = {
  id: string;
  user_id: string;
  rating: number;
  review: string | null;
  created_at: string;
};

function PostDetail() {
  const { postId } = Route.useParams();
  const qc = useQueryClient();
  const [me, setMe] = useState<string | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [reactions, setReactions] = useState<{ emoji: string; user_id: string }[]>([]);
  const [comments, setComments] = useState<{ id: string; content: string; user_id: string; username?: string }[]>([]);
  const [comment, setComment] = useState("");
  const [showReactionPicker, setShowReactionPicker] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setMe(data.user?.id ?? null);
      setAuthed(!!data.user);
    });
  }, []);

  const post = useQuery({
    queryKey: ["post", postId],
    queryFn: async () => {
      const { data: p, error } = await supabase.from("posts").select("*").eq("id", postId).single();
      if (error) throw error;
      const { data: author } = await supabase
        .from("profiles")
        .select("id,username,display_name,avatar_url")
        .eq("id", p.user_id)
        .single();
      return { ...(p as Post), author };
    },
  });

  const reviews = useQuery({
    queryKey: ["reviews", postId],
    queryFn: async () => {
      const { data } = await supabase.from("post_reviews").select("*").eq("post_id", postId).order("created_at", { ascending: false });
      const userIds = [...new Set((data ?? []).map((r) => r.user_id))];
      const { data: profiles } = userIds.length
        ? await supabase.from("profiles").select("id,username,display_name").in("id", userIds)
        : { data: [] };
      const byId = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));
      return (data ?? []).map((r) => ({ ...(r as Review), author: byId[r.user_id] }));
    },
  });

  useEffect(() => {
    if (!me) return;
    (async () => {
      const [{ count }, mine, { data: rx }, { data: cmts }] = await Promise.all([
        supabase.from("post_likes").select("*", { count: "exact", head: true }).eq("post_id", postId),
        supabase.from("post_likes").select("*").eq("post_id", postId).eq("user_id", me).maybeSingle(),
        supabase.from("post_reactions").select("emoji,user_id").eq("post_id", postId),
        supabase.from("post_comments").select("*").eq("post_id", postId).order("created_at", { ascending: true }),
      ]);
      setLikeCount(count ?? 0);
      setLiked(!!mine.data);
      setReactions((rx ?? []) as { emoji: string; user_id: string }[]);
      const userIds = [...new Set((cmts ?? []).map((c) => c.user_id))];
      const { data: profiles } = userIds.length
        ? await supabase.from("profiles").select("id,username").in("id", userIds)
        : { data: [] };
      const byId = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.username]));
      setComments((cmts ?? []).map((c) => ({ ...c, username: byId[c.user_id] })));
    })();
  }, [me, postId]);

  useEffect(() => {
    const ch = supabase
      .channel(`post-${postId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "post_reviews", filter: `post_id=eq.${postId}` }, () => {
        qc.invalidateQueries({ queryKey: ["reviews", postId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [postId, qc]);

  async function toggleLike() {
    if (!me) {
      toast.error("Sign in to like posts.");
      return;
    }
    if (liked) {
      await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", me);
      setLiked(false);
      setLikeCount((c) => c - 1);
    } else {
      await supabase.from("post_likes").insert({ post_id: postId, user_id: me });
      setLiked(true);
      setLikeCount((c) => c + 1);
    }
  }

  async function toggleReaction(emoji: string) {
    if (!me) {
      toast.error("Sign in to react.");
      return;
    }
    const mine = reactions.find((r) => r.emoji === emoji && r.user_id === me);
    if (mine) {
      await supabase.from("post_reactions").delete().eq("post_id", postId).eq("user_id", me).eq("emoji", emoji);
      setReactions((cur) => cur.filter((r) => !(r.emoji === emoji && r.user_id === me)));
    } else {
      await supabase.from("post_reactions").insert({ post_id: postId, user_id: me, emoji });
      setReactions((cur) => [...cur, { emoji, user_id: me }]);
    }
    setShowReactionPicker(false);
  }

  async function addComment() {
    if (!comment.trim() || !me) return;
    const { data, error } = await supabase
      .from("post_comments")
      .insert({ post_id: postId, user_id: me, content: comment.trim() })
      .select()
      .single();
    if (error) toast.error(error.message);
    else {
      const { data: prof } = await supabase.from("profiles").select("username").eq("id", me).single();
      setComments((c) => [...c, { ...data, username: prof?.username }]);
      setComment("");
    }
  }

  async function submitReview() {
    if (!me) {
      toast.error("Sign in to leave a review.");
      return;
    }
    const { error } = await supabase.from("post_reviews").upsert(
      {
        post_id: postId,
        user_id: me,
        rating,
        review: reviewText.trim() || null,
      },
      { onConflict: "post_id,user_id" },
    );
    if (error) toast.error(error.message);
    else {
      toast.success("Review submitted");
      setReviewText("");
      qc.invalidateQueries({ queryKey: ["reviews", postId] });
    }
  }

  const avgRating = reviews.data?.length
    ? (reviews.data.reduce((s, r) => s + r.rating, 0) / reviews.data.length).toFixed(1)
    : null;

  const body = (() => {
    if (post.isLoading) return <div className="p-8 mono-label">Loading post...</div>;
    if (!post.data) {
      return (
        <div className="p-8">
          <Link to="/feed" className="mono-label hover:text-primary">
            ← Back to grid
          </Link>
          <p className="mt-4">Post not found.</p>
        </div>
      );
    }

    const p = post.data;
    const grouped = POST_REACTION_EMOJIS.map((emoji) => {
      const rs = reactions.filter((r) => r.emoji === emoji);
      return { emoji, count: rs.length, mine: me ? rs.some((r) => r.user_id === me) : false };
    }).filter((g) => g.count > 0);

    return (
      <div className="p-4 lg:p-8 max-w-2xl mx-auto">
        <Link to="/feed" className="inline-flex items-center gap-2 mono-label hover:text-primary mb-6">
          <ArrowLeft className="size-4" /> Back to feed
        </Link>

        <article className="paper-card overflow-hidden">
          <div className="flex items-start gap-3 p-4 border-b border-line">
            {p.author?.avatar_url ? (
              <img src={p.author.avatar_url} alt="" className="size-12 rounded-full border border-line object-cover" />
            ) : (
              <span className="size-12 rounded-full bg-paper-2 border border-line grid place-items-center font-mono text-lg">
                {p.author?.username?.[0] ?? "?"}
              </span>
            )}
            <div>
              <h1 className="font-display text-2xl uppercase">{p.author?.display_name ?? p.author?.username ?? "maker"}</h1>
              <div className="mono-label">@{p.author?.username ?? "maker"}</div>
            </div>
          </div>

          {(p.caption || p.prompt) && (
            <div className="px-4 py-3 text-sm leading-relaxed border-b border-line">
              {p.caption && <p>{p.caption}</p>}
              {p.prompt && (
                <div className="mt-3 p-3 bg-paper-2 border border-line rounded-sm">
                  <div className="mono-label mb-1">PROMPT</div>
                  <p className="font-mono text-xs">{p.prompt}</p>
                </div>
              )}
            </div>
          )}

          <div className="relative bg-paper-2">
            <img src={p.image_url} alt={p.prompt ?? "Post image"} className="w-full max-h-[600px] object-contain" />
            <button
              type="button"
              onClick={() => downloadUrl(p.image_url, `kinetik-${p.id.slice(0, 8)}.png`)}
              className="absolute top-3 right-3 bg-black/60 text-white p-2 rounded-full hover:bg-black/80"
            >
              <Download className="size-4" />
            </button>
          </div>

          <div className="px-4 py-3 border-t border-line space-y-3">
            {grouped.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {grouped.map((g) => (
                  <button
                    key={g.emoji}
                    type="button"
                    onClick={() => toggleReaction(g.emoji)}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${g.mine ? "border-primary bg-primary/10" : "border-line bg-card"}`}
                  >
                    {g.emoji} {g.count}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-4">
              <div className="relative">
                <button type="button" onClick={() => setShowReactionPicker((s) => !s)} className="mono-label hover:text-primary">
                  React
                </button>
                {showReactionPicker && (
                  <div className="absolute bottom-full left-0 mb-1 flex gap-1 border border-line bg-card px-2 py-1 rounded-full shadow-lg z-10">
                    {POST_REACTION_EMOJIS.map((emoji) => (
                      <button key={emoji} type="button" onClick={() => toggleReaction(emoji)} className="text-lg">
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button type="button" onClick={toggleLike} className={`mono-label ${liked ? "text-primary" : ""}`}>
                ♥ {likeCount}
              </button>
              {avgRating && (
                <div className="flex items-center gap-1 mono-label">
                  <Star className="size-3.5 fill-primary text-primary" />
                  {avgRating} ({reviews.data?.length})
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-line px-4 py-4 space-y-3 bg-paper-2/50">
            <div className="mono-label">Comments ({comments.length})</div>
            {comments.map((c) => (
              <div key={c.id} className="text-sm">
                <span className="mono-label mr-2">@{c.username ?? "user"}</span>
                {c.content}
              </div>
            ))}
            {me ? (
              <div className="flex gap-2 pt-2">
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addComment()}
                  placeholder="Add a comment..."
                  className="flex-1 border border-line bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
                <button type="button" onClick={addComment} className="ink-button px-4 py-2 text-xs">
                  Post
                </button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                <Link to="/auth" className="text-primary hover:underline">Sign in</Link> to comment.
              </p>
            )}
          </div>

          <div className="border-t border-line p-4 space-y-4">
            {me ? (
              <div className="space-y-3">
                <div className="mono-label">WRITE A REVIEW</div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setRating(n)} className={`p-1 ${n <= rating ? "text-primary" : "text-muted-foreground"}`}>
                      <Star className={`size-5 ${n <= rating ? "fill-primary" : ""}`} />
                    </button>
                  ))}
                </div>
                <textarea
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  placeholder="Share your thoughts..."
                  rows={3}
                  className="w-full border border-line bg-background p-3 text-sm focus:border-primary focus:outline-none resize-none"
                />
                <button type="button" onClick={submitReview} className="rust-button px-6 py-2 text-sm">
                  Submit review
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                <Link to="/auth" className="text-primary hover:underline">Sign in</Link> to review.
              </p>
            )}

            <div className="space-y-3">
              <div className="mono-label">REVIEWS ({reviews.data?.length ?? 0})</div>
              {(reviews.data ?? []).map((r) => (
                <div key={r.id} className="border border-line p-3 bg-card">
                  <div className="flex items-center justify-between mb-1">
                    <span className="mono-label">@{r.author?.username ?? "user"}</span>
                    <span className="flex items-center gap-0.5 text-primary">
                      {Array.from({ length: r.rating }).map((_, i) => (
                        <Star key={i} className="size-3 fill-primary" />
                      ))}
                    </span>
                  </div>
                  {r.review && <p className="text-sm">{r.review}</p>}
                </div>
              ))}
            </div>
          </div>
        </article>
      </div>
    );
  })();

  if (authed === null) return <div className="min-h-screen grid place-items-center mono-label">Loading…</div>;
  if (authed) return <AppShell>{body}</AppShell>;
  return <PublicShell>{body}</PublicShell>;
}
