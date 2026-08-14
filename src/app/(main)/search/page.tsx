"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, X, Clock, Bell, BellOff, Plus, ArrowLeft } from "lucide-react";
import AddToListSheet from "@/components/search/AddToListSheet";

// ── Types ──────────────────────────────────────

type StorePrice = {
  storeId: string;
  chain: string;
  price: number;
  isSale: boolean;
};

type SearchResult = {
  id: string;
  name: string;
  brand: string | null;
  unitSize: string | null;
  imageUrl: string | null;
  category: string | null;
  bestPrice: number | null;
  bestStore: string | null;
  prices: StorePrice[];
  isWatched: boolean;
};

const STORE_COLORS: Record<string, string> = {
  walmart: "#0071ce",
  loblaws: "#c8102e",
  metro: "#e30000",
  sobeys: "#d62b2b",
  dollarama: "#00853e",
};

const RECENT_SEARCHES_KEY = "sentinel_recent_searches";
const MAX_RECENT = 8;

function getRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string) {
  const existing = getRecentSearches().filter((q) => q !== query);
  const updated = [query, ...existing].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
}

function removeRecentSearch(query: string) {
  const updated = getRecentSearches().filter((q) => q !== query);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
}

// ── Result card ────────────────────────────────

function ResultCard({
  result,
  onAddToList,
  onToggleWatch,
}: {
  result: SearchResult;
  onAddToList: (id: string, name: string) => void;
  onToggleWatch: (id: string, watched: boolean) => void;
}) {
  return (
    <div className="mx-4 mb-2.5 bg-white dark:bg-[#1e2528] border border-[#ebebeb] dark:border-[#2e3538] rounded-[14px] p-3">
      <div className="flex items-center gap-3">
        {/* Image */}
        <Link href={`/product/${result.id}`} className="flex-shrink-0">
          <div className="w-12 h-12 rounded-[10px] bg-[#f7f7f7] dark:bg-[#242b2e] flex items-center justify-center overflow-hidden">
            {result.imageUrl ? (
              <img
                src={result.imageUrl}
                alt={result.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-[22px]">🛒</span>
            )}
          </div>
        </Link>

        {/* Info */}
        <Link href={`/product/${result.id}`} className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-[#111] dark:text-[#e0e0e0] truncate">
            {result.name}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            {result.brand && (
              <span className="text-[11px] text-[#aaa] dark:text-[#555]">
                {result.brand}
              </span>
            )}
            {result.unitSize && (
              <span className="text-[11px] text-[#aaa] dark:text-[#555]">
                · {result.unitSize}
              </span>
            )}
          </div>
        </Link>

        {/* Price */}
        <div className="text-right flex-shrink-0">
          {result.bestPrice != null ? (
            <>
              <p className="text-[17px] font-medium text-[#00b89e]">
                ${result.bestPrice.toFixed(2)}
              </p>
              {result.bestStore && (
                <div className="flex items-center justify-end gap-1 mt-0.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background: STORE_COLORS[result.bestStore] ?? "#aaa",
                    }}
                  />
                  <span className="text-[10px] text-[#888] dark:text-[#555] capitalize">
                    {result.bestStore}
                  </span>
                </div>
              )}
            </>
          ) : (
            <p className="text-[12px] text-[#aaa]">No price</p>
          )}
        </div>
      </div>

      {/* Actions row */}
      <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-[#f5f5f5] dark:border-[#242b2e]">
        <button
          onClick={() => onAddToList(result.id, result.name)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#f4f4f4] dark:bg-[#242b2e] text-[12px] font-medium text-[#555] dark:text-[#aaa] active:scale-95 transition-transform"
        >
          <Plus size={13} strokeWidth={2} />
          Add to list
        </button>
        <button
          onClick={() => onToggleWatch(result.id, result.isWatched)}
          className={[
            "flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-medium transition-all active:scale-95",
            result.isWatched
              ? "bg-[#f0fdf9] dark:bg-[#1a2e2a] text-[#00b89e] border border-[#b2f0e4] dark:border-[#1e4a3a]"
              : "bg-[#f4f4f4] dark:bg-[#242b2e] text-[#555] dark:text-[#aaa]",
          ].join(" ")}
        >
          {result.isWatched ? (
            <BellOff size={13} strokeWidth={1.5} />
          ) : (
            <Bell size={13} strokeWidth={1.5} />
          )}
          {result.isWatched ? "Watching" : "Watch"}
        </button>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────

export default function SearchPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [addToListTarget, setAddToListTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Load recent searches on mount
  useEffect(() => {
    setRecentSearches(getRecentSearches());
    inputRef.current?.focus();
  }, []);

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/products?q=${encodeURIComponent(q)}&limit=20`,
      );
      const data = res.ok ? await res.json() : [];
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleQueryChange(value: string) {
    setQuery(value);
    clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => doSearch(value), 350);
  }

  function handleRecentTap(q: string) {
    setQuery(q);
    doSearch(q);
  }

  function handleSubmit() {
    if (!query.trim()) return;
    saveRecentSearch(query.trim());
    setRecentSearches(getRecentSearches());
    doSearch(query);
  }

  function handleRemoveRecent(q: string, e: React.MouseEvent) {
    e.stopPropagation();
    removeRecentSearch(q);
    setRecentSearches(getRecentSearches());
  }

  async function handleToggleWatch(productId: string, isWatched: boolean) {
    const method = isWatched ? "DELETE" : "POST";
    const res = await fetch("/api/watchlist", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    });
    if (res.ok) {
      setResults((prev) =>
        prev.map((r) =>
          r.id === productId ? { ...r, isWatched: !isWatched } : r,
        ),
      );
    }
  }

  const showRecent = !query && recentSearches.length > 0;
  const showResults = !!query;

  return (
    <div className="min-h-screen bg-white dark:bg-[#0f1416]">
      {/* Search header */}
      <div className="sticky top-safe z-10 bg-white dark:bg-[#0f1416] px-4 pt-4 pb-3 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-xl bg-[#f4f4f4] dark:bg-[#1e2528] flex items-center justify-center flex-shrink-0"
        >
          <ArrowLeft size={16} className="text-[#555] dark:text-[#aaa]" />
        </button>

        <div className="flex-1 h-[42px] bg-[#f4f4f4] dark:bg-[#242b2e] rounded-xl flex items-center px-3 gap-2">
          <Search
            size={14}
            className="text-[#bbb] flex-shrink-0"
            strokeWidth={1.5}
          />
          <input
            ref={inputRef}
            type="search"
            placeholder="Search groceries..."
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            className="flex-1 bg-transparent text-[14px] text-[#111] dark:text-[#e0e0e0] placeholder-[#bbb] outline-none"
          />
          {query && (
            <button
              onClick={() => {
                setQuery("");
                setResults([]);
              }}
            >
              <X size={14} className="text-[#bbb]" />
            </button>
          )}
        </div>
      </div>

      {/* Recent searches */}
      {showRecent && (
        <div className="px-4 pt-2">
          <p className="text-[11px] font-medium text-[#aaa] dark:text-[#555] uppercase tracking-[0.8px] mb-3">
            Recent
          </p>
          <div className="flex flex-col">
            {recentSearches.map((q) => (
              <button
                key={q}
                onClick={() => handleRecentTap(q)}
                className="flex items-center gap-3 py-2.5 border-b border-[#f5f5f5] dark:border-[#1e2528] last:border-0"
              >
                <Clock
                  size={14}
                  className="text-[#ccc] dark:text-[#444] flex-shrink-0"
                />
                <span className="flex-1 text-[13px] text-[#444] dark:text-[#bbb] text-left">
                  {q}
                </span>
                <button
                  onClick={(e) => handleRemoveRecent(q, e)}
                  className="p-1"
                >
                  <X size={12} className="text-[#ccc] dark:text-[#444]" />
                </button>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty state — no query, no recent */}
      {!query && recentSearches.length === 0 && (
        <div className="flex flex-col items-center justify-center pt-24 px-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#f4f4f4] dark:bg-[#1e2528] flex items-center justify-center mb-4">
            <Search size={24} className="text-[#ccc]" strokeWidth={1.5} />
          </div>
          <p className="text-[15px] font-medium text-[#111] dark:text-[#e0e0e0] mb-2">
            Search for groceries
          </p>
          <p className="text-[13px] text-[#aaa] leading-relaxed">
            Find products, compare prices across stores, and add them to your
            lists.
          </p>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="pt-2 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="mx-4 mb-2.5 rounded-[14px] border border-[#ebebeb] dark:border-[#2e3538] p-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-[10px] bg-[#f0f0f0] dark:bg-[#242b2e]" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-36 rounded bg-[#f0f0f0] dark:bg-[#242b2e]" />
                  <div className="h-2.5 w-20 rounded bg-[#f0f0f0] dark:bg-[#242b2e]" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-4 w-12 rounded bg-[#f0f0f0] dark:bg-[#242b2e]" />
                  <div className="h-2.5 w-16 rounded bg-[#f0f0f0] dark:bg-[#242b2e]" />
                </div>
              </div>
              <div className="h-8 rounded-xl bg-[#f0f0f0] dark:bg-[#242b2e] mt-2.5" />
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {showResults && !loading && (
        <div className="pt-2 pb-24">
          {results.length === 0 ? (
            <div className="flex flex-col items-center pt-16 px-8 text-center">
              <p className="text-[14px] font-medium text-[#111] dark:text-[#e0e0e0] mb-2">
                No results for &ldquo;{query}&rdquo;
              </p>
              <p className="text-[13px] text-[#aaa]">
                Try a different search term or browse by category.
              </p>
            </div>
          ) : (
            <>
              <p className="text-[11px] font-medium text-[#aaa] dark:text-[#555] uppercase tracking-[0.8px] px-4 mb-2">
                {results.length} result{results.length !== 1 ? "s" : ""}
              </p>
              {results.map((result) => (
                <ResultCard
                  key={result.id}
                  result={result}
                  onAddToList={(id, name) => setAddToListTarget({ id, name })}
                  onToggleWatch={handleToggleWatch}
                />
              ))}
            </>
          )}
        </div>
      )}

      {/* Add to list sheet */}
      {addToListTarget && (
        <AddToListSheet
          productId={addToListTarget.id}
          productName={addToListTarget.name}
          onClose={() => setAddToListTarget(null)}
        />
      )}
    </div>
  );
}
