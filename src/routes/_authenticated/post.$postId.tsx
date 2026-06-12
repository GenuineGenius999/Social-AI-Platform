import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Star } from "lucide-react";

export const Route = createFileRoute("/_authenticated/post/$postId")({ component: PostDetail });

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
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  const post = useQuery({
    queryKey: ["post", postId],
    queryFn: async () => {
      const { data: p, error } = await supabase.from("posts").select("*").eq("id", postId).single();
      if (error) throw error;
      const { data: author } = await supabase.from("profiles").select("id,username,display_name,avatar_url").eq("id", p.user_id).single();
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
      const [{ count }, mine] = await Promise.all([
        supabase.from("post_likes").select("*", { count: "exact", head: true }).eq("post_id", postId),
        supabase.from("post_likes").select("*").eq("post_id", postId).eq("user_id", me).maybeSingle(),
      ]);
      setLikeCount(count ?? 0);
      setLiked(!!mine.data);
    })();
  }, [me, postId]);

  useEffect(() => {
    const ch = supabase
      .channel(`post-${postId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "post_reviews", filter: `post_id=eq.${postId}` }, () => {
        qc.invalidateQueries({ queryKey: ["reviews", postId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [postId, qc]);

  async function toggleLike() {
    if (!me) return;
    if (liked) {
      await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", me);
      setLiked(false); setLikeCount((c) => c - 1);
    } else {
      await supabase.from("post_likes").insert({ post_id: postId, user_id: me });
      setLiked(true); setLikeCount((c) => c + 1);
    }
  }

  async function submitReview() {
    if (!me) return;
    const { error } = await supabase.from("post_reviews").upsert({
      post_id: postId,
      user_id: me,
      rating,
      review: reviewText.trim() || null,
    }, { onConflict: "post_id,user_id" });
    if (error) toast.error(error.message);
    else { toast.success("Review submitted"); setReviewText(""); qc.invalidateQueries({ queryKey: ["reviews", postId] }); }
  }

  const avgRating = reviews.data?.length
    ? (reviews.data.reduce((s, r) => s + r.rating, 0) / reviews.data.length).toFixed(1)
    : null;

  if (post.isLoading) {
    return (
      <AppShell>
        <div className="p-8 mono-label">Loading post...</div>
      </AppShell>
    );
  }

  if (!post.data) {
    return (
      <AppShell>
        <div className="p-8">
          <Link to="/feed" className="mono-label hover:text-primary">← Back to grid</Link>
          <p className="mt-4">Post not found.</p>
        </div>
      </AppShell>
    );
  }

  const p = post.data;

  return (
    <AppShell>
      <div className="p-4 lg:p-8 max-w-5xl mx-auto">
        <Link to="/feed" className="inline-flex items-center gap-2 mono-label hover:text-primary mb-6">
          <ArrowLeft className="size-4" /> Back to grid
        </Link>

        <div className="grid gap-8 lg:grid-cols-2">
          <div className="paper-card overflow-hidden grain">
            <img src={p.image_url} alt={p.prompt ?? "Generated image"} className="w-full aspect-square object-cover" />
          </div>

          <div className="space-y-6">
            <div>
              <div className="mono-label">POST_DETAIL</div>
              <h1 className="font-display text-4xl uppercase mt-1">
                @{p.author?.username ?? "maker"}
              </h1>
              {p.caption && <p className="mt-3 text-lg">{p.caption}</p>}
              {p.prompt && (
                <div className="mt-4 p-4 bg-paper-2 border border-line rounded-sm">
                  <div className="mono-label mb-1">PROMPT</div>
                  <p className="text-sm font-mono leading-relaxed">{p.prompt}</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-6">
              <button type="button" onClick={toggleLike} className={`flex items-center gap-2 mono-label text-lg ${liked ? "text-primary" : ""}`}>
                ♥ {likeCount}
              </button>
              {avgRating && (
                <div className="flex items-center gap-1 mono-label">
                  <Star className="size-4 fill-primary text-primary" />
                  {avgRating} ({reviews.data?.length} reviews)
                </div>
              )}
            </div>

            <div className="paper-card p-5 space-y-4">
              <div className="mono-label">WRITE A REVIEW</div>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    className={`p-1 ${n <= rating ? "text-primary" : "text-muted-foreground"}`}
                  >
                    <Star className={`size-6 ${n <= rating ? "fill-primary" : ""}`} />
                  </button>
                ))}
              </div>
              <textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Share your thoughts on this render..."
                rows={3}
                className="w-full border border-line bg-background p-3 text-sm focus:border-primary focus:outline-none resize-none"
              />
              <button type="button" onClick={submitReview} className="rust-button px-6 py-2 text-sm">Submit review</button>
            </div>

            <div className="space-y-3">
              <div className="mono-label">REVIEWS ({reviews.data?.length ?? 0})</div>
              {(reviews.data ?? []).map((r) => (
                <div key={r.id} className="paper-card p-4">
                  <div className="flex items-center justify-between mb-2">
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
              {(reviews.data ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">No reviews yet. Be the first to critique this render.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
