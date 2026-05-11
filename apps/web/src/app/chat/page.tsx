"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useWebSocket } from "@/hooks/useWebSocket";
import { cn } from "@/lib/cn";

interface AgentRunResult {
  sessionId:    string;
  state:        string;
  responseText: string | null;
  actionDraft:  { actionType: string; payload: Record<string, unknown>; approvalId: string | null } | null;
  error:        string | null;
}

interface Message {
  id:      string;
  role:    "user" | "agent" | "system";
  content: string;
  draft?:  AgentRunResult["actionDraft"];
}

export default function ChatPage() {
  const router       = useRouter();
  const accessToken  = useAuth((s) => s.accessToken);
  const logout       = useAuth((s) => s.logout);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input,    setInput]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const bottomRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accessToken) router.replace("/login");
  }, [accessToken, router]);

  const { send } = useWebSocket({
    token: accessToken,
    onMessage(msg) {
      if (msg.event === "response") {
        const result = msg.data as AgentRunResult;
        setMessages((prev) => [
          ...prev,
          {
            id:      crypto.randomUUID(),
            role:    "agent",
            content: result.responseText ?? (result.error ?? "No response."),
            draft:   result.actionDraft ?? undefined,
          },
        ]);
        setLoading(false);
      }
      if (msg.event === "notification") {
        const n = (msg.data as { type: string; data: { approvalId?: string; actionType?: string } });
        if (n.type === "approval_requested") {
          setMessages((prev) => [
            ...prev,
            {
              id:      crypto.randomUUID(),
              role:    "system",
              content: `Action requires approval. ID: ${n.data.approvalId ?? "—"} (${n.data.actionType ?? "—"})`,
            },
          ]);
        }
      }
      if (msg.event === "error") {
        const e = (msg.data as { message?: string });
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "system", content: `Error: ${e.message ?? "Unknown"}` },
        ]);
        setLoading(false);
      }
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: text }]);
    setLoading(true);
    setInput("");
    send("chat", { message: text });
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b bg-white shadow-sm">
        <h1 className="font-semibold text-gray-900">CIO Agent</h1>
        <nav className="flex gap-3 text-sm">
          <a href="/approvals" className="text-gray-500 hover:text-gray-900">Approvals</a>
          <a href="/dashboard" className="text-gray-500 hover:text-gray-900">Dashboard</a>
          <a href="/admin"     className="text-gray-500 hover:text-gray-900">Admin</a>
          <button onClick={() => { logout(); router.replace("/login"); }} className="text-red-500 hover:text-red-700">
            Logout
          </button>
        </nav>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-gray-400 text-sm mt-12">
            Ask me anything about your projects, sprints, or team metrics.
          </p>
        )}
        {messages.map((m) => <MessageBubble key={m.id} message={m} />)}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t px-4 py-3 flex gap-2 bg-white safe-area-inset-bottom">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          placeholder="Ask something…"
          disabled={loading || !accessToken}
          className="flex-1 border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim() || !accessToken}
          className="px-4 py-2.5 bg-brand text-white rounded-xl text-sm font-medium hover:bg-brand-dark disabled:opacity-40 transition-colors"
        >
          {loading ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser   = message.role === "user";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div className="text-center">
        <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">{message.content}</span>
      </div>
    );
  }

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn(
        "max-w-[80%] px-4 py-2.5 rounded-2xl text-sm",
        isUser
          ? "bg-brand text-white rounded-br-sm"
          : "bg-gray-100 text-gray-900 rounded-bl-sm",
      )}>
        <p className="whitespace-pre-wrap">{message.content}</p>
        {message.draft && (
          <div className="mt-2 pt-2 border-t border-white/20 text-xs opacity-80">
            Action draft: <strong>{message.draft.actionType}</strong>
            {message.draft.approvalId && <span> · Approval: {message.draft.approvalId.slice(0, 8)}…</span>}
          </div>
        )}
      </div>
    </div>
  );
}
