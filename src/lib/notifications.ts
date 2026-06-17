import { supabase } from "@/integrations/supabase/client";

export type NotificationType =
  | "new_post"
  | "new_message"
  | "new_comment"
  | "new_like"
  | "new_group_message"
  | "new_global_message"
  | "system";

export type AppNotification = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  style_idx: number;
  read_at: string | null;
  created_at: string;
};

export const NOTIFICATION_STYLE_COUNT = 8;

export const NOTIFICATION_STYLE_LABELS = [
  "Amber slide",
  "Blue sweep",
  "Green bounce",
  "Purple fade",
  "Red shake",
  "Orange glow",
  "Teal pulse",
  "Pink scale",
] as const;

export function randomStyleIdx() {
  return Math.floor(Math.random() * NOTIFICATION_STYLE_COUNT);
}

export function notificationStyleClass(styleIdx: number) {
  return `notify-style-${styleIdx % NOTIFICATION_STYLE_COUNT}`;
}

export async function createNotification(input: {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}) {
  const { data, error } = await supabase
    .from("notifications")
    .insert({
      user_id: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      style_idx: randomStyleIdx(),
    })
    .select()
    .single();
  if (error) throw error;
  return data as AppNotification;
}
