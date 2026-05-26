"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import AddToListSheet from "@/components/search/AddToListSheet";
import type { RecipeDetailData } from "@/app/(main)/recipes/[id]/page";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatQty(
  quantity: number | null,
  unit: string | null,
  scale: number,
): string {
  if (quantity === null) return "";
  const scaled = Math.round(quantity * scale * 10) / 10;
  // Whole numbers: no trailing .0
  const display = scaled % 1 === 0 ? scaled.toFixed(0) : scaled.toString();
  return unit ? `${display} ${unit}` : display;
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── SVG Icons ───────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M9 2L4 7L9 12"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path
        d="M9 1L12 4L4.5 11.5H2V9L9 1Z"
        stroke="white"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckmarkIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path
        d="M2 5L4 7L8 3"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TimerIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <circle cx="5.5" cy="6" r="4" stroke="#0a7a62" strokeWidth="1.1" />
      <path
        d="M5.5 4V6.5L7 7.5"
        stroke="#0a7a62"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      <path
        d="M4 1H7"
        stroke="#0a7a62"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type ActiveTimer = {
  stepIndex: number;
  secondsLeft: number;
  running: boolean;
};

export default function RecipeDetailClient({
  recipe,
  isOwner,
}: {
  recipe: RecipeDetailData;
  isOwner: boolean;
}) {
  const router = useRouter();
  const heroRef = useRef<HTMLDivElement>(null);

  // ── State ────────────────────────────────────────────────────────────────
  const [servings, setServings] = useState(recipe.servings);
  const [heroCollapsed, setHeroCollapsed] = useState(false);

  // Steps: tap to mark done; active = first non-done step
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  // Ingredients: non-pantry items pre-selected
  const [checkedIds, setCheckedIds] = useState<Set<string>>(
    () =>
      new Set(recipe.ingredients.filter((i) => !i.inPantry).map((i) => i.id)),
  );

  const [showSheet, setShowSheet] = useState(false);

  // Timer: only one active at a time
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null);

  // ── Derived ──────────────────────────────────────────────────────────────
  const scale = recipe.servings > 0 ? servings / recipe.servings : 1;
  const selectedIngredients = recipe.ingredients.filter((i) =>
    checkedIds.has(i.id),
  );
  const firstIncomplete = recipe.steps.findIndex(
    (_, i) => !completedSteps.has(i),
  );

  // ── Scroll detection ─────────────────────────────────────────────────────
  useEffect(() => {
    function onScroll() {
      if (!heroRef.current) return;
      setHeroCollapsed(heroRef.current.getBoundingClientRect().bottom < 40);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ── Timer countdown ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeTimer?.running || activeTimer.secondsLeft <= 0) return;
    const id = setTimeout(() => {
      setActiveTimer((t) =>
        t ? { ...t, secondsLeft: t.secondsLeft - 1 } : null,
      );
    }, 1000);
    return () => clearTimeout(id);
  }, [activeTimer]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  function toggleIngredient(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleStep(index: number) {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  }

  function handleTimer(
    stepIndex: number,
    minutes: number,
    e: React.MouseEvent,
  ) {
    e.stopPropagation();
    if (activeTimer?.stepIndex === stepIndex) {
      // Toggle pause/resume on same step
      setActiveTimer((t) => (t ? { ...t, running: !t.running } : null));
    } else {
      // Start new timer
      setActiveTimer({ stepIndex, secondsLeft: minutes * 60, running: true });
    }
  }

  // ── Collapsed banner content ──────────────────────────────────────────────
  const CollapsedBanner = (
    <div
      className="fixed top-safe left-0 right-0 z-20 h-[52px] transition-all duration-200"
      style={{
        opacity: heroCollapsed ? 1 : 0,
        pointerEvents: heroCollapsed ? "auto" : "none",
      }}
    >
      {/* Blurred emoji backdrop */}
      <div
        className="absolute inset-0 flex items-center justify-center text-[40px]"
        style={{
          background: "linear-gradient(135deg, #3a5a4a 0%, #1a3a2a 100%)",
          filter: "blur(3px)",
          transform: "scale(1.1)",
        }}
      >
        🍽️
      </div>
      <div className="absolute inset-0 bg-black/55 flex items-center justify-between px-4">
        <span className="text-[14px] font-medium text-white truncate max-w-[220px]">
          {recipe.title}
        </span>
        <div className="flex gap-2">
          {isOwner && (
            <button
              onClick={() => router.push(`/recipes/${recipe.id}/edit`)}
              className="w-7 h-7 rounded-[8px] bg-white/20 flex items-center justify-center"
            >
              <EditIcon />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="bg-[#f7f7f7] dark:bg-[#161b1e] min-h-screen">
      {CollapsedBanner}

      {/* Hero */}
      <div ref={heroRef} className="relative h-[200px] flex items-end">
        <div
          className="absolute inset-0 flex items-center justify-center text-[80px]"
          style={{
            background:
              "linear-gradient(135deg, #3a5a4a 0%, #2a4a3a 50%, #1a3a2a 100%)",
          }}
        >
          🍽️
        </div>
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.1) 55%, transparent 100%)",
          }}
        />

        {/* Back */}
        <button
          onClick={() => router.push("/recipes")}
          className="absolute top-3 left-4 w-[30px] h-[30px] rounded-[9px] bg-black/35 flex items-center justify-center z-10"
          aria-label="Go back"
        >
          <BackIcon />
        </button>

        {/* Edit */}
        <div className="absolute top-3 right-4 flex gap-2 z-10">
          {isOwner && (
            <button
              onClick={() => router.push(`/recipes/${recipe.id}/edit`)}
              className="w-[30px] h-[30px] rounded-[9px] bg-black/35 flex items-center justify-center"
              aria-label="Edit recipe"
            >
              <EditIcon />
            </button>
          )}
        </div>

        {/* Title */}
        <div className="relative z-10 px-4 pb-[14px]">
          <p className="text-[19px] font-medium text-white leading-snug">
            {recipe.title}
          </p>
        </div>
      </div>

      {/* Description */}
      {recipe.description && (
        <div className="px-4 pt-3 pb-1 bg-white dark:bg-[#161b1e]">
          <p className="text-[13px] text-[#555] dark:text-[#999] leading-relaxed">
            {recipe.description}
          </p>
        </div>
      )}

      {/* Meta row */}
      <div className="flex items-center border-b border-[#f0f0f0] dark:border-[#2a3044] bg-white dark:bg-[#161b1e]">
        {recipe.prepTime != null && (
          <div className="flex-1 text-center py-3 border-r border-[#f0f0f0] dark:border-[#2a3044]">
            <p className="text-[9px] uppercase tracking-[0.5px] text-[#aaa] mb-0.5">
              Prep
            </p>
            <p className="text-[12px] font-medium text-[#111] dark:text-[#e0e0e0]">
              {recipe.prepTime} min
            </p>
          </div>
        )}
        {recipe.cookTime != null && (
          <div className="flex-1 text-center py-3 border-r border-[#f0f0f0] dark:border-[#2a3044]">
            <p className="text-[9px] uppercase tracking-[0.5px] text-[#aaa] mb-0.5">
              Cook
            </p>
            <p className="text-[12px] font-medium text-[#111] dark:text-[#e0e0e0]">
              {recipe.cookTime} min
            </p>
          </div>
        )}
        <div className="flex-1 text-center py-3 border-r border-[#f0f0f0] dark:border-[#2a3044]">
          <p className="text-[9px] uppercase tracking-[0.5px] text-[#aaa] mb-0.5">
            Servings
          </p>
          <div className="flex items-center justify-center gap-[7px]">
            <button
              onClick={() => setServings((s) => Math.max(1, s - 1))}
              className="w-[18px] h-[18px] rounded-[5px] border border-[#e0e0e0] dark:border-[#2e3538] bg-[#f9f9f9] dark:bg-[#242b2e] flex items-center justify-center text-[13px] text-[#555] dark:text-[#aaa]"
            >
              −
            </button>
            <span className="text-[12px] font-medium text-[#111] dark:text-[#e0e0e0] min-w-[16px] text-center tabular-nums">
              {servings}
            </span>
            <button
              onClick={() => setServings((s) => s + 1)}
              className="w-[18px] h-[18px] rounded-[5px] border border-[#e0e0e0] dark:border-[#2e3538] bg-[#f9f9f9] dark:bg-[#242b2e] flex items-center justify-center text-[13px] text-[#555] dark:text-[#aaa]"
            >
              +
            </button>
          </div>
        </div>
        <div className="flex-1 text-center py-3">
          <p className="text-[9px] uppercase tracking-[0.5px] text-[#aaa] mb-0.5">
            Total
          </p>
          <p className="text-[12px] font-medium text-[#111] dark:text-[#e0e0e0]">
            {recipe.prepTime != null && recipe.cookTime != null
              ? `${recipe.prepTime + recipe.cookTime} min`
              : "—"}
          </p>
        </div>
      </div>

      {/* Ingredients */}
      <div className="mt-2">
        <div className="flex items-center justify-between px-4 pt-[14px] pb-2">
          <p className="text-[14px] font-medium text-[#111] dark:text-[#e0e0e0]">
            Ingredients
          </p>
          {selectedIngredients.length > 0 && (
            <button
              onClick={() => setShowSheet(true)}
              className="text-[11px] text-[#00b89e]"
            >
              Add checked to list
            </button>
          )}
        </div>

        {recipe.ingredients.map((ing) => {
          const checked = checkedIds.has(ing.id);
          return (
            <button
              key={ing.id}
              onClick={() => toggleIngredient(ing.id)}
              className="w-full flex items-center gap-[10px] px-4 py-[9px] border-b border-[#f5f5f5] dark:border-[#2a3044] active:bg-[#fafafa] dark:active:bg-[#1a2528] transition-colors"
            >
              {/* Checkbox */}
              <div
                className={[
                  "w-5 h-5 rounded-full border flex-shrink-0 flex items-center justify-center transition-all",
                  checked
                    ? "bg-[#00E5C3] border-[#00E5C3]"
                    : "bg-white dark:bg-[#1e2528] border-[#e0e0e0] dark:border-[#2e3538]",
                ].join(" ")}
              >
                {checked && <CheckmarkIcon />}
              </div>

              {/* Name + qty */}
              <div className="flex-1 text-left">
                <p className="text-[13px] font-medium text-[#111] dark:text-[#e0e0e0]">
                  {ing.name}
                  {ing.isOptional && (
                    <span className="ml-1.5 text-[10px] text-[#bbb] font-normal">
                      optional
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-[#aaa]">
                  {formatQty(ing.quantity, ing.unit, scale)}
                  {ing.notes ? ` · ${ing.notes}` : ""}
                </p>
              </div>

              {/* Right: pantry badge */}
              {ing.inPantry && (
                <span className="text-[9px] bg-[#f0fdf9] dark:bg-[#1a2e2a] text-[#0a7a62] dark:text-[#6ee7c7] border border-[#b2f0e4] dark:border-[#1e4a3a] rounded-[4px] px-[5px] py-[1px] flex-shrink-0">
                  In pantry
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Add to list CTA */}
      {selectedIngredients.length > 0 && (
        <button
          onClick={() => setShowSheet(true)}
          className="mx-4 mt-[10px] w-[calc(100%-32px)] py-[11px] bg-[#00E5C3] rounded-[12px] text-[13px] font-medium text-[#004d40] text-center active:opacity-90 transition-opacity"
        >
          Add {selectedIngredients.length} item
          {selectedIngredients.length !== 1 ? "s" : ""} to grocery list
        </button>
      )}

      {/* Steps */}
      {recipe.steps.length > 0 && (
        <div className="relative mt-2 mb-5">
          <div className="flex items-center justify-between px-4 pt-[14px] pb-2">
            <p className="text-[14px] font-medium text-[#111] dark:text-[#e0e0e0]">
              Steps
            </p>
            <p className="text-[11px] text-[#aaa]">Tap to complete</p>
          </div>

          {/* Vertical timeline line */}
          <div className="absolute right-[18px] top-[56px] bottom-[12px] w-px bg-[#ebebeb] dark:bg-[#2e3538]" />

          <div className="pr-8">
            {recipe.steps.map((step, i) => {
              const done = completedSteps.has(i);
              const active = i === firstIncomplete;
              const isThisTimer = activeTimer?.stepIndex === i;

              return (
                <div key={i} className="relative mx-4 mb-2">
                  <div
                    onClick={() => toggleStep(i)}
                    className={[
                      "w-full text-left border rounded-[14px] px-[14px] py-3 transition-all",
                      active
                        ? "border-[#00E5C3] bg-[#fafffe] dark:bg-[#1a2e2a]"
                        : done
                          ? "border-[#ebebeb] dark:border-[#2e3538] bg-white dark:bg-[#1e2528] opacity-45"
                          : "border-[#ebebeb] dark:border-[#2e3538] bg-white dark:bg-[#1e2528]",
                    ].join(" ")}
                  >
                    <p
                      className={[
                        "text-[10px] font-medium uppercase tracking-[0.8px] mb-[5px]",
                        active ? "text-[#00b89e]" : "text-[#aaa]",
                      ].join(" ")}
                    >
                      Step {i + 1} of {recipe.steps.length}
                    </p>
                    <p
                      className={[
                        "text-[13px] leading-relaxed",
                        done
                          ? "text-[#aaa]"
                          : "text-[#111] dark:text-[#e0e0e0]",
                      ].join(" ")}
                    >
                      {step.text}
                    </p>

                    {step.timerMinutes !== null && !done && (
                      <button
                        onClick={(e) => handleTimer(i, step.timerMinutes!, e)}
                        className="inline-flex items-center gap-1 mt-2 px-[10px] py-[5px] bg-[#f0fdf9] dark:bg-[#1a2e2a] border border-[#b2f0e4] dark:border-[#1e4a3a] rounded-[8px] text-[11px] font-medium text-[#0a7a62] dark:text-[#6ee7c7]"
                      >
                        <TimerIcon />
                        {isThisTimer
                          ? activeTimer!.running
                            ? formatTimer(activeTimer!.secondsLeft)
                            : `Paused · ${formatTimer(activeTimer!.secondsLeft)}`
                          : `Timer · ${step.timerMinutes} min`}
                      </button>
                    )}
                  </div>

                  {/* Timeline dot */}
                  <div
                    className={[
                      "absolute right-[-20px] top-4 w-3 h-3 rounded-full border-[1.5px] z-10",
                      active || done
                        ? "bg-[#00E5C3] border-[#00E5C3]"
                        : "bg-white dark:bg-[#1e2528] border-[#e0e0e0] dark:border-[#2e3538]",
                    ].join(" ")}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom nav spacer */}
      <div className="h-20" />

      {/* Add to list sheet */}
      {showSheet && (
        <AddToListSheet
          mode="recipe"
          ingredients={selectedIngredients.map((ing) => ({
            id: ing.id,
            name: ing.name,
            productId: ing.productId,
            quantity:
              ing.quantity !== null
                ? Math.round(ing.quantity * scale * 10) / 10
                : null,
            unit: ing.unit,
            productUnitQuantity: ing.productUnitQuantity,
            productUnitMeasure: ing.productUnitMeasure,
            productUnitSize: ing.productUnitSize,
          }))}
          onClose={() => setShowSheet(false)}
        />
      )}
    </div>
  );
}
