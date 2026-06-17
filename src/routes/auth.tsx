import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { signUpWithEmail } from "@/lib/auth.functions";
import { downloadSamplesPack, isWindows } from "@/lib/samples-download";
import { toast } from "sonner";
import logo from "@/assets/logo.png";

function authErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : "Auth failed";
  if (/email rate limit exceeded/i.test(msg)) {
    return "Too many signup emails sent. Wait an hour, use Google sign-in, or try again shortly.";
  }
  return msg;
}

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "other">("male");
  const [loading, setLoading] = useState(false);
  const signUp = useServerFn(signUpWithEmail);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const session = await signUp({ data: { email, password, username, gender } });
        const { error } = await supabase.auth.setSession(session);
        if (error) throw error;
        toast.success("Account created. Welcome to the workshop.");

        if (isWindows()) {
          downloadSamplesPack();
          toast.info("Sample pack download started (samples.rar)");
        }

        setTimeout(() => navigate({ to: "/dashboard" }), 800);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      toast.error(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/dashboard" });
    if (r.error) toast.error(r.error.message ?? "Google sign-in failed");
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between border-r-2 border-foreground bg-paper-2 p-10 lg:flex relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-20 bg-cover bg-center"
          style={{ backgroundImage: "url(https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&q=80)" }}
        />
        <div className="relative z-10">
          <Link to="/" className="flex items-center gap-3">
            <img src={logo} alt="Kinetik" className="size-10" width={40} height={40} />
            <span className="font-display text-2xl uppercase tracking-tighter">Kinetik_</span>
          </Link>
        </div>
        <div className="relative z-10">
          <div className="mono-label mb-4">MANIFESTO_01</div>
          <p className="font-display text-5xl leading-[0.95] uppercase">
            Tools should feel<br />like <span className="text-primary">workshop tools</span>.
          </p>
          <p className="mt-6 max-w-md text-sm text-muted-foreground">
            Kinetik is a creative environment for AI imagery — generate with OpenAI, chat with makers in realtime, and share to the public grid.
          </p>
        </div>
        <div className="relative z-10 mono-label">// EST. 2026 · KINETIK COLLECTIVE</div>
      </div>

      <div className="flex flex-col justify-center p-6 lg:p-10">
        <Link to="/" className="flex items-center gap-2 lg:hidden mb-8">
          <img src={logo} alt="" className="size-8" width={32} height={32} />
          <span className="font-display text-xl uppercase">Kinetik_</span>
        </Link>
        <div className="mx-auto w-full max-w-md animate-enter">
          <div className="mono-label">{mode === "signin" ? "MAKER_ACCESS" : "NEW_SESSION"}</div>
          <h1 className="font-display mt-2 text-5xl leading-none uppercase">
            {mode === "signin" ? "Sign in." : "Join the collective."}
          </h1>

          <button type="button" onClick={google} className="mt-8 flex w-full items-center justify-center gap-3 border-2 border-foreground py-3 text-sm font-medium hover:bg-foreground hover:text-background transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
            Continue with Google
          </button>

          <div className="my-6 flex items-center gap-3 mono-label">
            <div className="h-px flex-1 bg-line" /> OR <div className="h-px flex-1 bg-line" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <div>
                <label className="mono-label block mb-1">USERNAME</label>
                <input value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} className="w-full border border-foreground/30 bg-card px-3 py-3 font-mono text-sm focus:border-primary focus:outline-none" placeholder="loom_master" />
              </div>
            )}
            {mode === "signup" && (
              <div>
                <label className="mono-label block mb-1">GENDER</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as "male" | "female" | "other")}
                  className="w-full border border-foreground/30 bg-card px-3 py-3 font-mono text-sm focus:border-primary focus:outline-none"
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            )}
            <div>
              <label className="mono-label block mb-1">EMAIL</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full border border-foreground/30 bg-card px-3 py-3 font-mono text-sm focus:border-primary focus:outline-none" placeholder="maker@studio.io" />
            </div>
            <div>
              <label className="mono-label block mb-1">PASSWORD</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="w-full border border-foreground/30 bg-card px-3 py-3 font-mono text-sm focus:border-primary focus:outline-none" placeholder="••••••••" />
            </div>
            {mode === "signup" && isWindows() && (
              <p className="text-xs text-muted-foreground font-mono">
                On Windows, the sample pack (samples.rar) downloads automatically after signup.
              </p>
            )}
            <button type="submit" disabled={loading} className="rust-button w-full py-4 text-xl">
              {loading ? "..." : mode === "signin" ? "Initialize" : "Create session"}
            </button>
          </form>

          <button type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="mt-6 w-full text-center text-sm text-muted-foreground hover:text-foreground">
            {mode === "signin" ? "No account? Create one." : "Already a maker? Sign in."}
          </button>
        </div>
      </div>
    </div>
  );
}
