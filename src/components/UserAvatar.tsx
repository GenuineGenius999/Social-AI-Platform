import { cn } from "@/lib/utils";

type Props = {
  avatarUrl?: string | null;
  username?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizes = { sm: "size-6 text-[10px]", md: "size-8 text-xs", lg: "size-12 text-lg" };

export function UserAvatar({ avatarUrl, username, size = "md", className }: Props) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className={cn(sizes[size], "shrink-0 rounded-full object-cover border border-line", className)}
      />
    );
  }
  return (
    <span
      className={cn(
        sizes[size],
        "shrink-0 rounded-full bg-paper-2 border border-line grid place-items-center font-mono uppercase",
        className,
      )}
    >
      {(username ?? "?")[0]}
    </span>
  );
}
