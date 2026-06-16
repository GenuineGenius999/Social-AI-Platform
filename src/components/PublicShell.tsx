import { Link, useLocation } from "@tanstack/react-router";
import logo from "@/assets/logo.png";
import type { ReactNode } from "react";

const NAV = [
  { to: "/feed", label: "Grid", code: "01", match: "/feed" },
  { to: "/auth", label: "Studio", code: "02", match: null },
  { to: "/auth", label: "AI Chat", code: "03", match: null },
  { to: "/auth", label: "Channels", code: "04", match: null },
] as const;

export function PublicShell({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid lg:grid-cols-[260px_1fr] min-h-screen">
        <aside className="hidden border-r-2 border-foreground bg-paper-2 p-6 lg:flex lg:flex-col lg:justify-between">
          <div>
            <Link to="/feed" className="flex items-center gap-3">
              <img src={logo} alt="" className="size-9" width={36} height={36} />
              <span className="font-display text-xl uppercase tracking-tighter">Kinetik_</span>
            </Link>
            <nav className="mt-10 flex flex-col gap-1">
              <Link
                to="/auth"
                className="group flex items-center gap-3 border-l-2 border-transparent px-3 py-3 hover:border-foreground/40"
              >
                <span className="mono-label">00</span>
                <span className="font-display text-lg uppercase">Dashboard</span>
              </Link>
              {NAV.map((item) => {
                const active = item.match ? location.pathname.startsWith(item.match) : false;
                return (
                  <Link
                    key={item.code}
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
          <Link to="/auth" className="ink-button w-full py-2 text-center text-sm">
            Sign in
          </Link>
        </aside>

        <header className="flex items-center justify-between border-b-2 border-foreground bg-paper-2 px-4 py-3 lg:hidden">
          <Link to="/feed" className="flex items-center gap-2">
            <img src={logo} alt="" className="size-7" width={28} height={28} />
            <span className="font-display text-lg uppercase">Kinetik_</span>
          </Link>
          <Link to="/auth" className="mono-label text-primary">
            Sign in
          </Link>
        </header>

        <main className="overflow-x-hidden min-w-0">
          <nav className="flex gap-1 overflow-x-auto border-b border-line bg-paper-2 px-4 py-2 lg:hidden">
            <Link to="/auth" className="mono-label whitespace-nowrap px-3 py-2">
              Dashboard
            </Link>
            {NAV.map((item) => (
              <Link
                key={item.code}
                to={item.to}
                className={`mono-label whitespace-nowrap px-3 py-2 ${item.match && location.pathname.startsWith(item.match) ? "text-primary" : ""}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          {children}
        </main>
      </div>
    </div>
  );
}
