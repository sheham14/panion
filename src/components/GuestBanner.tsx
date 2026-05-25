"use client";
import { useGuest } from "@/hooks/useGuest";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";

export default function GuestBanner() {
  const { isGuest } = useGuest();
  const router = useRouter();

  if (!isGuest) return null;

  async function handleSignIn() {
    await fetch("/api/guest/exit", { method: "POST" });
    router.push("/signin");
  }

  return (
    <div className="bg-[#0f2f2a] border-b border-[#00E5C3]/20 px-4 py-2 flex items-center justify-between gap-3">
      <p className="text-[12px] text-[#7ecfc4] leading-tight">
        Guest mode — your changes aren&apos;t saved
      </p>
      <button
        onClick={handleSignIn}
        className="flex items-center gap-1.5 text-[12px] font-semibold text-[#00E5C3] shrink-0 active:opacity-70 transition-opacity"
      >
        <LogIn size={13} strokeWidth={2} />
        Sign in
      </button>
    </div>
  );
}
