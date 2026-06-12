import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MessageCircle, Star } from "lucide-react";

export const Route = createFileRoute("/_authenticated/feed")({ component: Feed });

type Post = { id: string; user_id: string; image_url: string; prompt: string | null; caption: string | null; created_at: string };
type Profile = { id: string; username: string; display_name: string | null; avatar_url: string | null };

function Feed() {
  const qc = useQueryClient();
  const posts = useQuery({
    queryKey: ["feed"],
    queryFn: async () => {
      const { data: p } = await supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(50);
      const userIds = [...new Set((p ?? []).map((x) => x.user_id))];
      const { data: pr } = userIds.length ? await supabase.from("profiles").select("id,username,display_name,avatar_url").in("id", userIds) : { data: [] };
      const byId = new Map<string, Profile>((pr ?? []).map((u) => [u.id, u as Profile]));

      const postIds = (p ?? []).map((x) => x.id);
      const { data: reviewStats } = postIds.length
        ? await supabase.from("post_reviews").select("post_id,rating").in("post_id", postIds)
        : { data: [] };
      const ratingsByPost = new Map<string, { sum: number; count: number }>();
      for (const r of reviewStats ?? []) {
        const cur = ratingsByPost.get(r.post_id) ?? { sum: 0, count: 0 };
        cur.sum += r.rating;
        cur.count += 1;
        ratingsByPost.set(r.post_id, cur);
      }

      return (p ?? []).map((x) => {
        const stats = ratingsByPost.get(x.id);
        return {
          ...(x as Post),
          author: byId.get(x.user_id),
          avgRating: stats ? stats.sum / stats.count : null,
          reviewCount: stats?.count ?? 0,
        };
      });
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("feed-posts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, () => qc.invalidateQueries({ queryKey: ["feed"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "post_reviews" }, () => qc.invalidateQueries({ queryKey: ["feed"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  return (
    <AppShell>
      <div className="p-4 lg:p-8">
        <div className="mono-label">/PUBLIC_GRID</div>
        <h1 className="font-display text-5xl uppercase mt-1">Collective Output</h1>
        <p className="mt-2 text-muted-foreground max-w-xl">Discover renders from the community. Like, comment, and leave star reviews.</p>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {(posts.data ?? []).map((p) => <PostCard key={p.id} post={p} />)}
          {posts.data?.length === 0 && <div className="mono-label col-span-full">No posts yet. Be the first — render something in Studio.</div>}
        </div>
      </div>
    </AppShell>
  );
}

function PostCard({ post }: { post: Post & { author?: Profile; avgRating: number | null; reviewCount: number } }) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState<{ id: string; content: string; user_id: string; created_at: string }[]>([]);
  const [showComments, setShowComments] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const [{ count: lc }, { count: cc }, mine] = await Promise.all([
        supabase.from("post_likes").select("*", { count: "exact", head: true }).eq("post_id", post.id),
        supabase.from("post_comments").select("*", { count: "exact", head: true }).eq("post_id", post.id),
        u.user ? supabase.from("post_likes").select("*").eq("post_id", post.id).eq("user_id", u.user.id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      setLikeCount(lc ?? 0);
      setCommentCount(cc ?? 0);
      setLiked(!!mine.data);
    })();
  }, [post.id]);

  async function toggleLike() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    if (liked) {
      await supabase.from("post_likes").delete().eq("post_id", post.id).eq("user_id", u.user.id);
      setLiked(false); setLikeCount((c) => c - 1);
    } else {
      await supabase.from("post_likes").insert({ post_id: post.id, user_id: u.user.id });
      setLiked(true); setLikeCount((c) => c + 1);
    }
  }

  async function loadComments() {
    setShowComments(true);
    const { data } = await supabase.from("post_comments").select("*").eq("post_id", post.id).order("created_at", { ascending: true });
    setComments(data ?? []);
  }

  async function addComment() {
    if (!comment.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data, error } = await supabase.from("post_comments").insert({ post_id: post.id, user_id: u.user.id, content: comment.trim() }).select().single();
    if (error) toast.error(error.message);
    else { setComments((c) => [...c, data]); setCommentCount((c) => c + 1); setComment(""); }
  }

  return (
    <article className="paper-card overflow-hidden group">
      <Link to="/post/$postId" params={{ postId: post.id }} className="block relative aspect-[4/5] bg-paper-2 grain overflow-hidden">
        <img src={post.image_url} alt={post.prompt ?? ""} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-4">
          <div className="flex items-center gap-2">
            {post.author?.avatar_url ? (
              <img src={post.author.avatar_url} alt="" className="size-7 rounded-full border border-white/30 object-cover" />
            ) : (
              <span className="size-7 rounded-full bg-white/20 grid place-items-center text-xs font-mono text-white">{post.author?.username?.[0] ?? "?"}</span>
            )}
            <div className="mono-label text-white/90">@{post.author?.username ?? "anon"}</div>
          </div>
          {post.caption && <p className="text-white text-sm mt-2 line-clamp-2">{post.caption}</p>}
        </div>
        {post.avgRating !== null && (
          <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/60 text-white px-2 py-1 rounded-full text-xs">
            <Star className="size-3 fill-primary text-primary" />
            {post.avgRating.toFixed(1)}
          </div>
        )}
      </Link>
      <div className="flex items-center gap-4 border-t border-line px-4 py-3">
        <button type="button" onClick={toggleLike} className={`mono-label flex items-center gap-1 ${liked ? "text-primary" : ""}`}>♥ {likeCount}</button>
        <button type="button" onClick={loadComments} className="mono-label flex items-center gap-1">
          <MessageCircle className="size-3.5" /> {commentCount}
        </button>
        <Link to="/post/$postId" params={{ postId: post.id }} className="mono-label ml-auto flex items-center gap-1 hover:text-primary">
          <Star className="size-3.5" /> {post.reviewCount} reviews
        </Link>
      </div>
      {showComments && (
        <div className="border-t border-line p-4 space-y-2">
          {comments.map((c) => (
            <div key={c.id} className="text-xs"><span className="mono-label mr-2">USER</span>{c.content}</div>
          ))}
          <div className="flex gap-2 pt-2">
            <input value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addComment()} placeholder="Comment..." className="flex-1 border border-line bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none" />
            <button type="button" onClick={addComment} className="ink-button px-3 py-1 text-xs">Send</button>
          </div>
        </div>
      )}
    </article>
  );
}
