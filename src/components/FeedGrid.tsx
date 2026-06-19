import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, MessageCircle, Star, Trash2 } from "lucide-react";
import { downloadUrl } from "@/lib/download-client";
import { PostMedia } from "@/components/PostMedia";
import { UserAvatar } from "@/components/UserAvatar";

export type FeedPost = {
  id: string;
  user_id: string;
  image_url: string;
  prompt: string | null;
  caption: string | null;
  created_at: string;
  source?: string;
  images?: string[];
};

type Profile = { id: string; username: string; display_name: string | null; avatar_url: string | null };

export const POST_REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "👏", "🎉"] as const;
const PAGE_SIZE = 6;

export function useFeedQuery() {
  return useQuery({
    queryKey: ["feed"],
    queryFn: async () => {
      const { data: p } = await supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(50);
      const userIds = [...new Set((p ?? []).map((x) => x.user_id))];
      const postIds = (p ?? []).map((x) => x.id);

      const [{ data: pr }, { data: imgs }, { data: reviewStats }, { data: allReactions }, { data: commentCounts }] =
        await Promise.all([
          userIds.length
            ? supabase.from("profiles").select("id,username,display_name,avatar_url").in("id", userIds)
            : Promise.resolve({ data: [] }),
          postIds.length
            ? supabase.from("post_images").select("post_id,image_url,sort_order").in("post_id", postIds).order("sort_order")
            : Promise.resolve({ data: [] }),
          postIds.length
            ? supabase.from("post_reviews").select("post_id,rating").in("post_id", postIds)
            : Promise.resolve({ data: [] }),
          postIds.length
            ? supabase.from("post_reactions").select("post_id,emoji,user_id").in("post_id", postIds)
            : Promise.resolve({ data: [] }),
          postIds.length
            ? supabase.from("post_comments").select("post_id").in("post_id", postIds)
            : Promise.resolve({ data: [] }),
        ]);

      const byId = new Map<string, Profile>((pr ?? []).map((u) => [u.id, u as Profile]));
      const imagesByPost = new Map<string, string[]>();
      for (const img of imgs ?? []) {
        const list = imagesByPost.get(img.post_id) ?? [];
        list.push(img.image_url);
        imagesByPost.set(img.post_id, list);
      }

      const ratingsByPost = new Map<string, { sum: number; count: number }>();
      for (const r of reviewStats ?? []) {
        const cur = ratingsByPost.get(r.post_id) ?? { sum: 0, count: 0 };
        cur.sum += r.rating;
        cur.count += 1;
        ratingsByPost.set(r.post_id, cur);
      }

      const reactionsByPost = new Map<string, { emoji: string; user_id: string }[]>();
      for (const r of allReactions ?? []) {
        const list = reactionsByPost.get(r.post_id) ?? [];
        list.push({ emoji: r.emoji, user_id: r.user_id });
        reactionsByPost.set(r.post_id, list);
      }

      const commentsByPost = new Map<string, number>();
      for (const c of commentCounts ?? []) {
        commentsByPost.set(c.post_id, (commentsByPost.get(c.post_id) ?? 0) + 1);
      }

      return (p ?? []).map((x) => {
        const stats = ratingsByPost.get(x.id);
        const extra = imagesByPost.get(x.id) ?? [];
        const allImages = extra.length > 0 ? extra : [x.image_url];
        return {
          ...(x as FeedPost),
          images: allImages,
          author: byId.get(x.user_id),
          avgRating: stats ? stats.sum / stats.count : null,
          reviewCount: stats?.count ?? 0,
          reactions: reactionsByPost.get(x.id) ?? [],
          commentCount: commentsByPost.get(x.id) ?? 0,
        };
      });
    },
  });
}

export function FeedGrid({
  showHeader = true,
  limit,
  showMoreButton = false,
}: {
  showHeader?: boolean;
  limit?: number;
  showMoreButton?: boolean;
}) {
  const qc = useQueryClient();
  const posts = useFeedQuery();
  const [visibleCount, setVisibleCount] = useState(limit ?? PAGE_SIZE);
  const [me, setMe] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      setMe(data.user?.id ?? null);
      if (data.user) {
        const { data: prof } = await supabase.from("profiles").select("is_admin").eq("id", data.user.id).single();
        setIsAdmin(!!(prof as { is_admin?: boolean } | null)?.is_admin);
      }
    });
  }, []);

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

  const all = posts.data ?? [];
  const shown = showMoreButton ? all.slice(0, visibleCount) : limit ? all.slice(0, limit) : all;
  const hasMore = showMoreButton && visibleCount < all.length;

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
        {shown.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            me={me}
            isAdmin={isAdmin}
            onDeleted={() => qc.invalidateQueries({ queryKey: ["feed"] })}
          />
        ))}
        {all.length === 0 && !posts.isLoading && (
          <div className="mono-label text-center py-12">No posts yet. Be the first — generate in Studio or upload an image.</div>
        )}
        {hasMore && (
          <button
            type="button"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            className="ink-button w-full py-3 text-sm"
          >
            Show more ({all.length - visibleCount} remaining)
          </button>
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
  me,
  isAdmin,
  onDeleted,
}: {
  post: FeedPost & {
    author?: Profile;
    avgRating: number | null;
    reviewCount: number;
    reactions: { emoji: string; user_id: string }[];
    commentCount: number;
  };
  me: string | null;
  isAdmin: boolean;
  onDeleted: () => void;
}) {
  const [reactions, setReactions] = useState(post.reactions);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState<{ id: string; content: string; user_id: string; created_at: string; username?: string }[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canDelete = me && (post.user_id === me || isAdmin);

  const grouped = useMemo(
    () =>
      POST_REACTION_EMOJIS.map((emoji) => {
        const rs = reactions.filter((r) => r.emoji === emoji);
        return { emoji, count: rs.length, mine: me ? rs.some((r) => r.user_id === me) : false };
      }).filter((g) => g.count > 0),
    [reactions, me],
  );

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

  async function deletePost() {
    if (!canDelete || deleting) return;
    if (!confirm(isAdmin && post.user_id !== me ? "Delete this post as admin?" : "Delete your post?")) return;
    setDeleting(true);
    const { error } = await supabase.from("posts").delete().eq("id", post.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Post deleted");
      onDeleted();
    }
    setDeleting(false);
  }

  const totalReactions = reactions.length;
  const images = post.images ?? [post.image_url];

  return (
    <article className="paper-card overflow-hidden">
      <div className="flex items-start gap-3 p-4 border-b border-line">
        <Link to="/post/$postId" params={{ postId: post.id }}>
          <UserAvatar avatarUrl={post.author?.avatar_url} username={post.author?.username} size="lg" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link to="/post/$postId" params={{ postId: post.id }} className="font-display text-lg uppercase hover:text-primary">
              {post.author?.display_name ?? post.author?.username ?? "anon"}
            </Link>
            <span className="mono-label">@{post.author?.username ?? "anon"}</span>
            {post.source === "upload" && <span className="text-[10px] bg-paper-2 px-1.5 py-0.5 rounded mono-label">UPLOAD</span>}
            {images.length > 1 && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded mono-label">CAROUSEL</span>}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{timeAgo(post.created_at)}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {post.avgRating !== null && (
            <div className="flex items-center gap-1 text-xs">
              <Star className="size-3.5 fill-primary text-primary" />
              {post.avgRating.toFixed(1)}
            </div>
          )}
          {canDelete && (
            <button type="button" onClick={deletePost} disabled={deleting} className="text-muted-foreground hover:text-destructive p-1" title="Delete post">
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      </div>

      {(post.caption || post.prompt) && (
        <div className="px-4 py-3 text-sm leading-relaxed">
          {post.caption && <p>{post.caption}</p>}
          {post.prompt && !post.caption && <p className="text-muted-foreground italic">{post.prompt}</p>}
        </div>
      )}

      <Link to="/post/$postId" params={{ postId: post.id }} className="block bg-paper-2">
        <PostMedia images={images} alt={post.prompt ?? ""} />
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
              onClick={() => (me ? setShowReactionPicker((s) => !s) : toast.error("Sign in to react."))}
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
            onClick={() => downloadUrl(images[0]!, `kinetik-${post.id.slice(0, 8)}.png`)}
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
          {me ? (
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
