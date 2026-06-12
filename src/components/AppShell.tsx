import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import logo from "@/assets/logo.png";
import type { ReactNode } from "react";

const NAV = [
  { to: "/studio", label: "Studio", code: "01" },
  { to: "/feed", label: "Public Grid", code: "02" },
  { to: "/chat", label: "AI Chat", code: "03" },
  { to: "/messages", label: "Channels", code: "04" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid lg:grid-cols-[260px_1fr] min-h-screen">
        <aside className="hidden border-r-2 border-foreground bg-paper-2 p-6 lg:flex lg:flex-col lg:justify-between">
          <div>
            <Link to="/" className="flex items-center gap-3">
              <img src={logo} alt="" className="size-9" width={36} height={36} />
              <span className="font-display text-xl uppercase tracking-tighter">Kinetik_</span>
            </Link>
            <nav className="mt-10 flex flex-col gap-1">
              {NAV.map((item) => {
                const active = location.pathname.startsWith(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`group flex items-center gap-3 border-l-2 px-3 py-3 transition-colors ${active ? "border-primary bg-card" : "border-transparent hover:border-foreground/40"}`}
                  >
                    <span className="mono-label">{item.code}</span>
                    <span className={`font-display text-lg uppercase ${active ? "text-primary" : ""}`}>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
          <button onClick={signOut} className="border border-foreground/30 py-2 text-sm font-medium hover:bg-foreground hover:text-background transition-colors">
            Sign out
          </button>
        </aside>

        {/* Mobile top bar */}
        <header className="flex items-center justify-between border-b-2 border-foreground bg-paper-2 px-4 py-3 lg:hidden">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="" className="size-7" width={28} height={28} />
            <span className="font-display text-lg uppercase">Kinetik_</span>
          </Link>
          <button onClick={signOut} className="mono-label">Sign out</button>
        </header>

        <main className="overflow-x-hidden">
          {/* Mobile nav strip */}
          <nav className="flex gap-1 overflow-x-auto border-b border-line bg-paper-2 px-4 py-2 lg:hidden">
            {NAV.map((item) => {
              const active = location.pathname.startsWith(item.to);
              return (
                <Link key={item.to} to={item.to} className={`mono-label whitespace-nowrap px-3 py-2 ${active ? "text-primary" : ""}`}>
                  {item.label}
                </Link>
              );
            })}
          </nav>
          {children}
        </main>
      </div>
    </div>
  );
}
