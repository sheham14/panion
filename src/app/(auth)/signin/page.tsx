"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { User, ArrowRight, Mail, ArrowLeft, Loader2 } from "lucide-react";

function SentinelIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      <path
        d="M15 2C9.477 2 5 6.477 5 12c0 5.523 10 18 10 18S25 17.523 25 12C25 6.477 20.523 2 15 2Z"
        stroke="#004d40"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="15" cy="12" r="3.5" stroke="#004d40" strokeWidth="1.8" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.658 14.252 17.64 11.926 17.64 9.2z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleGoogle() {
    signIn("google", { callbackUrl: "/" });
  }

  async function handleGuest() {
    await fetch("/api/guest/enter", { method: "POST" });
    window.location.href = "/";
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setSending(true);
    setError(null);
    try {
      await signIn("email", { email: trimmed, callbackUrl: "/", redirect: false });
      setSentTo(trimmed);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (sentTo) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#0f1416] flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 rounded-[22px] bg-[#00E5C3] flex items-center justify-center mb-5 mx-auto shadow-[0_4px_24px_rgba(0,229,195,0.25)]">
            <Mail size={28} className="text-[#004d40]" strokeWidth={1.8} />
          </div>
          <h1 className="text-[22px] font-bold text-[#111] dark:text-[#e8e8e8] mb-2">
            Check your email
          </h1>
          <p className="text-[14px] text-[#aaa] leading-relaxed mb-1">
            We sent a sign-in link to
          </p>
          <p className="text-[14px] font-semibold text-[#111] dark:text-[#e0e0e0] mb-6">
            {sentTo}
          </p>
          <p className="text-[13px] text-[#bbb] leading-relaxed mb-8">
            Click the link in the email to sign in. It expires in 24 hours.
          </p>
          <button
            onClick={() => { setSentTo(null); setEmail(""); }}
            className="flex items-center gap-2 text-[13px] text-[#00b89e] mx-auto"
          >
            <ArrowLeft size={14} />
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#0f1416] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* Logo + heading */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-[22px] bg-[#00E5C3] flex items-center justify-center mb-5 shadow-[0_4px_24px_rgba(0,229,195,0.25)]">
            <SentinelIcon />
          </div>
          <h1 className="text-[24px] font-medium text-[#111] dark:text-[#e8e8e8] mb-2">
            Welcome to Panion
          </h1>
          <p className="text-[14px] text-[#aaa] text-center leading-relaxed max-w-[260px]">
            Track grocery prices, get alerts, and plan smarter trips across St.
            John&apos;s stores.
          </p>
        </div>

        {/* Google */}
        <button
          onClick={handleGoogle}
          className="w-full py-[14px] px-4 border border-[#e0e0e0] dark:border-[#2e3538] rounded-[14px] flex items-center justify-center gap-2.5 text-[14px] font-medium text-[#111] dark:text-[#e0e0e0] bg-white dark:bg-[#1e2528] hover:bg-[#fafafa] dark:hover:bg-[#242b2e] transition-colors active:scale-[0.98] mb-3"
        >
          <GoogleIcon />
          Continue with Google
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 h-px bg-[#e0e0e0] dark:bg-[#2e3538]" />
          <span className="text-[12px] text-[#bbb]">or</span>
          <div className="flex-1 h-px bg-[#e0e0e0] dark:bg-[#2e3538]" />
        </div>

        {/* Magic link form */}
        <form onSubmit={handleMagicLink} className="mb-3">
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="flex-1 h-[50px] px-4 border border-[#e0e0e0] dark:border-[#2e3538] rounded-[14px] text-[14px] text-[#111] dark:text-[#e0e0e0] bg-white dark:bg-[#1e2528] placeholder-[#bbb] outline-none focus:border-[#00b89e] dark:focus:border-[#00b89e] transition-colors"
            />
            <button
              type="submit"
              disabled={sending || !email.trim()}
              className="h-[50px] px-4 bg-[#00E5C3] rounded-[14px] text-[14px] font-semibold text-[#004d40] disabled:opacity-50 active:scale-[0.98] transition-all flex items-center gap-1.5 flex-shrink-0"
            >
              {sending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  <Mail size={15} />
                  Send link
                </>
              )}
            </button>
          </div>
          {error && (
            <p className="text-[12px] text-red-500 mt-2 px-1">{error}</p>
          )}
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 h-px bg-[#e0e0e0] dark:bg-[#2e3538]" />
          <span className="text-[12px] text-[#bbb]">or</span>
          <div className="flex-1 h-px bg-[#e0e0e0] dark:bg-[#2e3538]" />
        </div>

        {/* Guest CTA */}
        <button
          onClick={handleGuest}
          className="w-full py-[12px] rounded-[14px] text-[14px] font-medium text-[#888] dark:text-[#666] hover:text-[#555] dark:hover:text-[#999] flex items-center justify-center gap-2 transition-colors border border-[#f0f0f0] dark:border-[#1e2528] hover:border-[#e0e0e0] dark:hover:border-[#2e3538] mb-5 active:scale-[0.98]"
        >
          <User size={15} />
          Continue as guest
          <ArrowRight size={14} />
        </button>

        {/* Legal */}
        <p className="text-[11px] text-[#ccc] dark:text-[#555] text-center leading-relaxed px-2">
          By continuing you agree to our{" "}
          <Link href="/terms" className="text-[#00b89e] hover:underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-[#00b89e] hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
