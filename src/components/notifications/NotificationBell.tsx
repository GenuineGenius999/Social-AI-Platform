import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useOptionalNotificationContext } from "./NotificationProvider";

const TYPE_LABELS: Record<string, string> = {
  new_post: "Post",
  new_message: "Message",
  new_comment: "Comment",
  new_like: "Like",
  new_group_message: "Group",
  new_global_message: "Global",
  system: "System",
};

const PANEL_W = 320;

export function NotificationBell() {
  const ctx = useOptionalNotificationContext();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (!open || !btnRef.current) return;

    function place() {
      const rect = btnRef.current!.getBoundingClientRect();
      const maxH = Math.min(384, window.innerHeight * 0.7);
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < maxH + 16;

      const right = Math.max(8, window.innerWidth - rect.right);

      if (openUp) {
        setPanelStyle({
          position: "fixed",
          bottom: window.innerHeight - rect.top + 8,
          right,
          width: PANEL_W,
          maxHeight: maxH,
          zIndex: 101,
        });
      } else {
        setPanelStyle({
          position: "fixed",
          top: rect.bottom + 8,
          right,
          width: PANEL_W,
          maxHeight: maxH,
          zIndex: 101,
        });
      }
    }

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  if (!ctx) {
    return (
      <button
        type="button"
        className="relative border border-line p-2 hover:bg-paper-2 transition-colors"
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell className="size-4" />
      </button>
    );
  }

  const { items, unread, markRead, markAllRead } = ctx;

  const panel = open ? (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[100] bg-transparent"
        onClick={() => setOpen(false)}
        aria-label="Close notifications"
      />
      <div
        style={panelStyle}
        className="overflow-hidden border-2 border-foreground bg-card shadow-xl flex flex-col rounded-sm"
      >
        <div className="flex items-center justify-between border-b border-line px-3 py-2 shrink-0 bg-paper-2">
          <span className="mono-label">Alerts</span>
          {unread > 0 && (
            <button type="button" onClick={markAllRead} className="text-xs text-primary hover:underline">
              Mark all read
            </button>
          )}
        </div>
        <div className="overflow-y-auto flex-1 overscroll-contain">
          {items.length === 0 && <div className="p-4 text-xs text-muted-foreground">No notifications yet.</div>}
          {items.map((n) => (
            <div
              key={n.id}
              className={`border-b border-line px-3 py-3 text-sm ${!n.read_at ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium leading-snug">{n.title}</div>
                <span className="text-[9px] mono-label shrink-0 text-muted-foreground">{TYPE_LABELS[n.type] ?? n.type}</span>
              </div>
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
      </div>
    </>
  ) : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative border border-line p-2 hover:bg-paper-2 transition-colors shrink-0"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-mono grid place-items-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {panel && createPortal(panel, document.body)}
    </>
  );
}
