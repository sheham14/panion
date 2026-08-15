"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Check, X, ChevronRight } from "lucide-react";
import { getStoreMeta } from "@/lib/store-meta";


export type StoreRow = { id: string; chain: string; name: string };

const WATCHLIST_DEFAULTS = [
  { id: "prod_milk_natrel",       emoji: "🥛", name: "Whole milk — 4L",      price: "From $5.47 at Walmart" },
  { id: "prod_eggs_burnbrae",     emoji: "🥚", name: "Eggs — 12 pack",       price: "From $3.97 at Walmart" },
  { id: "prod_bread_dempsters",   emoji: "🍞", name: "Whole wheat bread 675g",price: "From $4.47 at Walmart" },
  { id: "prod_butter_lactantia",  emoji: "🧈", name: "Butter — 454g",        price: "From $5.97 at Walmart" },
  { id: "prod_chicken_maple_leaf",emoji: "🍗", name: "Chicken breast — per kg",price: "From $10.97 at Walmart" },
];

const FEATURE_PILLS = [
  "Compare prices",
  "Build grocery lists",
  "Get price alerts",
  "AI meal planning",
  "Pantry tracker",
];

function ProgressDots({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex gap-1.5 justify-center pt-4 pb-2 flex-shrink-0">
      {Array.from({ length: total }).map((_, i) => {
        const done = i < step - 1;
        const active = i === step - 1;
        return (
          <div
            key={i}
            className={[
              "h-1.5 rounded-full transition-all duration-300",
              done
                ? "w-1.5 bg-[#00E5C3]"
                : active
                  ? "w-5 bg-[#00E5C3]"
                  : "w-1.5 bg-[#e0e0e0] dark:bg-[#2e3538]",
            ].join(" ")}
          />
        );
      })}
    </div>
  );
}

export default function OnboardingClient({ stores }: { stores: StoreRow[] }) {
  const router = useRouter();
  const { update } = useSession();
  const [step, setStep] = useState(1);
  const [selectedStores, setSelectedStores] = useState<Set<string>>(
    () => new Set(stores.map((s) => s.id)),
  );
  const [removedItems, setRemovedItems] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const storeItems = stores.map((s) => ({
    id: s.id,
    name: s.name,
    // `letter` comes from getStoreMeta — it was previously derived from the
    // store name here and then silently overwritten by the spread anyway.
    ...getStoreMeta(s.chain),
  }));

  const activeWatchlist = WATCHLIST_DEFAULTS.filter(
    (p) => !removedItems.has(p.id),
  );

  function toggleStore(id: string) {
    setSelectedStores((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size === 1) return prev;
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function removeWatchlistItem(id: string) {
    setRemovedItems((prev) => new Set([...prev, id]));
  }

  async function handleComplete() {
    setError("");
    startTransition(async () => {
      try {
        const res = await fetch("/api/onboarding/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storeIds: Array.from(selectedStores),
            watchlistProductIds: activeWatchlist.map((p) => p.id),
          }),
        });

        if (!res.ok) {
          setError("Something went wrong. Please try again.");
          return;
        }

        await update({ onboardingCompleted: true });
        router.push("/");
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }

  // ── Step 1: Pick stores ──
  if (step === 1) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#0f1416] flex flex-col max-w-sm mx-auto px-5">
        <ProgressDots step={1} total={3} />

        <div className="pt-6 pb-4 flex-shrink-0">
          <h1 className="text-[22px] font-medium text-[#111] dark:text-[#e8e8e8] mb-1.5">
            Which stores do you shop at?
          </h1>
          <p className="text-[14px] text-[#aaa] leading-relaxed">
            We&apos;ll track prices and flyer deals at your chosen stores.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 pb-4">
          {storeItems.map((store) => {
            const selected = selectedStores.has(store.id);
            return (
              <button
                key={store.id}
                onClick={() => toggleStore(store.id)}
                className={[
                  "border rounded-xl p-3 flex flex-col items-center gap-1.5 transition-all duration-200 active:scale-[0.97]",
                  selected
                    ? "border-[#00E5C3] bg-[#f0fdf9] dark:bg-[#1a2e2a]"
                    : "border-[#e0e0e0] dark:border-[#2e3538] bg-white dark:bg-[#1e2528]",
                ].join(" ")}
              >
                <div
                  className="w-9 h-9 rounded-[11px] flex items-center justify-center text-[14px] font-bold flex-shrink-0"
                  style={{ background: store.bg, color: store.color }}
                >
                  {store.letter}
                </div>
                <span className="text-[12px] font-medium text-[#111] dark:text-[#e0e0e0]">
                  {store.name}
                </span>
                <div
                  className={[
                    "w-4 h-4 rounded-full border flex items-center justify-center transition-all",
                    selected
                      ? "bg-[#00E5C3] border-[#00E5C3]"
                      : "border-[#e0e0e0] dark:border-[#2e3538]",
                  ].join(" ")}
                >
                  {selected && (
                    <Check size={9} className="text-[#004d40]" strokeWidth={2.5} />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="py-5 flex-shrink-0">
          <button
            onClick={() => setStep(2)}
            disabled={selectedStores.size === 0}
            className="w-full py-[14px] bg-[#00E5C3] rounded-[14px] text-[15px] font-medium text-[#004d40] active:scale-[0.98] transition-all"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  // ── Step 2: Watchlist ──
  if (step === 2) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#0f1416] flex flex-col max-w-sm mx-auto px-5">
        <ProgressDots step={2} total={3} />

        <div className="pt-6 pb-4 flex-shrink-0">
          <h1 className="text-[22px] font-medium text-[#111] dark:text-[#e8e8e8] mb-1.5">
            Your watchlist is ready
          </h1>
          <p className="text-[14px] text-[#aaa] leading-relaxed">
            We added 5 everyday essentials. Tap × to remove any.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {activeWatchlist.length === 0 ? (
            <p className="text-[13px] text-[#aaa] text-center py-8">
              All items removed. You can add products from the home screen.
            </p>
          ) : (
            activeWatchlist.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 py-3 border-b border-[#f5f5f5] dark:border-[#1e2528]"
              >
                <div className="w-11 h-11 rounded-xl bg-[#f7f7f7] dark:bg-[#242b2e] flex items-center justify-center text-[20px] flex-shrink-0">
                  {item.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[#111] dark:text-[#e0e0e0] truncate">
                    {item.name}
                  </p>
                  <p className="text-[12px] text-[#00b89e]">{item.price}</p>
                </div>
                <button
                  onClick={() => removeWatchlistItem(item.id)}
                  className="w-7 h-7 rounded-[9px] bg-[#fef2f2] dark:bg-[#2a1a1a] border border-[#fecaca] dark:border-[#3a2020] flex items-center justify-center flex-shrink-0 active:scale-90 transition-transform"
                >
                  <X size={11} className="text-[#ef4444]" strokeWidth={2.5} />
                </button>
              </div>
            ))
          )}

          <div className="mt-3 p-3.5 bg-[#f0fdf9] dark:bg-[#1a2e2a] border border-[#b2f0e4] dark:border-[#1e4a3a] rounded-xl flex items-center gap-3">
            <p className="flex-1 text-[12px] text-[#0a7a62] dark:text-[#4db89e] leading-relaxed">
              You&apos;ll get notified when any of these drop in price
            </p>
            <ChevronRight size={14} className="text-[#00b89e] flex-shrink-0" />
          </div>
        </div>

        <div className="py-5 flex-shrink-0 flex flex-col gap-2">
          <button
            onClick={() => setStep(3)}
            className="w-full py-[14px] bg-[#00E5C3] rounded-[14px] text-[15px] font-medium text-[#004d40] active:scale-[0.98] transition-all"
          >
            Looks good
          </button>
          <button
            onClick={() => setStep(1)}
            className="w-full py-[10px] text-[13px] text-[#aaa] text-center"
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // ── Step 3: All set ──
  return (
    <div className="min-h-screen bg-white dark:bg-[#0f1416] flex flex-col max-w-sm mx-auto px-5">
      <ProgressDots step={3} total={3} />

      <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
        <div className="w-[72px] h-[72px] rounded-[24px] bg-[#f0fdf9] dark:bg-[#1a2e2a] border-2 border-[#00E5C3] flex items-center justify-center mb-6">
          <Check size={34} className="text-[#00b89e]" strokeWidth={2.5} />
        </div>

        <h1 className="text-[24px] font-medium text-[#111] dark:text-[#e8e8e8] mb-3">
          You&apos;re all set
        </h1>
        <p className="text-[14px] text-[#888] leading-relaxed mb-8 max-w-[260px]">
          Panion is tracking prices across your stores. Here&apos;s what you can do:
        </p>

        <div className="flex flex-wrap gap-2 justify-center mb-8">
          {FEATURE_PILLS.map((pill) => (
            <div
              key={pill}
              className="px-3.5 py-[7px] rounded-full bg-[#f4f4f4] dark:bg-[#1e2528] text-[12px] text-[#555] dark:text-[#aaa]"
            >
              {pill}
            </div>
          ))}
        </div>

        {error && <p className="text-[13px] text-red-500 mb-4">{error}</p>}
      </div>

      <div className="py-5 flex-shrink-0 flex flex-col gap-2">
        <button
          onClick={handleComplete}
          disabled={isPending}
          className="w-full py-[14px] bg-[#00E5C3] rounded-[14px] text-[15px] font-medium text-[#004d40] active:scale-[0.98] transition-all disabled:opacity-60"
        >
          {isPending ? "Setting up…" : "Start exploring"}
        </button>
        <button
          onClick={() => setStep(2)}
          className="w-full py-[10px] text-[13px] text-[#aaa] text-center"
        >
          ← Back
        </button>
        <p className="text-[11px] text-[#aaa] text-center">
          By continuing you agree to our{" "}
          <Link href="/privacy" className="text-[#00b89e]">
            Privacy Policy
          </Link>
          {" "}and{" "}
          <Link href="/terms" className="text-[#00b89e]">
            Terms of Service
          </Link>
        </p>
      </div>
    </div>
  );
}