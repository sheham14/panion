"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";

type Category = "Bug report" | "Feature request" | "General feedback";

const CATEGORIES: Category[] = ["Bug report", "Feature request", "General feedback"];

export default function FeedbackClient() {
  const router = useRouter();

  const [category, setCategory] = useState<Category>("General feedback");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setStatus("sending");
    try {
      // Posts to our own rate-limited route; the mail credential stays on the
      // server instead of shipping in the client bundle (audit M7).
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          fromName: fromName.trim(),
          fromEmail: fromEmail.trim(),
          message: message.trim(),
        }),
      });
      setStatus(res.ok ? "success" : "error");
    } catch {
      setStatus("error");
    }
  };

  const handleReset = () => {
    setCategory("General feedback");
    setFromName("");
    setFromEmail("");
    setMessage("");
    setStatus("idle");
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0f1416] px-4 pt-4 pb-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => router.back()}
          className="w-[32px] h-[32px] rounded-[10px] bg-[#f4f4f4] dark:bg-[#242b2e] flex items-center justify-center flex-shrink-0"
        >
          <ArrowLeft size={16} stroke="#888" strokeWidth={1.5} />
        </button>
        <span className="text-[16px] font-medium text-[#111] dark:text-[#e0e0e0]">
          Feedback
        </span>
      </div>

      {status === "success" ? (
        /* Success state */
        <div className="flex flex-col items-center justify-center text-center pt-16 px-4">
          <div className="w-[64px] h-[64px] rounded-[20px] bg-[#f0fdf9] dark:bg-[#1a2e2a] border-2 border-[#00E5C3] flex items-center justify-center mb-5">
            <Check size={28} className="text-[#00b89e]" strokeWidth={2.5} />
          </div>
          <h2 className="text-[20px] font-medium text-[#111] dark:text-[#e0e0e0] mb-2">
            Thanks for the feedback!
          </h2>
          <p className="text-[14px] text-[#888] dark:text-[#aaa] leading-relaxed mb-8 max-w-[260px]">
            We read every message and use it to improve Panion.
          </p>
          <button
            onClick={handleReset}
            className="px-6 py-2.5 bg-[#f4f4f4] dark:bg-[#1e2528] rounded-[12px] text-[13px] font-medium text-[#555] dark:text-[#aaa]"
          >
            Send another
          </button>
        </div>
      ) : (
        /* Form */
        <div className="max-w-md">
          {/* Category */}
          <p className="text-[11px] font-medium text-[#aaa] uppercase tracking-wider mb-2">
            Category
          </p>
          <div className="flex gap-2 flex-wrap mt-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={[
                  "px-3.5 py-2 rounded-full text-[12px] font-medium transition-colors",
                  category === c
                    ? "bg-[#00E5C3] text-[#004d40]"
                    : "bg-[#f4f4f4] dark:bg-[#1e2528] text-[#555] dark:text-[#aaa]",
                ].join(" ")}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Name */}
          <p className="text-[11px] font-medium text-[#aaa] uppercase tracking-wider mb-2 mt-5">
            Name
          </p>
          <input
            type="text"
            placeholder="Your name (optional)"
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            className="w-full bg-[#f4f4f4] dark:bg-[#1e2528] rounded-[12px] px-4 py-3 text-[14px] text-[#111] dark:text-[#e0e0e0] outline-none placeholder-[#bbb] border border-transparent focus:border-[#00E5C3] transition-colors"
          />

          {/* Email */}
          <p className="text-[11px] font-medium text-[#aaa] uppercase tracking-wider mb-2 mt-5">
            Email
          </p>
          <input
            type="email"
            placeholder="Your email (optional) - we'll reply here"
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
            className="w-full bg-[#f4f4f4] dark:bg-[#1e2528] rounded-[12px] px-4 py-3 text-[14px] text-[#111] dark:text-[#e0e0e0] outline-none placeholder-[#bbb] border border-transparent focus:border-[#00E5C3] transition-colors"
          />

          {/* Message */}
          <p className="text-[11px] font-medium text-[#aaa] uppercase tracking-wider mb-2 mt-5">
            Message
          </p>
          <textarea
            placeholder="What's on your mind?"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            className="w-full bg-[#f4f4f4] dark:bg-[#1e2528] rounded-[12px] px-4 py-3 text-[14px] text-[#111] dark:text-[#e0e0e0] outline-none placeholder-[#bbb] border border-transparent focus:border-[#00E5C3] transition-colors resize-none"
          />

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!message.trim() || status === "sending"}
            className="w-full py-3.5 bg-[#00E5C3] rounded-[14px] text-[14px] font-medium text-[#004d40] mt-6 disabled:opacity-50 transition-opacity"
          >
            {status === "sending" ? "Sending…" : "Send feedback"}
          </button>

          {status === "error" && (
            <p className="text-[12px] text-red-500 mt-3 text-center">
              Something went wrong. Please try again or email us at{" "}
              <a href="mailto:feedback@panion.dev" className="underline">
                feedback@panion.dev
              </a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}