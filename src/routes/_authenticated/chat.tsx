import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { sendChatMessage } from "@/lib/ai.functions";
import { supabase } from "@/integrations/supabase/client";
import { friendlyDbError } from "@/lib/db-errors";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/chat")({ component: Chat });

type Msg = { id?: string; role: string; content: string };

function Chat() {
  const [conversations, setConversations] = useState<{ id: string; title: string }[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const send = useServerFn(sendChatMessage);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadConvs(); }, []);
  useEffect(() => { if (activeId) loadMessages(activeId); else setMessages([]); }, [activeId]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages]);

  async function loadConvs() {
    const { data } = await supabase.from("ai_conversations").select("id,title").order("updated_at", { ascending: false });
    setConversations(data ?? []);
  }
  async function loadMessages(id: string) {
    const { data } = await supabase.from("ai_messages").select("*").eq("conversation_id", id).order("created_at", { ascending: true });
    setMessages((data ?? []) as Msg[]);
  }

  async function submit() {
    if (!input.trim() || sending) return;
    const msg = input.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setSending(true);
    try {
      const r = await send({ data: { conversationId: activeId, message: msg } });
      setActiveId(r.conversationId);
      setMessages((m) => [...m, { role: "assistant", content: r.reply }]);
      loadConvs();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      toast.error(friendlyDbError(msg));
    } finally { setSending(false); }
  }

  return (
    <AppShell>
      <div className="grid lg:grid-cols-[260px_1fr] min-h-[calc(100vh-3.5rem)] lg:min-h-screen">
        <aside className="border-b lg:border-b-0 lg:border-r-2 border-foreground bg-paper-2 p-4">
          <button onClick={() => { setActiveId(null); setMessages([]); }} className="ink-button w-full py-2 text-sm mb-4">+ New thread</button>
          <div className="mono-label mb-2">THREADS</div>
          <div className="space-y-1">
            {conversations.map((c) => (
              <button key={c.id} onClick={() => setActiveId(c.id)} className={`block w-full text-left px-2 py-2 text-xs truncate border-l-2 ${activeId === c.id ? "border-primary bg-card" : "border-transparent hover:border-foreground/40"}`}>{c.title}</button>
            ))}
          </div>
        </aside>
        <div className="flex flex-col h-[calc(100vh-7rem)] lg:h-screen">
          <div className="p-4 border-b border-line">
            <div className="mono-label">/AI_CHAT</div>
            <h1 className="font-display text-3xl uppercase">Assistant</h1>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 lg:p-8 space-y-6">
            {messages.length === 0 && <div className="mono-label">Ask about prompt craft, composition, or get feedback on a render. Powered by GPT-4o.</div>}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                <div className={m.role === "user" ? "max-w-[80%] bg-ink text-paper px-4 py-3 rounded-md" : "max-w-[80%]"}>
                  {m.role !== "user" && <div className="mono-label mb-1">ASSISTANT</div>}
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</div>
                </div>
              </div>
            ))}
            {sending && <div className="mono-label">THINKING...</div>}
          </div>
          <div className="border-t border-line p-4 flex gap-2">
            <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} rows={2} placeholder="Message the assistant..." className="flex-1 border border-line bg-background p-3 text-sm focus:border-primary focus:outline-none resize-none" />
            <button onClick={submit} disabled={sending} className="rust-button px-6 self-stretch">Send</button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
