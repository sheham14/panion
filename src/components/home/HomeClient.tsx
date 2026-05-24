"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Search,
  Trash2,
  Plus,
  Check,
  X,
  LayoutGrid,
  LayoutList,
  Bell,
  Package2,
} from "lucide-react";
import AddToListSheet from "@/components/search/AddToListSheet";

// ── Types ──────────────────────────────────────

type StorePrice = { price: number; scrapedAt: string } | null;

type WatchlistItem = {
  watchlistId: string;
  productId: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  unitSize: string | null;
  prices: Record<string, StorePrice>;
  bestPrice: number | null;
  bestStore: string | null;
  notifyOnDrop: boolean;
  notifyOnRise: boolean;
};

type Store = {
  id: string;
  chain: string;
  name: string;
  total: number;
  color: string;
  bg: string;
  letter: string;
};

type WatchlistSummary = {
  items: WatchlistItem[];
  stores: Store[];
  storeTotals: Record<string, number>;
  bestStore: string | null;
};

// ── Notification state ─────────────────────────
// 0 = none, 1 = drop only, 2 = drop + rise

type NotifState = 0 | 1 | 2;

function getNotifState(
  notifyOnDrop: boolean,
  notifyOnRise: boolean,
): NotifState {
  if (notifyOnDrop && notifyOnRise) return 2;
  if (notifyOnDrop) return 1;
  return 0;
}

function nextNotifState(current: NotifState): NotifState {
  if (current === 0) return 1;
  if (current === 1) return 2;
  return 0;
}

function notifStateToFields(state: NotifState) {
  return {
    notifyOnDrop: state === 1 || state === 2,
    notifyOnRise: state === 2,
  };
}

// ── Bell icon ──────────────────────────────────

function BellIcon({ state }: { state: NotifState }) {
  if (state === 0) {
    return (
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <path
          d="M6.5 1.5C4.3 1.5 2.5 3.3 2.5 5.5V8L1.5 9.5H11.5L10.5 8V5.5C10.5 3.3 8.7 1.5 6.5 1.5Z"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <path
          d="M5.5 10.5C5.5 11.1 5.9 11.5 6.5 11.5C7.1 11.5 7.5 11.1 7.5 10.5"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <line
          x1="2"
          y1="2"
          x2="11"
          y2="11"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (state === 1) {
    return (
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <path
          d="M6.5 1.5C4.3 1.5 2.5 3.3 2.5 5.5V8L1.5 9.5H11.5L10.5 8V5.5C10.5 3.3 8.7 1.5 6.5 1.5Z"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <path
          d="M5.5 10.5C5.5 11.1 5.9 11.5 6.5 11.5C7.1 11.5 7.5 11.1 7.5 10.5"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <path d="M6.5 4.5L5 6H8L6.5 4.5Z" fill="currentColor" />
      </svg>
    );
  }
  // state === 2: drop + rise
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path
        d="M6.5 1.5C4.3 1.5 2.5 3.3 2.5 5.5V8L1.5 9.5H11.5L10.5 8V5.5C10.5 3.3 8.7 1.5 6.5 1.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M5.5 10.5C5.5 11.1 5.9 11.5 6.5 11.5C7.1 11.5 7.5 11.1 7.5 10.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M5.5 4.5L4.5 6H6.5L5.5 4.5Z" fill="currentColor" />
      <path d="M7.5 7.5L8.5 6H6.5L7.5 7.5Z" fill="currentColor" />
    </svg>
  );
}

// ── Freshness helper ───────────────────────────

function getFreshness(scrapedAt: string | undefined) {
  if (!scrapedAt) return { label: "Unable to verify", color: "bg-[#9ca3af]" };
  const days = Math.floor(
    (Date.now() - new Date(scrapedAt).getTime()) / 86400000,
  );
  if (days === 0) return { label: "Updated today", color: "bg-[#22c55e]" };
  if (days <= 3) return { label: `${days}d ago`, color: "bg-[#22c55e]" };
  if (days <= 7) return { label: `${days} days ago`, color: "bg-[#f59e0b]" };
  if (days <= 14) return { label: `${days} days ago`, color: "bg-[#ef4444]" };
  return { label: "Unable to verify", color: "bg-[#9ca3af]" };
}

// ── Product card ───────────────────────────────

function ProductCard({
  item,
  activeChain,
  selectMode,
  selected,
  gridView,
  onSelect,
  onBellCycle,
  onSwipeDelete,
}: {
  item: WatchlistItem;
  activeChain: string | null;
  selectMode: boolean;
  selected: boolean;
  gridView: boolean;
  onSelect: (id: string) => void;
  onBellCycle: (productId: string, current: NotifState) => void;
  onSwipeDelete: (productId: string) => void;
}) {
  const swipeRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const [swiped, setSwiped] = useState(false);

  const notifState = getNotifState(item.notifyOnDrop, item.notifyOnRise);
  const priceData = activeChain ? item.prices[activeChain] : null;
  const displayPrice = priceData?.price ?? item.bestPrice;
  const displayStore = activeChain ?? item.bestStore;
  const freshness = getFreshness(
    activeChain
      ? item.prices[activeChain]?.scrapedAt
      : item.bestStore
        ? item.prices[item.bestStore]?.scrapedAt
        : undefined,
  );

  // Swipe handlers
  function onTouchStart(e: React.TouchEvent) {
    if (selectMode) return;
    startX.current = e.touches[0].clientX;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (selectMode) return;
    const diff = startX.current - e.changedTouches[0].clientX;
    if (diff > 60) {
      setSwiped(true);
    } else if (diff < -20) {
      setSwiped(false);
    }
  }

  if (gridView) {
    return (
      <div
        className={[
          "bg-white dark:bg-[#1e2528] border rounded-[14px] overflow-hidden",
          selected
            ? "border-[#00E5C3]"
            : "border-[#ebebeb] dark:border-[#2e3538]",
        ].join(" ")}
      >
        {/* Image */}
        <Link href={`/product/${item.productId}`} className="block">
          <div className="relative w-full aspect-square bg-[#f7f7f7] dark:bg-[#242b2e] flex items-center justify-center overflow-hidden">
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt={item.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-[32px]">🛒</span>
            )}
            {selectMode && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onSelect(item.productId);
                }}
                className={[
                  "absolute top-2 right-2 w-5 h-5 rounded-full border flex items-center justify-center",
                  selected
                    ? "bg-[#00E5C3] border-[#00E5C3]"
                    : "border-[#e0e0e0] bg-white/80 dark:bg-black/40",
                ].join(" ")}
              >
                {selected && (
                  <Check
                    size={10}
                    className="text-[#004d40]"
                    strokeWidth={2.5}
                  />
                )}
              </button>
            )}
          </div>
        </Link>
        {/* Info */}
        <div className="p-2.5">
          <Link href={`/product/${item.productId}`}>
            <p className="text-[12px] font-medium text-[#111] dark:text-[#e0e0e0] line-clamp-2 leading-tight mb-1.5">
              {item.name}
            </p>
          </Link>
          <div className="flex items-end justify-between gap-1">
            <div>
              {displayPrice != null ? (
                <p className="text-[15px] font-semibold text-[#00b89e]">
                  ${displayPrice.toFixed(2)}
                </p>
              ) : (
                <p className="text-[11px] text-[#aaa]">No price</p>
              )}
              {displayStore && (
                <p className="text-[10px] text-[#888] dark:text-[#555] capitalize">
                  {displayStore}
                </p>
              )}
            </div>
            {!selectMode && (
              <button
                onClick={() => onBellCycle(item.productId, notifState)}
                className={[
                  "w-6 h-6 rounded-[7px] border flex items-center justify-center flex-shrink-0 transition-all",
                  notifState === 0
                    ? "border-[#ebebeb] dark:border-[#2e3538] text-[#ccc] dark:text-[#444]"
                    : "border-[#c0f5ed] dark:border-[#1e4a3a] bg-[#f0fdf9] dark:bg-[#1a2e2a] text-[#00b89e]",
                ].join(" ")}
              >
                <BellIcon state={notifState} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden mx-4 mb-2.5">
      {/* Delete reveal */}
      <div className="absolute right-0 top-0 bottom-0 flex items-center justify-end pr-3 bg-[#fef2f2] dark:bg-[#3a1a1a] rounded-[14px] w-full">
        <button
          onClick={() => onSwipeDelete(item.productId)}
          className="flex items-center gap-1.5 text-[#ef4444] text-[12px] font-medium pr-1"
        >
          <Trash2 size={14} strokeWidth={1.5} />
          Remove
        </button>
      </div>

      {/* Card */}
      <div
        ref={swipeRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className={[
          "bg-white dark:bg-[#1e2528] border border-[#ebebeb] dark:border-[#2e3538] rounded-[14px] p-3 flex items-center gap-3 transition-transform duration-200",
          swiped ? "-translate-x-24" : "translate-x-0",
        ].join(" ")}
      >
        {/* Select checkbox */}
        {selectMode && (
          <button
            onClick={() => onSelect(item.productId)}
            className={[
              "w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-all",
              selected
                ? "bg-[#00E5C3] border-[#00E5C3]"
                : "border-[#e0e0e0] dark:border-[#2e3538]",
            ].join(" ")}
          >
            {selected && (
              <Check size={10} className="text-[#004d40]" strokeWidth={2.5} />
            )}
          </button>
        )}

        {/* Image */}
        <Link href={`/product/${item.productId}`} className="flex-shrink-0">
          <div className="w-12 h-12 rounded-[10px] bg-[#f7f7f7] dark:bg-[#242b2e] flex items-center justify-center text-[22px] overflow-hidden">
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt={item.name}
                className="w-full h-full object-cover"
              />
            ) : (
              "🛒"
            )}
          </div>
        </Link>

        {/* Info */}
        <Link href={`/product/${item.productId}`} className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-[#111] dark:text-[#e0e0e0] truncate">
            {item.name}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {item.brand && (
              <span className="text-[11px] text-[#aaa] dark:text-[#555]">
                {item.brand}
              </span>
            )}
            <div className="flex items-center gap-1">
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${freshness.color}`}
              />
              <span className="text-[10px] text-[#aaa] dark:text-[#555]">
                {freshness.label}
              </span>
            </div>
          </div>
        </Link>

        {/* Price */}
        <div className="text-right flex-shrink-0">
          {displayPrice != null ? (
            <>
              <p className="text-[17px] font-medium text-[#00b89e]">
                ${displayPrice.toFixed(2)}
              </p>
              {displayStore && (
                <p className="text-[10px] text-[#888] dark:text-[#555] mt-0.5 capitalize">
                  {displayStore}
                </p>
              )}
            </>
          ) : (
            <p className="text-[12px] text-[#aaa]">No price</p>
          )}
        </div>

        {/* Bell */}
        {!selectMode && (
          <button
            onClick={(e) => {
              e.preventDefault();
              onBellCycle(item.productId, notifState);
            }}
            className={[
              "w-7 h-7 rounded-[8px] border flex items-center justify-center flex-shrink-0 transition-all",
              notifState === 0
                ? "border-[#ebebeb] dark:border-[#2e3538] text-[#ccc] dark:text-[#444]"
                : "border-[#c0f5ed] dark:border-[#1e4a3a] bg-[#f0fdf9] dark:bg-[#1a2e2a] text-[#00b89e]",
            ].join(" ")}
          >
            <BellIcon state={notifState} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────

export default function HomeClient({
  data,
  userName,
  userImage,
  hasUnreadAlerts,
}: {
  data: WatchlistSummary;
  userName: string | null;
  userImage: string | null;
  hasUnreadAlerts: boolean;
}) {
  const [items, setItems] = useState(data.items);
  const [activeChain, setActiveChain] = useState<string | null>(null);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [gridView, setGridView] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("watchlist_grid_view") === "true",
  );
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addToListTargets, setAddToListTargets] = useState<
    { id: string; name: string }[] | null
  >(null);

  const lastScrollY = useRef(0);
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  useEffect(() => {
    if (headerRef.current) setHeaderHeight(headerRef.current.offsetHeight);
  }, [data.stores.length]);

  const handleScroll = useCallback(() => {
    const currentY = window.scrollY;
    const delta = currentY - lastScrollY.current;
    if (delta > 8 && currentY > headerHeight) setHeaderVisible(false);
    else if (delta < -8) setHeaderVisible(true);
    lastScrollY.current = currentY;
  }, [headerHeight]);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const { stores } = data;

  const visibleItems = activeChain
    ? items.filter((item) => item.prices[activeChain] != null)
    : items;

  const initials = userName
    ? userName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "?";

  // ── Actions ──────────────────────────────────

  async function handleSwipeDelete(productId: string) {
    const res = await fetch(`/api/watchlist/${productId}`, {
      method: "DELETE",
    });
    if (res.ok)
      setItems((prev) => prev.filter((i) => i.productId !== productId));
  }

  async function handleBulkDelete() {
    await Promise.all(
      [...selectedIds].map((id) =>
        fetch(`/api/watchlist/${id}`, { method: "DELETE" }),
      ),
    );
    setItems((prev) => prev.filter((i) => !selectedIds.has(i.productId)));
    setSelectedIds(new Set());
    setSelectMode(false);
  }

  async function handleBellCycle(productId: string, current: NotifState) {
    const next = nextNotifState(current);
    const fields = notifStateToFields(next);
    const res = await fetch(`/api/watchlist/${productId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (res.ok) {
      setItems((prev) =>
        prev.map((i) => (i.productId === productId ? { ...i, ...fields } : i)),
      );
    }
  }

  async function handleBulkBellCycle() {
    const selectedItems = items.filter((i) => selectedIds.has(i.productId));
    // Use the first selected item's state to determine next state for all
    const firstState = getNotifState(
      selectedItems[0]?.notifyOnDrop ?? true,
      selectedItems[0]?.notifyOnRise ?? false,
    );
    const next = nextNotifState(firstState);
    const fields = notifStateToFields(next);
    await Promise.all(
      [...selectedIds].map((id) =>
        fetch(`/api/watchlist/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fields),
        }),
      ),
    );
    setItems((prev) =>
      prev.map((i) => (selectedIds.has(i.productId) ? { ...i, ...fields } : i)),
    );
  }

  function handleSelect(productId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(productId) ? next.delete(productId) : next.add(productId);
      return next;
    });
  }

  function handleAddSelectedToList() {
    const targets = items
      .filter((i) => selectedIds.has(i.productId))
      .map((i) => ({ id: i.productId, name: i.name }));
    setAddToListTargets(targets);
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  return (
    <div>
      {/* ── Sticky header ── */}
      <div
        ref={headerRef}
        className={[
          "sticky top-0 z-10 bg-white dark:bg-[#0f1416] transition-transform duration-300 ease-in-out",
          headerVisible ? "translate-y-0" : "-translate-y-full",
        ].join(" ")}
      >
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-2">
          <Link href="/profile-settings">
            <div className="w-[34px] h-[34px] rounded-full bg-[#e0faf4] dark:bg-[#1a2e2a] flex items-center justify-center flex-shrink-0 overflow-hidden">
              {userImage ? (
                <img
                  src={userImage}
                  alt={userName ?? ""}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-[12px] font-medium text-[#0a7a62]">
                  {initials}
                </span>
              )}
            </div>
          </Link>
          <Link
            href="/search"
            className="flex-1 h-[38px] bg-[#f4f4f4] dark:bg-[#242b2e] rounded-xl flex items-center px-2.5 gap-2"
          >
            <Search
              size={14}
              className="text-[#bbb] flex-shrink-0"
              strokeWidth={1.5}
            />
            <span className="text-[13px] text-[#aaa] flex-1">
              Search groceries...
            </span>
          </Link>

          <Link
            href="/browse"
            className="w-[34px] h-[34px] rounded-full bg-[#f4f4f4] dark:bg-[#242b2e] flex items-center justify-center flex-shrink-0"
          >
            <Package2 size={16} strokeWidth={1.5} className="text-[#888] dark:text-[#aaa]" />
          </Link>
          <Link
            href="/alerts"
            className="relative w-[34px] h-[34px] rounded-full bg-[#f4f4f4] dark:bg-[#242b2e] flex items-center justify-center flex-shrink-0"
          >
            <Bell
              size={16}
              strokeWidth={1.5}
              className="text-[#888] dark:text-[#aaa]"
            />
            {hasUnreadAlerts && (
              <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-[#ff5252] border-[1.5px] border-white dark:border-[#0f1416]" />
            )}
          </Link>
        </div>

        {stores.length > 0 && (
          <div className="pb-3">
            <p className="text-[11px] font-medium text-[#aaa] dark:text-[#555] tracking-[0.8px] uppercase px-4 mb-2">
              Your stores
            </p>
            <div className="flex gap-2 px-4 overflow-x-auto scrollbar-subtle">
              {stores.map((store) => {
                const isActive = activeChain === store.chain;
                return (
                  <button
                    key={store.chain}
                    onClick={() =>
                      setActiveChain(isActive ? null : store.chain)
                    }
                    className={[
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12px] font-medium flex-shrink-0 transition-all active:scale-95",
                      isActive
                        ? "bg-[#00E5C3] border-[#00E5C3] text-[#004d40]"
                        : "bg-white dark:bg-[#1e2528] border-[#e0e0e0] dark:border-[#2e3538] text-[#333] dark:text-[#ccc]",
                    ].join(" ")}
                  >
                    <span
                      className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                      style={{ background: store.bg, color: store.color }}
                    >
                      {store.letter}
                    </span>
                    {store.name.split(" ")[0]}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Scrollable content ── */}
      <div className="pt-2">
        {/* Price tracking header */}
        <div className="flex items-center justify-between px-4 mb-2">
          <p className="text-[11px] font-medium text-[#aaa] dark:text-[#555] tracking-[0.8px] uppercase">
            Price tracking
          </p>
          {items.length > 0 && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const next = !gridView;
                  setGridView(next);
                  localStorage.setItem("watchlist_grid_view", String(next));
                }}
                className={
                  gridView ? "text-[#00b89e]" : "text-[#aaa] dark:text-[#555]"
                }
              >
                {gridView ? (
                  <LayoutList size={16} strokeWidth={1.5} />
                ) : (
                  <LayoutGrid size={16} strokeWidth={1.5} />
                )}
              </button>
              <button
                onClick={() =>
                  selectMode ? exitSelectMode() : setSelectMode(true)
                }
                className="text-[12px] font-medium text-[#00b89e]"
              >
                {selectMode ? "Cancel" : "Select"}
              </button>
            </div>
          )}
        </div>

        {visibleItems.length === 0 ? (
          <div className="mx-4 py-12 flex flex-col items-center gap-3 text-center">
            <p className="text-[14px] text-[#aaa]">
              {activeChain
                ? `No prices found at ${activeChain}`
                : "Your watchlist is empty"}
            </p>
            <Link
              href="/search"
              className="px-4 py-2 bg-[#00E5C3] rounded-xl text-[13px] font-medium text-[#004d40]"
            >
              Add products
            </Link>
          </div>
        ) : gridView ? (
          <div className="grid grid-cols-2 gap-2.5 px-4 pb-[100px]">
            {visibleItems.map((item) => (
              <ProductCard
                key={item.watchlistId}
                item={item}
                activeChain={activeChain}
                selectMode={selectMode}
                selected={selectedIds.has(item.productId)}
                gridView={true}
                onSelect={handleSelect}
                onBellCycle={handleBellCycle}
                onSwipeDelete={handleSwipeDelete}
              />
            ))}
          </div>
        ) : (
          <div className="pb-[100px]">
            {visibleItems.map((item) => (
              <ProductCard
                key={item.watchlistId}
                item={item}
                activeChain={activeChain}
                selectMode={selectMode}
                selected={selectedIds.has(item.productId)}
                gridView={false}
                onSelect={handleSelect}
                onBellCycle={handleBellCycle}
                onSwipeDelete={handleSwipeDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Select mode action bar ── */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-[72px] left-1/2 -translate-x-1/2 w-full max-w-sm px-4 z-20">
          <div className="bg-white dark:bg-[#1e2528] border border-[#e0e0e0] dark:border-[#2e3538] rounded-2xl shadow-lg p-3 flex items-center gap-2">
            <span className="text-[12px] text-[#aaa] flex-shrink-0">
              {selectedIds.size} selected
            </span>
            <div className="flex-1 flex gap-2 justify-end">
              <button
                onClick={handleBulkBellCycle}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#f0fdf9] dark:bg-[#1a2e2a] text-[#00b89e] text-[12px] font-medium"
              >
                <BellIcon state={1} />
                Notify
              </button>
              <button
                onClick={handleAddSelectedToList}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#f4f4f4] dark:bg-[#242b2e] text-[#555] dark:text-[#aaa] text-[12px] font-medium"
              >
                <Plus size={13} strokeWidth={2} />
                Add to list
              </button>
              <button
                onClick={handleBulkDelete}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#fef2f2] dark:bg-[#3a1a1a] text-[#ef4444] text-[12px] font-medium"
              >
                <Trash2 size={13} strokeWidth={1.5} />
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add to list sheet */}
      {addToListTargets && addToListTargets.length > 0 && (
        <AddToListSheet
          productId={addToListTargets[0].id}
          productName={
            addToListTargets.length === 1
              ? addToListTargets[0].name
              : `${addToListTargets.length} products`
          }
          onClose={() => {
            setAddToListTargets(null);
            exitSelectMode();
          }}
        />
      )}
    </div>
  );
}
