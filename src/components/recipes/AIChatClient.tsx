"use client";

import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────

type ChatSession = {
  id: string;
  title: string | null;
  isTemp: boolean;
  updatedAt: string;
  _count?: { messages: number };
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

// ── Markdown renderer ─────────────────────────────────────────────────────────
// Handles **bold**, ### headings, - bullet lists, 1. numbered lists

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-[#00b89e]">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  const listBuffer: React.ReactNode[] = [];
  let listType: "ul" | "ol" | null = null;

  const flushList = (key: string) => {
    if (listBuffer.length === 0) return;
    const Tag = listType === "ol" ? "ol" : "ul";
    const cls =
      listType === "ol"
        ? "list-decimal pl-5 my-1.5 space-y-0.5"
        : "list-disc pl-5 my-1.5 space-y-0.5";
    elements.push(
      <Tag key={key} className={cls}>
        {[...listBuffer]}
      </Tag>,
    );
    listBuffer.length = 0;
    listType = null;
  };

  lines.forEach((line, i) => {
    const key = `line-${i}`;

    if (/^#{1,3}\s/.test(line)) {
      flushList(key + "-fl");
      const content = line.replace(/^#{1,3}\s/, "");
      elements.push(
        <p
          key={key}
          className="font-semibold text-[#111] dark:text-[#e0e0e0] mt-3 mb-0.5 text-[13px]"
        >
          {renderInline(content)}
        </p>,
      );
    } else if (/^[-•*]\s/.test(line)) {
      if (listType === "ol") flushList(key + "-fl");
      listType = "ul";
      listBuffer.push(
        <li key={key} className="text-[13px] leading-relaxed">
          {renderInline(line.replace(/^[-•*]\s/, ""))}
        </li>,
      );
    } else if (/^\d+\.\s/.test(line)) {
      if (listType === "ul") flushList(key + "-fl");
      listType = "ol";
      listBuffer.push(
        <li key={key} className="text-[13px] leading-relaxed">
          {renderInline(line.replace(/^\d+\.\s/, ""))}
        </li>,
      );
    } else if (line.trim() === "") {
      flushList(key + "-fl");
      if (elements.length > 0) {
        elements.push(<div key={key} className="h-1.5" />);
      }
    } else {
      flushList(key + "-fl");
      elements.push(
        <p key={key} className="text-[13px] leading-relaxed">
          {renderInline(line)}
        </p>,
      );
    }
  });

  flushList("final");

  return <>{elements}</>;
}

// ── SidebarItem ───────────────────────────────────────────────────────────────

function SidebarItem({
  session,
  isActive,
  onClick,
  onDelete,
  onRename,
}: {
  session: ChatSession;
  isActive: boolean;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onRename: (id: string, title: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");

  const title = session.title ?? "New chat";
  const firstChar = [...title][0] ?? "";
  const codePoint = firstChar.codePointAt(0) ?? 0;
  const isEmoji = codePoint > 127;
  const emoji = isEmoji ? firstChar : "💬";
  const displayTitle = isEmoji
    ? title.slice(firstChar.length).trimStart()
    : title;

  const msgCount = session._count?.messages ?? 0;
  const turns = Math.max(0, Math.floor((msgCount - 1) / 2));
  const subText =
    turns === 0 ? "New" : `${turns} ${turns === 1 ? "exchange" : "exchanges"}`;

  function commitRename() {
    const trimmed = renameDraft.trim();
    setRenaming(false);
    if (trimmed && trimmed !== displayTitle) onRename(session.id, trimmed);
  }

  return (
    <div
      onClick={renaming ? undefined : onClick}
      className={[
        "relative flex items-center gap-2.5 px-4 py-2.5 cursor-pointer transition-colors",
        isActive
          ? "bg-[#f0fdf9] dark:bg-[#1a2e2a]"
          : "hover:bg-[#f9f9f9] dark:hover:bg-[#1e2528]",
      ].join(" ")}
    >
      <div
        className={[
          "w-8 h-8 rounded-[9px] flex items-center justify-center text-[14px] flex-shrink-0",
          isActive
            ? "bg-[#e0faf4] dark:bg-[#1e3830]"
            : "bg-[#f4f4f4] dark:bg-[#242b2e]",
        ].join(" ")}
      >
        {emoji}
      </div>

      <div className="flex-1 min-w-0">
        {renaming ? (
          <input
            autoFocus
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setRenaming(false);
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full text-[12px] font-medium bg-transparent border-b border-[#00E5C3] outline-none text-[#111] dark:text-[#e0e0e0]"
          />
        ) : (
          <>
            <div className="text-[12px] font-medium text-[#111] dark:text-[#e0e0e0] truncate">
              {displayTitle}
            </div>
            <div className="text-[10px] text-[#aaa]">{subText}</div>
          </>
        )}
      </div>

      {/* 3-dot menu button */}
      <div className="relative flex-shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className="w-6 h-6 rounded-md flex items-center justify-center text-[#ccc] hover:text-[#888] hover:bg-[#f0f0f0] dark:hover:bg-[#2e3538] transition-colors"
          aria-label="More options"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="2.5" r="1" fill="currentColor" />
            <circle cx="6" cy="6" r="1" fill="currentColor" />
            <circle cx="6" cy="9.5" r="1" fill="currentColor" />
          </svg>
        </button>

        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
              }}
            />
            <div className="absolute right-0 top-7 z-50 w-[120px] bg-white dark:bg-[#1e2528] border border-[#ebebeb] dark:border-[#2e3538] rounded-[10px] shadow-lg overflow-hidden">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  setRenameDraft(displayTitle);
                  setRenaming(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-[#333] dark:text-[#ccc] hover:bg-[#f5f5f5] dark:hover:bg-[#242b2e] transition-colors"
              >
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path
                    d="M7 1L10 4L3.5 10.5H1V8L7 1Z"
                    stroke="currentColor"
                    strokeWidth="1.1"
                    strokeLinejoin="round"
                  />
                </svg>
                Rename
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onDelete(e);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-[#ef4444] hover:bg-[#fef2f2] dark:hover:bg-[#3a1a1a] transition-colors"
              >
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path
                    d="M1.5 3h8M4 3V2h3v1M2.5 3l.5 6.5h5L9 3"
                    stroke="currentColor"
                    strokeWidth="1.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#f4f4f4] dark:bg-[#242b2e] rounded-[8px] text-[11px] font-medium text-[#888] hover:text-[#555] dark:hover:text-[#ccc] transition-colors"
    >
      {copied ? (
        <>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path
              d="M2 5.5L4.5 8L9 3"
              stroke="#00b89e"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-[#00b89e]">Copied</span>
        </>
      ) : (
        <>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <rect
              x="1"
              y="3"
              width="7"
              height="7"
              rx="1"
              stroke="currentColor"
              strokeWidth="1"
            />
            <path
              d="M3 3V2C3 1.4 3.4 1 4 1H9C9.6 1 10 1.4 10 2V7C10 7.6 9.6 8 9 8H8"
              stroke="currentColor"
              strokeWidth="1"
            />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

function containsRecipe(text: string): boolean {
  return /^Here's the recipe:/m.test(text);
}

// ── AIChatClient ──────────────────────────────────────────────────────────────

const PROMPT_CHIPS = [
  "What can I make with chicken?",
  "Budget dinner for 4 under $25",
  "Use up my pantry items",
  "Quick weeknight pasta",
  "Healthy meal prep ideas",
  "What's cheap at Walmart right now?",
];

export default function AIChatClient() {
  const router = useRouter();

  // Session state
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");

  // Usage
  const [remainingToday, setRemainingToday] = useState<number | null>(null);

  // Save recipe
  const [savingMessageId, setSavingMessageId] = useState<string | null>(null);
  const [savedMessageIds, setSavedMessageIds] = useState<Set<string>>(
    new Set(),
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const currentSessionIdRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const accRef = useRef("");
  currentSessionIdRef.current = currentSessionId;
  messagesRef.current = messages;

  // Load sessions + restore last active session on mount
  useEffect(() => {
    const lastId = localStorage.getItem("ai_chef_last_session");

    fetch("/api/ai/sessions")
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) { setIsLoadingSession(false); return; }
        setSessions(data);
        const target = lastId
          ? (data.find((s) => s.id === lastId) ?? data[0])
          : data[0];

        if (target) {
          fetch(`/api/ai/sessions/${target.id}`)
            .then((r) => r.json())
            .then((s) => {
              setCurrentSessionId(target.id);
              currentSessionIdRef.current = target.id;
              setMessages(s.messages ?? []);
              setIsLoadingSession(false);
            })
            .catch(() => setIsLoadingSession(false));
        } else {
          setIsLoadingSession(false);
        }
      })
      .catch(() => setIsLoadingSession(false));
  }, []);

  useLayoutEffect(() => {
    if (!messagesEndRef.current) return;
    messagesEndRef.current.scrollIntoView({
      behavior: "instant",
      block: "nearest",
    });
  }, [messages, streamingText]);

  // Scroll to bottom when iOS keyboard opens/closes (visualViewport resize)
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    function onVVResize() {
      messagesEndRef.current?.scrollIntoView({ behavior: "instant", block: "nearest" });
    }
    vv.addEventListener("resize", onVVResize);
    return () => vv.removeEventListener("resize", onVVResize);
  }, []);

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 80)}px`;
  }, [input]);

  const refreshSessions = useCallback(() => {
    fetch("/api/ai/sessions")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setSessions(data); })
      .catch(() => {});
  }, []);

  const sendMessage = useCallback(
    async (text?: string) => {
      const content = (text ?? input).trim();
      if (!content || isStreaming) return;

      setInput("");
      setIsStreaming(true);
      setStreamingText("");
      accRef.current = "";

      // Capture history before optimistic update — server uses this for guest context
      const historySnapshot = messagesRef.current.map((m) => ({ role: m.role, content: m.content }));

      // Optimistic user message (temp ID replaced when session loads)
      const tempUserId = `temp-user-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: tempUserId,
          role: "user",
          content,
          createdAt: new Date().toISOString(),
        },
      ]);

      try {
        // Create session lazily on first message
        let sessionId = currentSessionIdRef.current;
        if (!sessionId) {
          const res = await fetch("/api/ai/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isTemp: false }),
          });
          if (!res.ok) throw new Error("Failed to create session");
          const newSession: ChatSession = await res.json();
          sessionId = newSession.id;
          setCurrentSessionId(sessionId);
          currentSessionIdRef.current = sessionId;
          localStorage.setItem("ai_chef_last_session", sessionId);
        }

        // Stream
        const response = await fetch(`/api/ai/sessions/${sessionId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, history: historySnapshot }),
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.message ?? err.error ?? "Request failed");
        }

        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        accRef.current = "";
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // SSE events are delimited by \n\n
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === "text") {
                accRef.current += data.text;
                setStreamingText(accRef.current);
              } else if (data.type === "done") {
                // Snapshot before clearing — updater runs at render time
                const finalContent = accRef.current;
                accRef.current = "";
                setMessages((prev) => [
                  ...prev,
                  {
                    id: `ai-${Date.now()}`,
                    role: "assistant",
                    content: finalContent,
                    createdAt: new Date().toISOString(),
                  },
                ]);
                setStreamingText("");
                if (typeof data.remainingToday === "number") {
                  setRemainingToday(data.remainingToday);
                }
                // Refresh sidebar to show updated title and session list
                refreshSessions();
              } else if (data.type === "error") {
                throw new Error(data.message ?? "Stream error");
              }
            } catch {
              /* skip malformed SSE events */
            }
          }
        }
      } catch (err: unknown) {
        const raw = err instanceof Error ? err.message : "";
        const msg = raw.toLowerCase().includes("overloaded")
          ? "Clove is busy right now — please try again in a moment."
          : "Something went wrong. Please try again.";
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            content: `⚠️ ${msg}`,
            createdAt: new Date().toISOString(),
          },
        ]);
        setStreamingText("");
      } finally {
        setIsStreaming(false);
      }
    },
    [input, isStreaming, refreshSessions],
  );

  const loadSession = async (id: string) => {
    setSidebarOpen(false);
    setStreamingText("");
    setIsStreaming(false);

    try {
      const res = await fetch(`/api/ai/sessions/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setCurrentSessionId(id);
      setMessages(data.messages ?? []);
      localStorage.setItem("ai_chef_last_session", id);
    } catch {
      /* ignore */
    }
  };

  const newChat = () => {
    localStorage.removeItem("ai_chef_last_session");
    setIsLoadingSession(false);
    setCurrentSessionId(null);
    setMessages([]);
    setStreamingText("");
    setIsStreaming(false);
    setSidebarOpen(false);
  };

  const commitRename = async () => {
    const trimmed = renameDraft.trim();
    setIsRenaming(false);
    if (!trimmed || !currentSessionId || trimmed === headerTitle) return;
    setSessions((prev) =>
      prev.map((s) =>
        s.id === currentSessionId ? { ...s, title: trimmed } : s,
      ),
    );
    await fetch(`/api/ai/sessions/${currentSessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
  };

  const renameSession = async (id: string, title: string) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
    if (id === currentSessionId) {
      setRenameDraft(title);
    }
    await fetch(`/api/ai/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  };

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (currentSessionId === id) newChat();
    await fetch(`/api/ai/sessions/${id}`, { method: "DELETE" });
  };

  const saveRecipe = async (messageId: string, content: string) => {
    setSavingMessageId(messageId);
    try {
      const res = await fetch("/api/ai/extract-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageContent: content }),
      });
      const data = await res.json();
      if (data.recipeId) {
        setSavedMessageIds((prev) => new Set(prev).add(messageId));
        refreshSessions();
        router.push(`/recipes/${data.recipeId}`);
      }
    } catch {
      /* ignore */
    } finally {
      setSavingMessageId(null);
    }
  };

  // Group sessions by recency
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
  const sessionArr = Array.isArray(sessions) ? sessions : [];

  const todaySessions = sessionArr.filter(
    (s) => new Date(s.updatedAt) >= todayStart,
  );
  const weekSessions = sessionArr.filter((s) => {
    const d = new Date(s.updatedAt);
    return d >= weekStart && d < todayStart;
  });
  const olderSessions = sessionArr.filter(
    (s) => new Date(s.updatedAt) < weekStart,
  );

  // Current session display title (strip emoji prefix for header)
  const currentSession = sessionArr.find((s) => s.id === currentSessionId);
  const rawTitle = currentSession?.title ?? null;
  let headerTitle = "Clove";
  if (rawTitle) {
    const chars = [...rawTitle];
    const firstCP = chars[0]?.codePointAt(0) ?? 0;
    headerTitle =
      firstCP > 127 ? rawTitle.slice(chars[0].length).trimStart() : rawTitle;
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden bg-white dark:bg-[#0f1416]">
      {/* ── Sidebar overlay ─────────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="absolute inset-0 bg-black/20 z-20"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <div
        className={[
          "absolute top-0 left-0 bottom-[60px] w-[260px] bg-white dark:bg-[#161b1e] overflow-hidden",
          "border-r border-[#ebebeb] dark:border-[#2e3538] z-30 flex flex-col",
          "transition-transform duration-300",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="px-4 pt-4 pb-3 border-b border-[#f0f0f0] dark:border-[#2a3044] flex items-center justify-between flex-shrink-0">
          <span className="text-[14px] font-medium text-[#111] dark:text-[#e0e0e0]">
            Chat history
          </span>
          <button onClick={() => setSidebarOpen(false)} className="p-1">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M3 3L13 13M13 3L3 13"
                stroke="#aaa"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {sessionArr.length === 0 && (
            <p className="px-4 py-8 text-center text-[12px] text-[#aaa]">
              No chat history yet
            </p>
          )}

          {todaySessions.length > 0 && (
            <>
              <div className="px-4 py-2 text-[10px] font-medium text-[#ccc] uppercase tracking-wider">
                Today
              </div>
              {todaySessions.map((s) => (
                <SidebarItem
                  key={s.id}
                  session={s}
                  isActive={s.id === currentSessionId}
                  onClick={() => loadSession(s.id)}
                  onDelete={(e) => deleteSession(s.id, e)}
                  onRename={(id, title) => renameSession(id, title)}
                />
              ))}
            </>
          )}

          {weekSessions.length > 0 && (
            <>
              <div className="px-4 py-2 text-[10px] font-medium text-[#ccc] uppercase tracking-wider">
                This week
              </div>
              {weekSessions.map((s) => (
                <SidebarItem
                  key={s.id}
                  session={s}
                  isActive={s.id === currentSessionId}
                  onClick={() => loadSession(s.id)}
                  onDelete={(e) => deleteSession(s.id, e)}
                  onRename={(id, title) => renameSession(id, title)}
                />
              ))}
            </>
          )}

          {olderSessions.length > 0 && (
            <>
              <div className="px-4 py-2 text-[10px] font-medium text-[#ccc] uppercase tracking-wider">
                Earlier
              </div>
              {olderSessions.map((s) => (
                <SidebarItem
                  key={s.id}
                  session={s}
                  isActive={s.id === currentSessionId}
                  onClick={() => loadSession(s.id)}
                  onDelete={(e) => deleteSession(s.id, e)}
                  onRename={(id, title) => renameSession(id, title)}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── Main chat area ───────────────────────────────────────────────────── */}
      <div
        className={[
          "flex-1 flex flex-col min-h-0 transition-transform duration-300",
          sidebarOpen ? "translate-x-[260px]" : "",
        ].join(" ")}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#f0f0f0] dark:border-[#2a3044] flex-shrink-0 bg-white dark:bg-[#0f1416]">
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-[30px] h-[30px] rounded-[9px] bg-[#f4f4f4] dark:bg-[#242b2e] flex items-center justify-center flex-shrink-0"
            aria-label="Open chat history"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M2 3H12M2 7H12M2 11H8"
                stroke="#888"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <div className="flex-1 flex justify-center">
            {isRenaming ? (
              <input
                autoFocus
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") setIsRenaming(false);
                }}
                className="text-[17px] font-medium text-center bg-transparent border-b border-[#00E5C3] outline-none text-[#111] dark:text-[#e0e0e0] w-full max-w-[200px]"
              />
            ) : (
              <button
                onClick={() => {
                  if (!currentSessionId) return;
                  setRenameDraft(headerTitle);
                  setIsRenaming(true);
                }}
                className="text-[17px] font-medium text-[#111] dark:text-[#e0e0e0] truncate max-w-[200px] text-center"
                title="Tap to rename"
              >
                {headerTitle}
              </button>
            )}
          </div>

          <button
            onClick={newChat}
            className="w-[30px] h-[30px] rounded-[9px] bg-[#f4f4f4] dark:bg-[#242b2e] flex items-center justify-center flex-shrink-0"
            aria-label="New chat"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M7 2V12M2 7H12"
                stroke="#888"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3 pb-0">
          {messages.length === 0 && !streamingText && !isLoadingSession ? (
            /* ── Empty state ── */
            <div className="flex flex-col items-center justify-center h-full pb-4">
              <div className="w-[52px] h-[52px] rounded-[18px] bg-[#00E5C3] flex items-center justify-center mb-3 text-[22px]">
                🌿
              </div>
              <p className="text-[16px] font-medium text-[#111] dark:text-[#e0e0e0] mb-1.5">
                What are we cooking today?
              </p>
              <p className="text-[13px] text-[#aaa] text-center leading-relaxed mb-5 max-w-[260px]">
                Ask me for recipes based on your pantry, budget, or what&apos;s
                on sale at local stores.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {PROMPT_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => sendMessage(chip)}
                    disabled={isStreaming}
                    className="px-3 py-1.5 rounded-[20px] border border-[#e0e0e0] dark:border-[#2e3538] bg-white dark:bg-[#1e2528] text-[12px] text-[#555] dark:text-[#aaa] hover:border-[#00E5C3] hover:text-[#00b89e] transition-colors"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* ── Conversation ── */
            <div className="flex flex-col gap-3.5">
              {messages.map((msg) =>
                msg.role === "user" ? (
                  /* User bubble */
                  <div key={msg.id} className="flex justify-end">
                    <div className="bg-[#00E5C3] text-[#004d40] px-4 py-2.5 rounded-[16px_16px_4px_16px] max-w-[80%]">
                      <p className="text-[13px] leading-relaxed">
                        {msg.content}
                      </p>
                    </div>
                  </div>
                ) : (
                  /* AI bubble */
                  <div key={msg.id} className="flex gap-2 items-start">
                    <div className="w-7 h-7 rounded-[9px] bg-[#00E5C3] flex-shrink-0 mt-0.5 flex items-center justify-center text-[13px]">
                      🌿
                    </div>
                    <div className="min-w-0">
                      <div className="bg-[#f7f7f7] dark:bg-[#1e2528] px-4 py-2.5 rounded-[16px_16px_16px_4px] max-w-[85%]">
                        <MarkdownText text={msg.content} />
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <CopyButton text={msg.content} />
                        {containsRecipe(msg.content) &&
                          (savedMessageIds.has(msg.id) ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-[#00b89e] font-medium">
                              <svg
                                width="11"
                                height="11"
                                viewBox="0 0 11 11"
                                fill="none"
                              >
                                <path
                                  d="M2 5.5L4.5 8L9 3"
                                  stroke="#00b89e"
                                  strokeWidth="1.3"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                              Saved to your recipes
                            </span>
                          ) : (
                            <button
                              onClick={() => saveRecipe(msg.id, msg.content)}
                              disabled={savingMessageId === msg.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#f0fdf9] dark:bg-[#1a2e2a] border border-[#b2f0e4] dark:border-[#2a5a4a] rounded-[8px] text-[11px] font-medium text-[#0a7a62] dark:text-[#00b89e] hover:bg-[#e0faf4] transition-colors disabled:opacity-50"
                            >
                              {savingMessageId === msg.id ? (
                                "Saving…"
                              ) : (
                                <>
                                  <svg
                                    width="11"
                                    height="11"
                                    viewBox="0 0 11 11"
                                    fill="none"
                                  >
                                    <path
                                      d="M2 1h7a1 1 0 011 1v8l-4-2-4 2V2a1 1 0 011-1z"
                                      stroke="currentColor"
                                      strokeWidth="1"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                  Save recipe
                                </>
                              )}
                            </button>
                          ))}
                      </div>
                    </div>
                  </div>
                ),
              )}

              {/* Streaming message */}
              {streamingText && (
                <div className="flex gap-2 items-start">
                  <div className="w-7 h-7 rounded-[9px] bg-[#00E5C3] flex-shrink-0 mt-0.5 flex items-center justify-center text-[13px]">
                    🌿
                  </div>
                  <div className="bg-[#f7f7f7] dark:bg-[#1e2528] px-4 py-2.5 rounded-[16px_16px_16px_4px] max-w-[85%]">
                    <MarkdownText text={streamingText} />
                    <span className="inline-block w-0.5 h-3.5 bg-[#00E5C3] ml-0.5 animate-pulse align-middle" />
                  </div>
                </div>
              )}

              {/* Typing indicator — shown before first token arrives */}
              {isStreaming && !streamingText && (
                <div className="flex gap-2 items-start">
                  <div className="w-7 h-7 rounded-[9px] bg-[#00E5C3] flex-shrink-0 mt-0.5 flex items-center justify-center text-[13px]">
                    🌿
                  </div>
                  <div className="bg-[#f7f7f7] dark:bg-[#1e2528] px-4 py-3.5 rounded-[16px_16px_16px_4px] flex gap-1 items-center">
                    {[0, 150, 300].map((delay) => (
                      <span
                        key={delay}
                        className="w-1.5 h-1.5 rounded-full bg-[#ccc] animate-bounce"
                        style={{ animationDelay: `${delay}ms` }}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="px-4 pt-2.5 pb-1 border-t border-[#f0f0f0] dark:border-[#2a3044] flex-shrink-0">
          <div className="flex items-end gap-2 bg-[#f4f4f4] dark:bg-[#1e2528] rounded-[16px] px-3 py-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => {
                setTimeout(() => {
                  messagesEndRef.current?.scrollIntoView({ behavior: "instant", block: "nearest" });
                }, 350);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Ask Clove anything…"
              rows={1}
              style={{ resize: "none" }}
              className="flex-1 bg-transparent border-none outline-none text-[13px] text-[#111] dark:text-[#e0e0e0] placeholder-[#bbb] max-h-[80px] leading-relaxed"
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isStreaming}
              className={[
                "w-[30px] h-[30px] rounded-[9px] flex items-center justify-center flex-shrink-0 transition-colors",
                input.trim() && !isStreaming
                  ? "bg-[#00E5C3]"
                  : "bg-[#e0e0e0] dark:bg-[#2e3538]",
              ].join(" ")}
              aria-label="Send message"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M7 11V3M3 7L7 3L11 7"
                  stroke={input.trim() && !isStreaming ? "#004d40" : "#999"}
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
          {remainingToday !== null && (
            <p className="text-[10px] text-[#ccc] text-center mt-1.5">
              {remainingToday} free {remainingToday === 1 ? "query" : "queries"}{" "}
              remaining today
            </p>
          )}
          <p className="text-[10px] text-[#999] dark:text-[#555] text-center mt-1 pb-1">
            Clove is AI and can make mistakes. Always double-check information.
          </p>
        </div>
      </div>
    </div>
  );
}
