import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, MessageCircle, Star } from "lucide-react";
import { downloadUrl } from "@/lib/download-client";

export type FeedPost = {
  id: string;
  user_id: string;
  image_url: string;
  prompt: string | null;
  caption: string | null;
  created_at: string;
  source?: string;
};

type Profile = { id: string; username: string; display_name: string | null; avatar_url: string | null };

export const POST_REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "👏", "🎉"] as const;

export function useFeedQuery() {
  return useQuery({
    queryKey: ["feed"],
    queryFn: async () => {
      const { data: p } = await supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(50);
      const userIds = [...new Set((p ?? []).map((x) => x.user_id))];
      const { data: pr } = userIds.length
        ? await supabase.from("profiles").select("id,username,display_name,avatar_url").in("id", userIds)
        : { data: [] };
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
          ...(x as FeedPost),
          author: byId.get(x.user_id),
          avgRating: stats ? stats.sum / stats.count : null,
          reviewCount: stats?.count ?? 0,
        };
      });
    },
  });
}

export function FeedGrid({ showHeader = true }: { showHeader?: boolean }) {
  const qc = useQueryClient();
  const posts = useFeedQuery();

  useEffect(() => {
    const ch = supabase
      .channel("feed-posts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, () =>
        qc.invalidateQueries({ queryKey: ["feed"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "post_reviews" }, () =>
        qc.invalidateQueries({ queryKey: ["feed"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "post_reactions" }, () =>
        qc.invalidateQueries({ queryKey: ["feed"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "post_comments" }, () =>
        qc.invalidateQueries({ queryKey: ["feed"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  return (
    <div className={showHeader ? "p-4 lg:p-8" : ""}>
      {showHeader && (
        <>
          <div className="mono-label">/FEED</div>
          <h1 className="font-display text-5xl uppercase mt-1">Collective Output</h1>
          <p className="mt-2 text-muted-foreground max-w-xl">
            Discover renders from the community. React, comment, and leave star reviews.
          </p>
        </>
      )}
      <div className={`${showHeader ? "mt-8" : ""} max-w-2xl mx-auto flex flex-col gap-6`}>
        {(posts.data ?? []).map((p) => (
          <PostCard key={p.id} post={p} />
        ))}
        {posts.data?.length === 0 && (
          <div className="mono-label text-center py-12">No posts yet. Be the first — generate in Studio or upload an image.</div>
        )}
      </div>
    </div>
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function PostCard({
  post,
}: {
  post: FeedPost & { author?: Profile; avgRating: number | null; reviewCount: number };
}) {
  const [reactions, setReactions] = useState<{ emoji: string; user_id: string }[]>([]);
  const [commentCount, setCommentCount] = useState(0);
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState<{ id: string; content: string; user_id: string; created_at: string; username?: string }[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [me, setMe] = useState<string | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      setLoggedIn(!!u.user);
      setMe(u.user?.id ?? null);
      const [{ data: rx }, { count: cc }] = await Promise.all([
        supabase.from("post_reactions").select("emoji,user_id").eq("post_id", post.id),
        supabase.from("post_comments").select("*", { count: "exact", head: true }).eq("post_id", post.id),
      ]);
      setReactions((rx ?? []) as { emoji: string; user_id: string }[]);
      setCommentCount(cc ?? 0);
    })();
  }, [post.id]);

  const grouped = POST_REACTION_EMOJIS.map((emoji) => {
    const rs = reactions.filter((r) => r.emoji === emoji);
    return { emoji, count: rs.length, mine: me ? rs.some((r) => r.user_id === me) : false };
  }).filter((g) => g.count > 0);

  async function toggleReaction(emoji: string) {
    if (!me) {
      toast.error("Sign in to react.");
      return;
    }
    const mine = reactions.find((r) => r.emoji === emoji && r.user_id === me);
    if (mine) {
      await supabase.from("post_reactions").delete().eq("post_id", post.id).eq("user_id", me).eq("emoji", emoji);
      setReactions((cur) => cur.filter((r) => !(r.emoji === emoji && r.user_id === me)));
    } else {
      await supabase.from("post_reactions").insert({ post_id: post.id, user_id: me, emoji });
      setReactions((cur) => [...cur, { emoji, user_id: me }]);
    }
    setShowReactionPicker(false);
  }

  async function loadComments() {
    setShowComments(true);
    const { data } = await supabase.from("post_comments").select("*").eq("post_id", post.id).order("created_at", { ascending: true });
    const userIds = [...new Set((data ?? []).map((c) => c.user_id))];
    const { data: profiles } = userIds.length
      ? await supabase.from("profiles").select("id,username").in("id", userIds)
      : { data: [] };
    const byId = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.username]));
    setComments((data ?? []).map((c) => ({ ...c, username: byId[c.user_id] })));
  }

  async function addComment() {
    if (!comment.trim() || !me) return;
    const { data, error } = await supabase
      .from("post_comments")
      .insert({ post_id: post.id, user_id: me, content: comment.trim() })
      .select()
      .single();
    if (error) toast.error(error.message);
    else {
      const { data: prof } = await supabase.from("profiles").select("username").eq("id", me).single();
      setComments((c) => [...c, { ...data, username: prof?.username }]);
      setCommentCount((c) => c + 1);
      setComment("");
    }
  }

  const totalReactions = reactions.length;

  return (
    <article className="paper-card overflow-hidden">
      <div className="flex items-start gap-3 p-4 border-b border-line">
        <Link to="/post/$postId" params={{ postId: post.id }}>
          {post.author?.avatar_url ? (
            <img src={post.author.avatar_url} alt="" className="size-12 rounded-full border border-line object-cover" />
          ) : (
            <span className="size-12 rounded-full bg-paper-2 border border-line grid place-items-center font-mono text-lg">
              {post.author?.username?.[0] ?? "?"}
            </span>
          )}
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link to="/post/$postId" params={{ postId: post.id }} className="font-display text-lg uppercase hover:text-primary">
              {post.author?.display_name ?? post.author?.username ?? "anon"}
            </Link>
            <span className="mono-label">@{post.author?.username ?? "anon"}</span>
            {post.source === "upload" && <span className="text-[10px] bg-paper-2 px-1.5 py-0.5 rounded mono-label">UPLOAD</span>}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{timeAgo(post.created_at)}</div>
        </div>
        {post.avgRating !== null && (
          <div className="flex items-center gap-1 text-xs shrink-0">
            <Star className="size-3.5 fill-primary text-primary" />
            {post.avgRating.toFixed(1)}
          </div>
        )}
      </div>

      {(post.caption || post.prompt) && (
        <div className="px-4 py-3 text-sm leading-relaxed">
          {post.caption && <p>{post.caption}</p>}
          {post.prompt && !post.caption && <p className="text-muted-foreground italic">{post.prompt}</p>}
        </div>
      )}

      <Link to="/post/$postId" params={{ postId: post.id }} className="block bg-paper-2">
        <img src={post.image_url} alt={post.prompt ?? ""} className="w-full max-h-[520px] object-contain" loading="lazy" />
      </Link>

      <div className="px-4 py-2 border-t border-line">
        {grouped.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {grouped.map((g) => (
              <button
                key={g.emoji}
                type="button"
                onClick={() => toggleReaction(g.emoji)}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                  g.mine ? "border-primary bg-primary/10" : "border-line bg-card"
                }`}
              >
                {g.emoji} {g.count}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-4 py-1">
          <div className="relative">
            <button
              type="button"
              onClick={() => (loggedIn ? setShowReactionPicker((s) => !s) : toast.error("Sign in to react."))}
              className="mono-label flex items-center gap-1 hover:text-primary"
            >
              React {totalReactions > 0 && `· ${totalReactions}`}
            </button>
            {showReactionPicker && (
              <div className="absolute bottom-full left-0 mb-1 flex gap-1 border border-line bg-card px-2 py-1 rounded-full shadow-lg z-10">
                {POST_REACTION_EMOJIS.map((emoji) => (
                  <button key={emoji} type="button" onClick={() => toggleReaction(emoji)} className="text-lg hover:scale-125 transition-transform">
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={loadComments} className="mono-label flex items-center gap-1 hover:text-primary">
            <MessageCircle className="size-3.5" /> {commentCount} {commentCount === 1 ? "comment" : "comments"}
          </button>
          <button
            type="button"
            onClick={() => downloadUrl(post.image_url, `kinetik-${post.id.slice(0, 8)}.png`)}
            className="mono-label flex items-center gap-1 hover:text-primary"
          >
            <Download className="size-3.5" />
          </button>
          <Link to="/post/$postId" params={{ postId: post.id }} className="mono-label ml-auto flex items-center gap-1 hover:text-primary">
            <Star className="size-3.5" /> {post.reviewCount} reviews
          </Link>
        </div>
      </div>

      {showComments && (
        <div className="border-t border-line px-4 py-3 space-y-3 bg-paper-2/50">
          {comments.map((c) => (
            <div key={c.id} className="text-sm">
              <span className="mono-label mr-2">@{c.username ?? "user"}</span>
              <span>{c.content}</span>
            </div>
          ))}
          {comments.length === 0 && <p className="text-xs text-muted-foreground">No comments yet.</p>}
          {loggedIn ? (
            <div className="flex gap-2 pt-1">
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
              <Link to="/auth" className="text-primary hover:underline">
                Sign in
              </Link>{" "}
              to comment.
            </p>
          )}
        </div>
      )}
    </article>
  );
}
