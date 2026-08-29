"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Plus, Check, Trash2, Pencil, ChevronDown } from "lucide-react";
import EditItemSheet from "@/components/lists/EditItemSheet";
import ListDropdown from "@/components/lists/ListDropdown";
import ListOptionsMenu from "@/components/lists/ListOptionsMenu";
import PantryFromListSheet from "@/components/pantry/PantryFromListSheet";
import { calculateEffectivePrice } from "@/lib/unit-convert";
import { getStoreMeta } from "@/lib/store-meta";
import {
  computeListPricing,
  priceItemAt,
  cheapestElsewhere,
  type StoreBasket,
} from "@/lib/list-pricing";

// ── Types ──────────────────────────────────────

type StoreProduct = {
  id: string;
  currentPrice: number | null;
  isActive: boolean;
  /**
   * Already in the payload — the lists query `include`s storeProducts, so
   * every scalar arrives. It just had no type and nothing rendered it, which
   * meant a sale price quietly improved a store's total with nothing on screen
   * saying why.
   */
  isSale: boolean;
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

/**
 * Chain keys are lowercase; the UI wants them capitalised. Per word, to match
 * the `capitalize` class used on the cards — otherwise "no frills" renders as
 * "No Frills" in one place and "No frills" in another.
 */
function chainLabel(chain: string): string {
  return chain.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Matches the badge on the product page, so "Sale" reads the same everywhere. */
function SaleBadge() {
  return (
    <span className="text-[9px] bg-[#fef2f2] dark:bg-[#3a1a1a] text-[#ef4444] border border-[#fecaca] dark:border-[#5a2020] rounded px-1 py-px">
      Sale
    </span>
  );
}

/**
 * The cheapest priced row for a chain, or overall when no chain is given.
 *
 * Used only to answer "is the number on screen a sale price" — the price
 * itself still comes from `priceItemAt`, which applies unit conversion.
 */
function cheapestRow(
  product: Product | null,
  chain: string | null,
): StoreProduct | null {
  if (!product) return null;
  const rows = product.storeProducts.filter(
    (sp) =>
      sp.currentPrice !== null &&
      (chain === null || sp.store.chain.toLowerCase() === chain.toLowerCase()),
  );
  if (rows.length === 0) return null;
  return rows.reduce((a, b) => (b.currentPrice! < a.currentPrice! ? b : a));
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

  // With a store selected, the row answers for THAT store. It used to fall
  // back to the all-store range whenever the selected store had no price,
  // which is the row-level version of the lie the subtotal told: a number on
  // screen that belongs to a shop you are not looking at.
  const priceHere = activeChain ? priceItemAt(item, activeChain) : null;
  const unpricedHere =
    !item.isChecked &&
    activeChain !== null &&
    item.product !== null &&
    priceHere === null;
  const elsewhere =
    unpricedHere && activeChain ? cheapestElsewhere(item, activeChain) : null;
  const isUnlinked =
    !item.isChecked && item.product === null && item.customPrice === null;

  // Whether the figure actually on screen is a sale price — the selected
  // store's cheapest row, or the cheapest anywhere when showing the range.
  const onSale =
    cheapestRow(item.product, priceHere !== null ? activeChain : null)?.isSale ??
    false;

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
            {priceHere !== null ? (
              <>
                <span className="text-[12px] font-medium text-[#00b89e]">
                  ${priceHere.toFixed(2)}
                </span>
                {onSale && <SaleBadge />}
              </>
            ) : unpricedHere ? (
              <>
                <span className="text-[11px] font-medium text-[#b45309] dark:text-[#d9a441]">
                  No price at {chainLabel(activeChain!)}
                </span>
                {elsewhere && (
                  <span className="text-[11px] text-[#aaa]">
                    ${elsewhere.price.toFixed(2)} at{" "}
                    {chainLabel(elsewhere.chain)}
                  </span>
                )}
              </>
            ) : priceRange ? (
              <>
                <span className="text-[12px] font-medium text-[#00b89e]">
                  ${priceRange.min.toFixed(2)}
                  {priceRange.min !== priceRange.max &&
                    ` – $${priceRange.max.toFixed(2)}`}
                  {!item.product && (
                    <span className="text-[10px] text-[#bbb] ml-1">
                      your price
                    </span>
                  )}
                </span>
                {onSale && <SaleBadge />}
              </>
            ) : isUnlinked ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(item);
                }}
                className="text-[11px] font-medium text-[#b45309] dark:text-[#d9a441] underline decoration-dotted underline-offset-2"
              >
                Not counted · add a price
              </button>
            ) : (
              <span className="text-[11px] text-[#ccc]">No price yet</span>
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
  // Always lowercase. The filter pills used to set the raw `Store.chain` while
  // the total cards set a lowercased one, so picking a store at the top failed
  // to highlight its card at the bottom.
  const [activeChain, setActiveChain] = useState<string | null>(null);
  const [showExclusions, setShowExclusions] = useState(false);
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
  const preferredChains = useMemo(
    () => preferredStores.map((s) => s.chain.toLowerCase()),
    [preferredStores],
  );
  const pricing = useMemo(
    () => computeListPricing(items, preferredChains),
    [items, preferredChains],
  );
  const itemsById = useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items],
  );

  // The panel reports one store. An explicit pick wins; otherwise it is the
  // top-ranked store — and either way the subtotal names it, because a total
  // with no store attached is a number the user has no way to check.
  const shownBasket: StoreBasket | null =
    (activeChain
      ? (pricing.baskets.find((b) => b.chain === activeChain) ?? null)
      : null) ??
    pricing.ranked[0] ??
    null;

  const shownMissing = shownBasket?.missing ?? [];
  const excludedCount = shownMissing.length + pricing.unlinkedItemIds.length;

  // The panel grows when a store is missing items and again when the
  // breakdown is open, so the scroll padding and the FAB offset are measured
  // rather than guessed. The guess used to be a hardcoded 220px.
  const hasPanel = unchecked.length > 0;
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelHeight, setPanelHeight] = useState(160);
  useEffect(() => {
    const el = panelRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const next = Math.round(el.getBoundingClientRect().height);
      setPanelHeight((prev) => (next !== prev ? next : prev));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasPanel]);

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
            const chain = store.chain.toLowerCase();
            const isActive = activeChain === chain;
            return (
              <button
                key={store.chain}
                onClick={() => setActiveChain(isActive ? null : chain)}
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
      <div
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: hasPanel ? panelHeight + 24 : 96 }}
      >
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
          hasPanel ? "" : "bottom-above-nav",
        ].join(" ")}
        style={
          hasPanel
            ? {
                bottom: `calc(${panelHeight + 59}px + env(safe-area-inset-bottom, 0px))`,
              }
            : undefined
        }
        aria-label="Add item"
      >
        <Plus size={22} className="text-[#004d40]" strokeWidth={2.5} />
      </button>

      {/* Bottom panel — store totals */}
      {hasPanel && (
        <div
          ref={panelRef}
          className="fixed bottom-[calc(47px+env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 w-full max-w-md bg-white dark:bg-[#161b1e] border-t border-[#ebebeb] dark:border-[#2e3538] px-4 pt-3 pb-3 z-10"
        >
          {/* With no stores picked there is nothing to total, and a $0.00 with
              no explanation is the same failure as a total that hides its
              exclusions. Say why instead. */}
          {pricing.baskets.length === 0 && (
            <p className="text-[12px] text-[#aaa] text-center py-1">
              <a href="/profile-settings" className="text-[#00b89e] font-medium">
                Choose your stores
              </a>{" "}
              to price this list.
            </p>
          )}

          {/* Store total cards. Ranked on the shared basket, and every card
              states its own coverage — a store is only cheaper than another if
              it is pricing the same things. */}
          <div className="flex gap-2 overflow-x-auto scrollbar-none mb-3">
            {pricing.baskets.map((basket, i) => {
              const isBest = i === 0 && pricing.ranked.length > 1;
              const isActive = basket.chain === activeChain;
              const empty = basket.covered.length === 0;
              return (
                <button
                  key={basket.chain}
                  onClick={() =>
                    setActiveChain(isActive ? null : basket.chain)
                  }
                  className={[
                    "flex-shrink-0 rounded-[10px] px-3 py-2 text-center border min-w-[78px] transition-all",
                    empty
                      ? "border-[#ebebeb] dark:border-[#2e3538] bg-transparent opacity-60"
                      : isActive
                        ? "bg-[#f0fdf9] dark:bg-[#1a2e2a] border-[#b2f0e4] dark:border-[#1e4a3a]"
                        : isBest
                          ? "border-[#00E5C3] bg-[#f7f7f7] dark:bg-[#1e2528]"
                          : "border-[#ebebeb] dark:border-[#2e3538] bg-[#f7f7f7] dark:bg-[#1e2528]",
                  ].join(" ")}
                >
                  <p className="text-[10px] text-[#888] dark:text-[#555] mb-0.5 capitalize">
                    {basket.chain}
                  </p>
                  <p className="text-[13px] font-semibold text-[#111] dark:text-[#e0e0e0]">
                    {empty ? "—" : `$${basket.total.toFixed(2)}`}
                  </p>
                  <p
                    className={[
                      "text-[9px] mt-0.5",
                      basket.covered.length < pricing.itemCount
                        ? "text-[#b45309] dark:text-[#d9a441]"
                        : "text-[#aaa] dark:text-[#666]",
                    ].join(" ")}
                  >
                    {basket.covered.length} of {pricing.itemCount}
                  </p>
                  {isBest && (
                    <span className="inline-block text-[9px] bg-[#00E5C3] text-[#004d40] rounded px-1 py-px mt-0.5">
                      Best
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* The breakdown of what the shown total leaves out. Rendered only
              when something is actually excluded, so the caveat still means
              something on the lists where it appears. */}
          {showExclusions && excludedCount > 0 && (
            <div className="max-h-[38vh] overflow-y-auto mb-3 rounded-[10px] bg-[#fffbf2] dark:bg-[#241f14] border border-[#f3e2c0] dark:border-[#3d3322] p-2.5">
              {shownMissing.length > 0 && shownBasket && (
                <>
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-[#b45309] dark:text-[#d9a441] mb-1.5">
                    No price at {chainLabel(shownBasket.chain)}
                  </p>
                  {shownMissing.map((m) => {
                    const listItem = itemsById.get(m.itemId);
                    if (!listItem) return null;
                    return (
                      <div
                        key={m.itemId}
                        className="flex items-baseline justify-between gap-2 py-1"
                      >
                        <span className="text-[12px] text-[#333] dark:text-[#ccc] truncate">
                          {listItem.name}
                        </span>
                        <span className="text-[11px] text-[#888] dark:text-[#777] flex-shrink-0">
                          {m.elsewhere
                            ? `$${m.elsewhere.price.toFixed(2)} at ${chainLabel(m.elsewhere.chain)}`
                            : "No price yet"}
                        </span>
                      </div>
                    );
                  })}
                </>
              )}

              {pricing.unlinkedItemIds.length > 0 && (
                <>
                  <p
                    className={[
                      "text-[9px] font-semibold uppercase tracking-wider text-[#b45309] dark:text-[#d9a441] mb-1.5",
                      shownMissing.length > 0 ? "mt-3" : "",
                    ].join(" ")}
                  >
                    Not linked to a product
                  </p>
                  {pricing.unlinkedItemIds.map((id) => {
                    const listItem = itemsById.get(id);
                    if (!listItem) return null;
                    return (
                      <div
                        key={id}
                        className="flex items-baseline justify-between gap-2 py-1"
                      >
                        <span className="text-[12px] text-[#333] dark:text-[#ccc] truncate">
                          {listItem.name}
                        </span>
                        <button
                          onClick={() => setEditingItem(listItem)}
                          className="text-[11px] font-medium text-[#00b89e] flex-shrink-0"
                        >
                          Add a price
                        </button>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* Subtotal — names its store and counts only what it covers */}
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] text-[#aaa]">
              {shownBasket ? (
                <>
                  <span className="capitalize">{shownBasket.chain}</span> ·{" "}
                  {shownBasket.covered.length} of {pricing.itemCount} items
                </>
              ) : (
                `Subtotal · ${pricing.itemCount} items`
              )}
            </span>
            <span className="text-[20px] font-bold text-[#111] dark:text-[#e0e0e0]">
              {shownBasket ? `$${shownBasket.total.toFixed(2)}` : "—"}
            </span>
          </div>

          {excludedCount > 0 && (
            <button
              onClick={() => setShowExclusions((v) => !v)}
              className="flex items-center gap-1 mt-1 text-[11px] font-medium text-[#b45309] dark:text-[#d9a441]"
            >
              <span>
                {excludedCount} {excludedCount === 1 ? "item" : "items"} not in
                this total
              </span>
              <ChevronDown
                size={12}
                className={showExclusions ? "rotate-180" : ""}
                strokeWidth={2}
              />
            </button>
          )}

          {/* Laid out like the subtotal above it, because the two are meant to
              be read against each other. The split covers more items than any
              single store, so its total can be the larger number while still
              being the better shop — which only reads correctly if both lines
              state their own item count. */}
          {pricing.cheapestSplit && (
            <div className="flex items-baseline justify-between mt-1.5 pt-1.5 border-t border-[#f5f5f5] dark:border-[#232a2d]">
              <span className="text-[11px] text-[#aaa]">
                {pricing.cheapestSplit.chains.map(chainLabel).join(" + ")} ·{" "}
                {pricing.cheapestSplit.itemCount} of {pricing.itemCount} items
              </span>
              <span className="text-[13px] font-semibold text-[#111] dark:text-[#e0e0e0]">
                ${pricing.cheapestSplit.total.toFixed(2)}
              </span>
            </div>
          )}
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
