import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { useUnreadCounts } from "@/hooks/use-unread-counts";
import logo from "@/assets/logo.png";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

const NAV = [
  { to: "/dashboard", label: "Home", code: "00" },
  { to: "/feed", label: "Grid", code: "01" },
  { to: "/studio", label: "Studio", code: "02" },
  { to: "/chat", label: "AI Chat", code: "03" },
  { to: "/messages", label: "Channels", code: "04" },
  { to: "/users", label: "Users", code: "05" },
  { to: "/settings", label: "Settings", code: "06" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  const { counts } = useUnreadCounts(me);
  const channelBadge = counts.totalMessages;

  const profile = useQuery({
    queryKey: ["my-profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase.from("profiles").select("username,is_admin").eq("id", u.user.id).single();
      return data as { username: string; is_admin?: boolean } | null;
    },
  });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/feed", replace: true });
  }

  const navItems = profile.data?.is_admin
    ? [...NAV, { to: "/admin", label: "Admin", code: "ADM" } as const]
    : NAV;

  function isActive(path: string) {
    if (path === "/dashboard") return location.pathname === "/dashboard";
    return location.pathname.startsWith(path);
  }

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground flex flex-col lg:flex-row">
      {/* Desktop sidebar — fixed, never scrolls with page */}
      <aside className="hidden lg:flex lg:flex-col lg:w-[260px] lg:shrink-0 lg:h-screen border-r-2 border-foreground bg-paper-2">
        <div className="flex-1 overflow-y-auto p-6 min-h-0">
          <Link to="/dashboard" className="flex items-center gap-3">
            <img src={logo} alt="" className="size-9" width={36} height={36} />
            <span className="font-display text-xl uppercase tracking-tighter">Kinetik_</span>
          </Link>
          <nav className="mt-10 flex flex-col gap-1">
            {navItems.map((item) => {
              const badge = item.to === "/messages" ? channelBadge : 0;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`group flex items-center gap-3 border-l-2 px-3 py-3 transition-colors ${isActive(item.to) ? "border-primary bg-card" : "border-transparent hover:border-foreground/40"}`}
                >
                  <span className="mono-label">{item.code}</span>
                  <span className={`font-display text-lg uppercase flex-1 ${isActive(item.to) ? "text-primary" : ""}`}>{item.label}</span>
                  {badge > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-mono grid place-items-center">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="shrink-0 border-t border-line p-6">
          <div className="flex items-center justify-between mb-3">
            {profile.data && <div className="mono-label text-muted-foreground truncate">@{profile.data.username}</div>}
            <NotificationBell />
          </div>
          <button onClick={signOut} className="w-full border border-foreground/30 py-2 text-sm font-medium hover:bg-foreground hover:text-background transition-colors">
            Sign out
          </button>
        </div>
      </aside>

      {/* Main column — only this area scrolls */}
      <div className="flex flex-col flex-1 min-w-0 h-screen overflow-hidden">
        <header className="shrink-0 flex items-center justify-between border-b-2 border-foreground bg-paper-2 px-4 py-3 lg:hidden">
          <Link to="/dashboard" className="flex items-center gap-2">
            <img src={logo} alt="" className="size-7" width={28} height={28} />
            <span className="font-display text-lg uppercase">Kinetik_</span>
          </Link>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <button onClick={signOut} className="mono-label">
              Sign out
            </button>
          </div>
        </header>

        <nav className="shrink-0 flex gap-1 overflow-x-auto border-b border-line bg-paper-2 px-4 py-2 lg:hidden">
          {navItems.map((item) => (
            <Link key={item.to} to={item.to} className={`mono-label whitespace-nowrap px-3 py-2 ${isActive(item.to) ? "text-primary" : ""}`}>
              {item.label}
            </Link>
          ))}
        </nav>

        <main className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
          {children}
        </main>
      </div>
    </div>
  );
}
