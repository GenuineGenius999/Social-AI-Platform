export type MessageChannel = "global" | "direct" | "group";

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url?: string | null;
};

export type Reaction = {
  id: string;
  message_id: string;
  channel: MessageChannel;
  user_id: string;
  emoji: string;
};

export const REACTION_EMOJIS = ["👍", "❤️", "🔥", "😂", "😮", "👏"] as const;
