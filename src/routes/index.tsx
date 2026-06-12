import { createFileRoute, Link } from "@tanstack/react-router";
import logo from "@/assets/logo.png";

const HERO_IMG = "https://images.unsplash.com/photo-1686198434432-c5f2c8c5c5c5?w=1600&q=80";
const FEATURE_IMGS = [
  "https://images.unsplash.com/photo-1547891654-e66ed7ebb968?w=600&q=80",
  "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&q=80",
  "https://images.unsplash.com/photo-1634017839464-5c339ebe3cae?w=600&q=80",
  "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=600&q=80",
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kinetik — AI image studio & social" },
      { name: "description", content: "Generate images with OpenAI, chat with AI, share to the public grid, and connect with makers in realtime." },
      { property: "og:title", content: "Kinetik — AI image studio & social" },
      { property: "og:description", content: "Generate images with OpenAI, chat with AI, share to the public grid, and connect with makers in realtime." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="flex items-center justify-between border-b-2 border-foreground px-6 py-4 lg:px-10">
        <div className="flex items-center gap-3">
          <img src={logo} alt="Kinetik" className="size-10 rounded-sm" width={40} height={40} />
          <span className="font-display text-2xl uppercase tracking-tighter">Kinetik_</span>
        </div>
        <div className="flex items-center gap-6 mono-label">
          <Link to="/auth" className="hover:text-primary transition-colors">Sign in</Link>
          <Link to="/auth" className="ink-button rounded-sm px-4 py-2 text-xs normal-case tracking-normal">Join collective</Link>
        </div>
      </nav>

      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-30"
          style={{ backgroundImage: `url(${HERO_IMG})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
        <main className="relative mx-auto max-w-6xl px-6 py-20 lg:px-10 lg:py-28">
          <div className="mono-label mb-4 animate-enter">// V.05 — OPENAI POWERED</div>
          <h1 className="font-display text-6xl leading-[0.92] tracking-tighter uppercase animate-enter lg:text-[10rem]">
            Prompt.<br />Refine.<br /><span className="text-primary">Distribute.</span>
          </h1>
          <p className="mt-8 max-w-2xl text-lg text-muted-foreground animate-enter">
            A workshop for AI imagery powered by OpenAI DALL·E 3 and GPT-4o. Generate stills, talk to an AI assistant,
            share to the public grid with reviews, and chat with makers in global, group, and private channels — all realtime.
          </p>
          <div className="mt-10 flex flex-wrap gap-3 animate-enter">
            <Link to="/auth" className="rust-button px-8 py-4 text-xl">Initialize session</Link>
            <a href="/samples.rar" className="border-2 border-foreground px-8 py-4 text-sm font-medium hover:bg-foreground hover:text-background transition-colors">
              Download sample pack
            </a>
          </div>
        </main>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24 lg:px-10">
        <div className="grid gap-4 lg:grid-cols-4">
          {[
            ["01", "Studio", "Generate stills with DALL·E 3. Save to your archive or push to the public grid.", FEATURE_IMGS[0]],
            ["02", "AI Chat", "GPT-4o assistant for prompt engineering, ideation, and critique.", FEATURE_IMGS[1]],
            ["03", "Public Grid", "Share renders. Like, comment, and leave star reviews.", FEATURE_IMGS[2]],
            ["04", "Channels", "Global, group, and private chat with reactions and moderation.", FEATURE_IMGS[3]],
          ].map(([n, title, copy, img]) => (
            <div key={n as string} className="paper-card overflow-hidden group">
              <div className="aspect-[4/3] overflow-hidden grain">
                <img src={img as string} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
              </div>
              <div className="p-6">
                <div className="mono-label">{n}</div>
                <h3 className="font-display mt-2 text-2xl uppercase">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{copy}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-3">
          {[
            ["Realtime sockets", "Supabase Realtime powers live feed updates, chat, reactions, and group messages."],
            ["Social moderation", "Delete messages, hide history, block users, and react with emoji."],
            ["Windows onboarding", "New makers on Windows get the sample pack (samples.rar) automatically."],
          ].map(([title, copy]) => (
            <div key={title as string} className="border border-line p-6 bg-paper-2">
              <h4 className="font-display text-xl uppercase">{title}</h4>
              <p className="mt-2 text-sm text-muted-foreground">{copy}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-line px-6 py-8 mono-label lg:px-10">© Kinetik Collective · OpenAI · Supabase Realtime</footer>
    </div>
  );
}
