"use client";

import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { useAuth } from "@/providers/AuthProvider";

interface AIMessage { type: "ai"; id: string; content: string; }
interface UserMessage { type: "user"; id: string; text: string; }
type Message = AIMessage | UserMessage;

const INITIAL_MESSAGES: Message[] = [
  { type: "ai", id: "1", content: "I'm here whenever you're ready. What would you like to think through today?" },
];

const FALLBACK = "I'm having trouble reaching the service right now — please try again in a moment.";

const SUGGESTIONS = [
  "Explain slit-lamp technique",
  "Describe normal OCT layers",
  "How do I measure IOP?",
  "What is the cup-to-disc ratio?",
  "Explain LogMAR visual acuity",
];

export default function ChatPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const sendMessage = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || isTyping || streamingId) return;
    const userMsg: UserMessage = { type: "user", id: Date.now().toString(), text: content };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);
    if (inputRef.current) inputRef.current.style.height = "auto";

    const apiMessages = messages.concat(userMsg).map(m =>
      m.type === "user" ? { role: "user", content: m.text } : { role: "assistant", content: m.content }
    );

    const aiMsgId = `ai-${Date.now() + 1}`;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: apiMessages }),
      });
      if (!res.ok || !res.body) throw new Error("Stream unavailable");

      setMessages(prev => [...prev, { type: "ai", id: aiMsgId, content: "" }]);
      setIsTyping(false);
      setStreamingId(aiMsgId);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data) as { text: string };
            if (parsed.text) {
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last.type === "ai" && last.id === aiMsgId)
                  return [...prev.slice(0, -1), { ...last, content: last.content + parsed.text }];
                return prev;
              });
            }
          } catch { /* skip */ }
        }
      }
    } catch {
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last.type === "ai" && last.id === aiMsgId)
          return [...prev.slice(0, -1), { ...last, content: FALLBACK }];
        return [...prev, { type: "ai", id: aiMsgId, content: FALLBACK }];
      });
    } finally {
      setIsTyping(false);
      setStreamingId(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
  };

  const msgCount = messages.filter(m => m.type === "user").length;

  return (
    <div className="max-w-4xl mx-auto px-5 py-6 flex flex-col" style={{ height: "calc(100vh - 130px)" }}>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative w-10 h-10 rounded-full overflow-hidden shrink-0">
          <Image src="/images/eye-hero.png" alt="AI Tutor" fill sizes="40px" className="object-cover" />
        </div>
        <div>
          <h1 className="text-[#F4EFE7] text-[40px] font-medium tracking-[-0.04em] leading-none">AI Tutor®</h1>
          <p className="text-[#F4EFE7]/40 text-xs mt-1">Ophthalmology Educator · {msgCount} messages this session</p>
        </div>
        {user?.studentRole && (
          <div className="ml-auto bg-[#F4EFE7]/8 border border-[#F4EFE7]/12 rounded-full px-3 py-1 text-xs font-semibold text-[#F4EFE7]/60">
            {user.studentRole} Track
          </div>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 rounded-[20px] p-4" style={{ background: "rgba(244,239,231,0.03)" }}>
        {messages.map(m => (
          <div
            key={m.id}
            className="flex flex-col"
            style={{ alignItems: m.type === "ai" ? "flex-start" : "flex-end" }}
          >
            <div className="text-[#F4EFE7]/25 text-[9px] uppercase tracking-[0.1em] font-semibold mb-1">
              {m.type === "ai" ? "EyeBot Tutor" : "You"}
            </div>
            <div
              className="max-w-[80%] rounded-[16px] px-4 py-3 text-sm leading-relaxed"
              style={{
                background: m.type === "user" ? "#F4EFE7" : "rgba(244,239,231,0.07)",
                color: m.type === "user" ? "#181717" : "#F4EFE7",
                border: m.type === "user" ? "none" : "1px solid rgba(244,239,231,0.1)",
                borderBottomRightRadius: m.type === "user" ? 4 : 16,
                borderBottomLeftRadius: m.type === "ai" ? 4 : 16,
              }}
            >
              {m.type === "user" ? m.text : m.content}
              {streamingId === m.id && (
                <span className="inline-block w-0.5 h-4 bg-[#F4EFE7]/60 ml-0.5 animate-pulse align-[-2px]" />
              )}
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex flex-col items-start">
            <div className="text-[#F4EFE7]/25 text-[9px] uppercase tracking-[0.1em] font-semibold mb-1">EyeBot Tutor</div>
            <div className="bg-[#F4EFE7]/7 border border-[#F4EFE7]/10 rounded-[16px] rounded-bl-[4px] px-4 py-3">
              <span className="w-3 h-3 border border-[#F4EFE7]/20 border-t-[#F4EFE7]/60 rounded-full animate-spin block" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion chips */}
      <div className="flex flex-wrap gap-2 mb-3">
        {SUGGESTIONS.map(s => (
          <button
            key={s}
            onClick={() => sendMessage(s)}
            className="bg-[#F4EFE7]/8 border border-[#F4EFE7]/12 rounded-full px-3 py-1.5 text-xs text-[#F4EFE7]/60 hover:bg-[#F4EFE7]/15 hover:text-[#F4EFE7]/80 transition-colors"
          >
            {s}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="flex gap-3 items-end">
        <textarea
          ref={inputRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Ask about any ophthalmic topic…"
          rows={1}
          className="flex-1 bg-[#F4EFE7]/7 border border-[#F4EFE7]/12 rounded-[16px] px-4 py-3 text-[#F4EFE7] text-sm placeholder:text-[#F4EFE7]/25 outline-none focus:border-[#F4EFE7]/22 resize-none transition-colors leading-relaxed"
        />
        <button
          onClick={() => sendMessage()}
          disabled={!input.trim() || isTyping || !!streamingId}
          className="w-11 h-11 rounded-full bg-[#F4EFE7] flex items-center justify-center shrink-0 hover:bg-white transition-colors disabled:opacity-40"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M2 14L14 8L2 2V6.5L10 8L2 9.5V14Z" fill="#181717" />
          </svg>
        </button>
      </div>
    </div>
  );
}
