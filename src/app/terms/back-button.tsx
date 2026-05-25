"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export default function BackButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      className="inline-flex items-center gap-2 text-[13px] text-[#888] mb-8"
    >
      <ArrowLeft size={14} strokeWidth={1.5} />
      Back
    </button>
  );
}