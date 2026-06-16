import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useNotificationContext } from "./NotificationProvider";
import { notificationStyleClass } from "@/lib/notifications";

export function NotificationBell() {
  const { items, unread, markRead, markAllRead } = useNotificationContext();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative border border-line p-2 hover:bg-paper-2 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-mono grid place-items-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button type="button" className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-label="Close" />
          <div className="absolute right-0 top-full z-50 mt-2 w-80 max-h-96 overflow-y-auto border-2 border-foreground bg-card shadow-lg">
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <span className="mono-label">Alerts</span>
              {unread > 0 && (
                <button type="button" onClick={markAllRead} className="text-xs text-primary hover:underline">
                  Mark all read
                </button>
              )}
            </div>
            {items.length === 0 && <div className="p-4 text-xs text-muted-foreground">No notifications yet.</div>}
            {items.map((n) => (
              <div
                key={n.id}
                className={`border-b border-line px-3 py-3 text-sm ${!n.read_at ? "bg-paper-2" : ""} ${notificationStyleClass(n.style_idx)}`}
              >
                <div className="font-medium">{n.title}</div>
                {n.body && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{n.body}</p>}
                <div className="mt-2 flex gap-2">
                  {n.link && (
                    <Link
                      to={n.link as "/"}
                      onClick={() => {
                        markRead(n.id);
                        setOpen(false);
                      }}
                      className="text-xs text-primary hover:underline"
                    >
                      View
                    </Link>
                  )}
                  {!n.read_at && (
                    <button type="button" onClick={() => markRead(n.id)} className="text-xs text-muted-foreground hover:underline">
                      Dismiss
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
