"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Plus, Check, Trash2, Pencil } from "lucide-react";
import EditItemSheet from "@/components/lists/EditItemSheet";
import ListDropdown from "@/components/lists/ListDropdown";
import ListOptionsMenu from "@/components/lists/ListOptionsMenu";
import PantryFromListSheet from "@/components/pantry/PantryFromListSheet";
import { calculateEffectivePrice } from "@/lib/unit-convert";
import { getStoreMeta } from "@/lib/store-meta";

// ── Types ──────────────────────────────────────

const STORE_META: Record<
  string,
  { color: string; bg: string; letter: string }
> = {
  walmart: { color: "#0071ce", bg: "#0071ce18", letter: "W" },
  loblaws: { color: "#c8102e", bg: "#c8102e18", letter: "L" },
  metro: { color: "#e30000", bg: "#e3000018", letter: "M" },
  sobeys: { color: "#d62b2b", bg: "#d62b2b18", letter: "S" },
  dollarama: { color: "#00853e", bg: "#00853e18", letter: "D" },
};

type StoreProduct = {
  id: string;
  currentPrice: number | null;
  isActive: boolean;
  store: {
    id: string;
    chain: string;
    name: string;
  };
};

type Product = {
  id: string;
  name: string;
  brand: string | null;
  unitSize: string | null;
  unitMeasure: string | null;
  unitQuantity: number | null;
  storeProducts: StoreProduct[];
};

type ProductSuggestion = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  bestPrice: number | null;
  bestStore: string | null;
};

type ListItem = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
  isChecked: boolean;
  sortOrder: number;
  customPrice: number | null;
  product: Product | null;
};

type GroceryList = {
  id: string;
  name: string;
  items: ListItem[];
};

type ListMeta = {
  id: string;
  name: string;
  itemCount: number;
};

// ── Helpers ────────────────────────────────────

function getBestPrice(
  product: Product | null,
): { price: number; chain: string } | null {
  if (!product) return null;
  const prices = product.storeProducts
    .filter((sp) => sp.currentPrice !== null)
    .map((sp) => ({ price: Number(sp.currentPrice), chain: sp.store.chain }))
    .sort((a, b) => a.price - b.price);
  return prices[0] ?? null;
}

function getEffectivePriceRange(
  product: Product | null,
  quantity: number,
  unit: string,
  customPrice: number | null,
): { min: number; max: number } | null {
  // Plain text item with custom price
  if (!product && customPrice !== null) {
    const total = customPrice * quantity;
    return { min: total, max: total };
  }

  if (!product) return null;

  const prices = product.storeProducts
    .filter((sp) => sp.currentPrice !== null)
    .map((sp) =>
      calculateEffectivePrice(
        Number(sp.currentPrice),
        product.unitQuantity,
        product.unitMeasure,
        product.unitSize,
        quantity,
        unit,
      ),
    )
    .filter((p): p is number => p !== null);

  if (!prices.length) return null;
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

function getStoreTotals(
  items: ListItem[],
  preferredChains: string[],
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const item of items) {
    if (item.isChecked) continue;
    const qty = Number(item.quantity ?? 1);
    const unit = item.unit ?? "each";

    // Plain text item with custom price — add to all preferred stores equally
    if (!item.product && item.customPrice !== null) {
      for (const chain of preferredChains) {
        totals[chain] = (totals[chain] ?? 0) + item.customPrice * qty;
      }
      continue;
    }

    if (!item.product) continue;

    for (const sp of item.product.storeProducts) {
      const chain = sp.store?.chain?.toLowerCase();
      if (!chain || !preferredChains.includes(chain)) continue;
      if (sp.currentPrice === null) continue;
      const effective = calculateEffectivePrice(
        Number(sp.currentPrice),
        item.product.unitQuantity,
        item.product.unitMeasure,
        item.product.unitSize,
        qty,
        unit,
      );
      if (effective !== null) {
        totals[chain] = (totals[chain] ?? 0) + effective;
      }
    }
  }
  return totals;
}

const LAST_LIST_KEY = "sentinel_last_list_id";

// ── List item row ──────────────────────────────

function ListItemRow({
  item,
  activeChain,
  onCheck,
  onEdit,
  onDelete,
  onQuantityChange,
}: {
  item: ListItem;
  activeChain: string | null;
  onCheck: (id: string) => void;
  onEdit: (item: ListItem) => void;
  onDelete: (id: string) => void;
  onQuantityChange: (id: string, quantity: number) => void;
}) {
  const startX = useRef(0);
  const [swiped, setSwiped] = useState(false);
  const qty = Number(item.quantity ?? 1);
  const unit = item.unit ?? "each";
  const priceRange = getEffectivePriceRange(
    item.product,
    qty,
    unit,
    item.customPrice,
  );

  const filteredSp =
    activeChain && item.product
      ? item.product.storeProducts.find(
          (sp) => sp.store.chain.toLowerCase() === activeChain.toLowerCase(),
        )
      : null;

  const filteredPrice =
    filteredSp?.currentPrice !== null && filteredSp?.currentPrice !== undefined
      ? calculateEffectivePrice(
          Number(filteredSp.currentPrice),
          item.product!.unitQuantity,
          item.product!.unitMeasure,
          item.product!.unitSize,
          qty,
          unit,
        )
      : null;

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
  }

  function onTouchEnd(e: React.TouchEvent) {
    const diff = startX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) < 10) return; // tap, not swipe
    if (diff > 60) setSwiped(true);
    else if (diff < -20) setSwiped(false);
  }

  return (
    <div className="relative overflow-hidden border-b border-[#f5f5f5] dark:border-[#1e2528]">
      {/* Swipe actions — only for active items */}
      {!item.isChecked && (
        <div className="absolute right-0 top-0 bottom-0 flex">
          <button
            onClick={() => {
              setSwiped(false);
              onEdit(item);
            }}
            className="w-10 flex items-center justify-center bg-[#f0fdf9] dark:bg-[#1a2e2a]"
          >
            <Pencil size={14} className="text-[#00b89e]" strokeWidth={1.5} />
          </button>
          <button
            onClick={() => onDelete(item.id)}
            className="w-10 flex items-center justify-center bg-[#fef2f2] dark:bg-[#2e1a1a]"
          >
            <Trash2 size={14} className="text-[#ef4444]" strokeWidth={1.5} />
          </button>
        </div>
      )}

      {/* Item row */}
      <div
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className={[
          "flex items-center gap-2.5 px-4 py-3 bg-white dark:bg-[#0f1416] transition-all duration-200",
          item.isChecked ? "opacity-50" : "",
          swiped && !item.isChecked ? "-translate-x-20" : "translate-x-0",
        ].join(" ")}
      >
        {/* Checkbox */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCheck(item.id);
          }}
          className={[
            "w-[22px] h-[22px] rounded-full border flex items-center justify-center flex-shrink-0 transition-all",
            item.isChecked
              ? "bg-[#00E5C3] border-[#00E5C3]"
              : "border-[#e0e0e0] dark:border-[#2e3538] bg-white dark:bg-[#1e2528]",
          ].join(" ")}
        >
          {item.isChecked && (
            <Check size={11} className="text-[#004d40]" strokeWidth={2.5} />
          )}
        </button>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p
            className={[
              "text-[15px] font-semibold truncate",
              item.isChecked
                ? "line-through text-[#aaa]"
                : "text-[#111] dark:text-[#e0e0e0]",
            ].join(" ")}
          >
            {item.name}
          </p>

          {/* Notes */}
          {item.notes && !item.isChecked && (
            <p className="text-[11px] text-[#bbb] dark:text-[#555] italic truncate mt-0.5">
              {item.notes}
            </p>
          )}

          {/* Price */}
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {activeChain && filteredPrice !== null ? (
              <span className="text-[12px] font-medium text-[#00b89e]">
                ${filteredPrice.toFixed(2)}
              </span>
            ) : priceRange ? (
              <span className="text-[12px] font-medium text-[#00b89e]">
                ${priceRange.min.toFixed(2)}
                {priceRange.min !== priceRange.max &&
                  ` – $${priceRange.max.toFixed(2)}`}
                {!item.product && (
                  <span className="text-[10px] text-[#bbb] ml-1">custom</span>
                )}
              </span>
            ) : (
              <span className="text-[11px] text-[#ccc]">Price unavailable</span>
            )}
          </div>
        </div>

        {/* Inline quantity — hidden for completed items */}
        {!item.isChecked ? (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (qty > 1) onQuantityChange(item.id, qty - 1);
              }}
              className="w-6 h-6 rounded-lg border border-[#e0e0e0] dark:border-[#2e3538] flex items-center justify-center text-[#888] dark:text-[#555]"
            >
              <svg width="10" height="2" viewBox="0 0 10 2" fill="none">
                <path
                  d="M1 1H9"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <span className="text-[12px] font-medium text-[#888] dark:text-[#aaa] min-w-[28px] text-center">
              {qty}
              {item.unit && item.unit !== "each" ? ` ${item.unit}` : ""}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (qty < 999) onQuantityChange(item.id, qty + 1);
              }}
              className="w-6 h-6 rounded-lg border border-[#e0e0e0] dark:border-[#2e3538] flex items-center justify-center text-[#888] dark:text-[#555]"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path
                  d="M5 1V9M1 5H9"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        ) : (
          // Completed — just show qty, no controls
          <span className="text-[12px] text-[#ccc] dark:text-[#444] flex-shrink-0">
            {qty}
            {item.unit && item.unit !== "each" ? ` ${item.unit}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────

export default function ListsClient({
  initialList,
  allLists,
  preferredStores,
}: {
  initialList: GroceryList | null;
  allLists: ListMeta[];
  preferredStores: { chain: string; name: string }[];
}) {
  const [lists, setLists] = useState<ListMeta[]>(allLists);
  const [activeList, setActiveList] = useState<GroceryList | null>(initialList);
  const [pantrySheetItems, setPantrySheetItems] = useState<typeof items>([]);
  const [showPantrySheet, setShowPantrySheet] = useState(false);
  const [items, setItems] = useState<ListItem[]>(initialList?.items ?? []);
  const filteredPreferredStores = preferredStores;
  const [activeChain, setActiveChain] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<ListItem | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const quantityDebounceRefs = useRef<Record<string, NodeJS.Timeout>>({});
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const searchDebounceRef = useRef<NodeJS.Timeout>();
  const fetchSuggestions = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSuggestions([]);
      return;
    }
    setSuggestionsLoading(true);
    try {
      const res = await fetch(
        `/api/products?q=${encodeURIComponent(q)}&limit=5`,
      );
      const data = res.ok ? await res.json() : [];
      setSuggestions(data);
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  }, []);

  const unchecked = items.filter((i) => !i.isChecked);
  const checked = items.filter((i) => i.isChecked);
  const preferredChains = preferredStores.map((s) => s.chain.toLowerCase());
  const storeTotals = getStoreTotals(items, preferredChains);

  const sortedTotals = Object.entries(storeTotals)
    .filter(([, t]) => t > 0)
    .sort((a, b) => a[1] - b[1]);
  const activeTotal = activeChain ? storeTotals[activeChain] : null;

  // Save last viewed list. The id is hoisted so the dependency array can name
  // exactly what the effect reads — depending on `activeList?.id` while the
  // body read the whole `activeList` object is what tripped exhaustive-deps.
  const activeListId = activeList?.id;
  useEffect(() => {
    if (activeListId) {
      localStorage.setItem(LAST_LIST_KEY, activeListId);
    }
  }, [activeListId]);

  // ── Switch list ────────────────────────────

  async function handleSwitchList(list: ListMeta) {
    const res = await fetch(`/api/lists/${list.id}`);
    if (!res.ok) return;
    const data = await res.json();
    setActiveList(data);
    setItems(data.items ?? []);
  }

  // ── Create list ────────────────────────────

  async function handleCreateList(name: string) {
    const res = await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return;
    const newList = await res.json();
    setLists((prev) => [
      ...prev,
      { id: newList.id, name: newList.name, itemCount: 0 },
    ]);
    setActiveList(newList);
    setItems([]);
  }

  // ── Add item ───────────────────────────────

  async function handleAddItem(productId?: string, productName?: string) {
    const name = productName ?? newItemName.trim();
    if (!name || !activeList) return;

    const res = await fetch(`/api/lists/${activeList.id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        productId: productId ?? null,
        quantity: 1,
        unit: "each",
      }),
    });
    if (!res.ok) return;
    const newItem = await res.json();
    setItems((prev) => [...prev, newItem]);
    setNewItemName("");
    setSuggestions([]);
    setLists((prev) =>
      prev.map((l) =>
        l.id === activeList.id ? { ...l, itemCount: l.itemCount + 1 } : l,
      ),
    );
  }

  // ── Check item ─────────────────────────────

  async function handleCheck(itemId: string) {
    const item = items.find((i) => i.id === itemId);
    if (!item || !activeList) return;
    const newChecked = !item.isChecked;
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, isChecked: newChecked } : i)),
    );
    await fetch(`/api/lists/${activeList.id}/items`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, isChecked: newChecked }),
    });
  }

  function handleQuantityChange(itemId: string, quantity: number) {
    if (!activeList) return;
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, quantity } : i)),
    );
    clearTimeout(quantityDebounceRefs.current[itemId]);
    quantityDebounceRefs.current[itemId] = setTimeout(async () => {
      await fetch(`/api/lists/${activeList.id}/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, quantity }),
      });
    }, 600);
  }

  async function handleClearCompleted() {
    if (!activeList) return;
    const completed = items.filter((i) => i.isChecked);
    if (!completed.length) return;
    setPantrySheetItems(completed);
    setShowPantrySheet(true);
  }

  async function executeClearCompleted() {
    if (!activeList) return;
    setItems((prev) => prev.filter((i) => !i.isChecked));
    await fetch(`/api/lists/${activeList.id}/items`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clearCompleted: true }),
    });
    setLists((prev) =>
      prev.map((l) =>
        l.id === activeList.id
          ? { ...l, itemCount: items.filter((i) => !i.isChecked).length }
          : l,
      ),
    );
  }

  async function handleClearAll() {
    if (!activeList) return;
    setItems([]);
    await fetch(`/api/lists/${activeList.id}/items`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clearAll: true }),
    });
    setLists((prev) =>
      prev.map((l) => (l.id === activeList.id ? { ...l, itemCount: 0 } : l)),
    );
  }

  async function handleDeleteList() {
    if (!activeList) return;
    await fetch(`/api/lists/${activeList.id}`, { method: "DELETE" });
    const remaining = lists.filter((l) => l.id !== activeList.id);
    setLists(remaining);
    if (remaining.length > 0) {
      handleSwitchList(remaining[0]);
    } else {
      setActiveList(null);
      setItems([]);
    }
  }

  // ── Edit item ──────────────────────────────

  async function handleSaveEdit(
    itemId: string,
    data: {
      quantity: number;
      unit: string;
      notes: string;
      customPrice: number | null;
    },
  ) {
    if (!activeList) return;
    const res = await fetch(`/api/lists/${activeList.id}/items`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, ...data }),
    });
    if (!res.ok) return;
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, ...data } : i)),
    );
  }

  // ── Delete item ────────────────────────────

  async function handleDelete(itemId: string) {
    if (!activeList) return;
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    await fetch(`/api/lists/${activeList.id}/items`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId }),
    });
    setLists((prev) =>
      prev.map((l) =>
        l.id === activeList.id
          ? { ...l, itemCount: Math.max(0, l.itemCount - 1) }
          : l,
      ),
    );
  }

  // ── Empty state ────────────────────────────

  if (!activeList && lists.length === 0) {
    return (
      <div className="h-[calc(100dvh-72px)] bg-white dark:bg-[#0f1416] flex flex-col items-center justify-center px-8 text-center pb-24">
        <div className="w-14 h-14 rounded-[18px] bg-[#f0fdf9] dark:bg-[#1a2e2a] flex items-center justify-center mb-4">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect
              x="4"
              y="3"
              width="16"
              height="18"
              rx="2"
              stroke="#00b89e"
              strokeWidth="1.5"
            />
            <path
              d="M8 8H16M8 12H16M8 16H12"
              stroke="#00b89e"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <p className="text-[15px] font-semibold text-[#111] dark:text-[#e0e0e0] mb-2">
          No lists yet
        </p>
        <p className="text-[13px] text-[#aaa] leading-relaxed mb-6">
          Create a grocery list to start tracking what you need and find the
          best prices.
        </p>
        <button
          onClick={() => handleCreateList("Weekly Groceries")}
          className="px-6 py-3 bg-[#00E5C3] rounded-xl text-[13px] font-medium text-[#004d40]"
        >
          Create your first list
        </button>
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-72px)] bg-white dark:bg-[#0f1416] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
        {activeList ? (
          <ListDropdown
            lists={lists}
            activeList={{
              id: activeList.id,
              name: activeList.name,
              itemCount: items.length,
            }}
            onSwitch={handleSwitchList}
            onCreate={handleCreateList}
          />
        ) : (
          <span />
        )}
        {activeList && (
          <ListOptionsMenu
            hasCompleted={checked.length > 0}
            onClearCompleted={handleClearCompleted}
            onClearAll={handleClearAll}
            onDeleteList={handleDeleteList}
          />
        )}
      </div>

      {/* Store filter pills */}
      {filteredPreferredStores.length > 0 && (
        <div className="flex gap-2 px-4 py-2.5 overflow-x-auto scrollbar-none flex-shrink-0">
          {filteredPreferredStores.map((store) => {
            const meta = getStoreMeta(store.chain);
            const isActive = activeChain === store.chain;
            return (
              <button
                key={store.chain}
                onClick={() => setActiveChain(isActive ? null : store.chain)}
                className={[
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium flex-shrink-0 transition-all",
                  isActive
                    ? "bg-[#00E5C3] border-[#00E5C3] text-[#004d40]"
                    : "bg-white dark:bg-[#1e2528] border-[#e0e0e0] dark:border-[#2e3538] text-[#333] dark:text-[#ccc]",
                ].join(" ")}
              >
                <span
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold"
                  style={{ background: meta?.bg, color: meta?.color }}
                >
                  {meta?.letter}
                </span>
                {store.name.split(" ")[0]}
              </button>
            );
          })}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-[220px]">
        {/* Active items */}
        {unchecked.map((item) => (
          <ListItemRow
            key={item.id}
            item={item}
            activeChain={activeChain}
            onCheck={handleCheck}
            onEdit={setEditingItem}
            onDelete={handleDelete}
            onQuantityChange={handleQuantityChange}
          />
        ))}

        {/* Add item row */}
        {addingItem ? (
          <div className="relative">
            {/* Suggestions dropdown */}
            {(suggestions.length > 0 || suggestionsLoading) && (
              <div className="absolute top-full left-0 right-0 mb-1 bg-white dark:bg-[#1e2528] border border-[#e0e0e0] dark:border-[#2e3538] rounded-xl shadow-lg overflow-hidden z-30">
                {suggestionsLoading ? (
                  <div className="flex flex-col gap-0">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 px-4 py-2.5 animate-pulse"
                      >
                        <div className="w-8 h-8 rounded-lg bg-[#f0f0f0] dark:bg-[#242b2e] flex-shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-2.5 w-28 rounded bg-[#f0f0f0] dark:bg-[#242b2e]" />
                          <div className="h-2 w-16 rounded bg-[#f0f0f0] dark:bg-[#242b2e]" />
                        </div>
                        <div className="h-3 w-10 rounded bg-[#f0f0f0] dark:bg-[#242b2e]" />
                      </div>
                    ))}
                  </div>
                ) : (
                  suggestions.map((s) => (
                    <button
                      key={s.id}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleAddItem(s.id, s.name)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#f7f7f7] dark:hover:bg-[#242b2e] transition-colors border-b border-[#f5f5f5] dark:border-[#1e2528] last:border-0"
                    >
                      <div className="w-8 h-8 rounded-lg bg-[#f7f7f7] dark:bg-[#242b2e] flex items-center justify-center text-[16px] flex-shrink-0">
                        🛒
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-[13px] font-medium text-[#111] dark:text-[#e0e0e0] truncate">
                          {s.name}
                        </p>
                        <p className="text-[11px] text-[#aaa] truncate">
                          {[s.brand, s.category?.replace(/_/g, " ")]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      {s.bestPrice !== null && (
                        <div className="text-right flex-shrink-0">
                          <p className="text-[12px] font-medium text-[#00b89e]">
                            ${s.bestPrice.toFixed(2)}
                          </p>
                          {s.bestStore && (
                            <p className="text-[10px] text-[#aaa] capitalize">
                              {s.bestStore}
                            </p>
                          )}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Input row */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#f5f5f5] dark:border-[#1e2528]">
              <div className="w-[22px] h-[22px] rounded-full border border-dashed border-[#ccc] dark:border-[#444] flex-shrink-0" />
              <input
                autoFocus
                type="text"
                placeholder="Search or type item name..."
                value={newItemName}
                onChange={(e) => {
                  const val = e.target.value;
                  setNewItemName(val);
                  clearTimeout(searchDebounceRef.current);
                  if (!val.trim()) {
                    setSuggestions([]);
                    return;
                  }
                  searchDebounceRef.current = setTimeout(
                    () => fetchSuggestions(val),
                    350,
                  );
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddItem();
                  if (e.key === "Escape") {
                    setAddingItem(false);
                    setNewItemName("");
                    setSuggestions([]);
                  }
                }}
                onBlur={() => {
                  setTimeout(() => setSuggestions([]), 150);
                }}
                className="flex-1 text-[13px] bg-transparent text-[#111] dark:text-[#e0e0e0] placeholder-[#bbb] outline-none"
              />
              <button
                onClick={() => handleAddItem()}
                className="text-[12px] font-medium text-[#00b89e]"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setAddingItem(false);
                  setNewItemName("");
                  setSuggestions([]);
                }}
                className="text-[12px] text-[#aaa]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => {
              setNewItemName("");
              setAddingItem(true);
            }}
            className="flex items-center gap-3 px-4 py-3 w-full text-left border-b border-[#f5f5f5] dark:border-[#1e2528]"
          >
            <div className="w-[22px] h-[22px] rounded-full border border-dashed border-[#ccc] dark:border-[#444] flex items-center justify-center flex-shrink-0">
              <Plus size={11} className="text-[#ccc] dark:text-[#444]" />
            </div>
            <span className="text-[13px] text-[#ccc] dark:text-[#444]">
              Add item
            </span>
          </button>
        )}

        {/* Checked items */}
        {checked.length > 0 && (
          <>
            <div className="flex items-center justify-between px-4 py-2">
              <p className="text-[10px] font-semibold text-[#ccc] dark:text-[#444] uppercase tracking-wider">
                Completed
              </p>
              <button
                onClick={handleClearCompleted}
                className="text-[11px] font-medium text-[#ef4444]"
              >
                Clear all
              </button>
            </div>
            {checked.map((item) => (
              <ListItemRow
                key={item.id}
                item={item}
                activeChain={activeChain}
                onCheck={handleCheck}
                onEdit={setEditingItem}
                onDelete={handleDelete}
                onQuantityChange={handleQuantityChange}
              />
            ))}
          </>
        )}

        {/* Empty state */}
        {items.length === 0 && !addingItem && (
          <div className="flex flex-col items-center py-16 px-8 text-center">
            <div className="w-14 h-14 rounded-[18px] bg-[#f0fdf9] dark:bg-[#1a2e2a] flex items-center justify-center mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect
                  x="4"
                  y="3"
                  width="16"
                  height="18"
                  rx="2"
                  stroke="#00b89e"
                  strokeWidth="1.5"
                />
                <path
                  d="M8 8H16M8 12H16M8 16H12"
                  stroke="#00b89e"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <p className="text-[15px] font-semibold text-[#111] dark:text-[#e0e0e0] mb-2">
              Your list is empty
            </p>
            <p className="text-[13px] text-[#aaa] leading-relaxed mb-6">
              Start adding items and we&apos;ll find the best prices across your
              stores.
            </p>
            <button
              onClick={() => setAddingItem(true)}
              className="px-5 py-2.5 bg-[#00E5C3] rounded-xl text-[13px] font-medium text-[#004d40]"
            >
              Add first item
            </button>
          </div>
        )}
      </div>

      {/* FAB — add item */}
      <button
        onClick={() => { setNewItemName(""); setAddingItem(true); }}
        className={[
          "fixed right-4 z-10 w-12 h-12 bg-[#00E5C3] rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-all",
          unchecked.length > 0
            ? "bottom-[calc(220px+env(safe-area-inset-bottom,0px))]"
            : "bottom-above-nav",
        ].join(" ")}
        aria-label="Add item"
      >
        <Plus size={22} className="text-[#004d40]" strokeWidth={2.5} />
      </button>

      {/* Bottom panel — store totals */}
      {unchecked.length > 0 && (
        <div className="fixed bottom-[calc(47px+env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 w-full max-w-md bg-white dark:bg-[#161b1e] border-t border-[#ebebeb] dark:border-[#2e3538] px-4 pt-3 pb-3 z-10">
          {/* Store total cards */}
          <div className="flex gap-2 overflow-x-auto scrollbar-none mb-3">
            {Object.entries(storeTotals)
              .filter(([, t]) => t > 0)
              .sort((a, b) => a[1] - b[1])
              .map(([chain, total], i) => {
                const isBest = i === 0;
                const isActive = chain === activeChain;
                return (
                  <button
                    key={chain}
                    onClick={() => setActiveChain(isActive ? null : chain)}
                    className={[
                      "flex-shrink-0 rounded-[10px] px-3 py-2 text-center border min-w-[70px] transition-all",
                      isActive
                        ? "bg-[#f0fdf9] dark:bg-[#1a2e2a] border-[#b2f0e4] dark:border-[#1e4a3a]"
                        : isBest
                          ? "border-[#00E5C3] bg-[#f7f7f7] dark:bg-[#1e2528]"
                          : "border-[#ebebeb] dark:border-[#2e3538] bg-[#f7f7f7] dark:bg-[#1e2528]",
                    ].join(" ")}
                  >
                    <p className="text-[10px] text-[#888] dark:text-[#555] mb-0.5 capitalize">
                      {chain}
                    </p>
                    <p className="text-[13px] font-semibold text-[#111] dark:text-[#e0e0e0]">
                      ${total.toFixed(2)}
                    </p>
                    {isBest && (
                      <span className="text-[9px] bg-[#00E5C3] text-[#004d40] rounded px-1 py-px">
                        Best
                      </span>
                    )}
                  </button>
                );
              })}
          </div>

          {/* Subtotal */}
          <div className="flex items-baseline justify-between mb-0">
            <span className="text-[12px] text-[#aaa]">
              Subtotal · {unchecked.length} items
            </span>
            <span className="text-[20px] font-bold text-[#111] dark:text-[#e0e0e0]">
              ${(activeTotal ?? sortedTotals[0]?.[1] ?? 0).toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* Edit sheet */}
      {editingItem && (
        <EditItemSheet
          item={{
            ...editingItem,
            customPrice: editingItem.customPrice,
            product: editingItem.product
              ? {
                  ...editingItem.product,
                  unitMeasure: editingItem.product.unitMeasure ?? null,
                  unitQuantity: editingItem.product.unitQuantity
                    ? Number(editingItem.product.unitQuantity)
                    : null,
                  bestPrice: getBestPrice(editingItem.product)?.price ?? null,
                  bestStore: getBestPrice(editingItem.product)?.chain ?? null,
                }
              : null,
          }}
          onSave={handleSaveEdit}
          onClose={() => setEditingItem(null)}
        />
      )}

      {/* Pantry from list sheet */}
      {showPantrySheet && (
        <PantryFromListSheet
          listId={activeList!.id}
          checkedItems={pantrySheetItems.map((i) => ({
            id: i.id,
            name: i.name,
            quantity: i.quantity ? Number(i.quantity) : null,
            unit: i.unit ?? null,
            productId: i.product?.id ?? null,
          }))}
          onConfirm={() => {
            setShowPantrySheet(false);
            executeClearCompleted();
          }}
          onJustClear={() => {
            setShowPantrySheet(false);
            executeClearCompleted();
          }}
          onCancel={() => setShowPantrySheet(false)}
        />
      )}
    </div>
  );
}
