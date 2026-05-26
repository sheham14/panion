"use client";

import { useState, useMemo } from "react";
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  ChevronDown,
  Pencil,
} from "lucide-react";
import PantryEditSheet from "@/components/pantry/PantryEditSheet";
import AddToListSheet from "@/components/search/AddToListSheet";
import type { SerializedPantryItem } from "@/app/(main)/pantry/page";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  dairy: "Dairy",
  meat_seafood: "Meat & Seafood",
  produce: "Produce",
  bakery_bread: "Bakery & Bread",
  frozen: "Frozen",
  pantry_dry_goods: "Dry Goods",
  snacks_candy: "Snacks & Candy",
  beverages: "Beverages",
  household: "Household",
  personal_care: "Personal Care",
  baby: "Baby",
  pet: "Pet",
  deli_prepared: "Deli & Prepared",
  health_wellness: "Health & Wellness",
  other: "Other",
};

function categoryLabel(cat: string | null): string {
  if (!cat) return "Uncategorized";
  return CATEGORY_LABELS[cat] ?? cat;
}

function formatQty(quantity: number | null, unit: string | null): string {
  if (quantity === null && !unit) return "";
  if (quantity === null) return unit!;
  const q = quantity % 1 === 0 ? quantity.toFixed(0) : quantity.toString();
  return unit ? `${q} ${unit}` : q;
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "1 week ago";
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

function expiryLabel(iso: string | null): string | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  const days = Math.ceil(diff / 86400000);
  if (days < 0) return "Expired";
  if (days === 0) return "Expires today";
  if (days <= 3) return `Expires in ${days}d`;
  return null;
}

function categoryEmoji(cat: string | null): string {
  const map: Record<string, string> = {
    dairy: "🥛",
    meat_seafood: "🥩",
    produce: "🥦",
    bakery_bread: "🍞",
    frozen: "🧊",
    pantry_dry_goods: "🫙",
    snacks_candy: "🍿",
    beverages: "🧃",
    household: "🧹",
    personal_care: "🧴",
    baby: "🍼",
    pet: "🐾",
    deli_prepared: "🥗",
    health_wellness: "💊",
    other: "📦",
  };
  return cat ? (map[cat] ?? "📦") : "📦";
}

type SortOption = "updated" | "name" | "category" | "expiry";

// ─── Grid Item ────────────────────────────────────────────────────────────────

function GridItem({
  item,
  selectMode,
  selected,
  onToggleSelect,
  onEdit,
}: {
  item: SerializedPantryItem;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
}) {
  const expiry = expiryLabel(item.expiresAt);
  return (
    <div
      onClick={selectMode ? onToggleSelect : undefined}
      className={[
        "relative bg-white dark:bg-[#1e2528] border rounded-[14px] overflow-hidden cursor-pointer",
        selected
          ? "border-[#00E5C3] bg-[#f0fdf9] dark:bg-[#1a2e2a]"
          : "border-[#ebebeb] dark:border-[#2e3538]",
      ].join(" ")}
    >
      {/* Checkbox */}
      {selectMode && (
        <div
          className={[
            "absolute top-2 left-2 w-5 h-5 rounded-full border flex items-center justify-center z-10",
            selected
              ? "bg-[#00E5C3] border-[#00E5C3]"
              : "bg-white dark:bg-[#1e2528] border-[#e0e0e0] dark:border-[#2e3538]",
          ].join(" ")}
        >
          {selected && (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path
                d="M2 5L4 7L8 3"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
      )}

      {/* Edit button */}
      {!selectMode && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="absolute top-2 right-2 w-6 h-6 rounded-[7px] bg-white dark:bg-[#242b2e] border border-[#ebebeb] dark:border-[#2e3538] flex items-center justify-center z-10"
        >
          <Pencil size={10} className="text-[#888]" />
        </button>
      )}

      {/* Emoji area */}
      <div className="h-[80px] bg-[#f7f7f7] dark:bg-[#242b2e] flex items-center justify-center text-[32px]">
        {categoryEmoji(item.category)}
      </div>

      {/* Info */}
      <div className="px-[10px] py-2">
        <p className="text-[12px] font-medium text-[#111] dark:text-[#e0e0e0] truncate">
          {item.name}
        </p>
        <p className="text-[10px] text-[#aaa] truncate mb-1">
          {item.brand ?? categoryLabel(item.category)}
        </p>
        {expiry && (
          <span
            className={[
              "text-[9px] px-1.5 py-0.5 rounded-[4px] border inline-block mb-1",
              expiry === "Expired"
                ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-500"
                : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700 text-amber-600",
            ].join(" ")}
          >
            {expiry}
          </span>
        )}
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium text-[#111] dark:text-[#e0e0e0]">
            {formatQty(item.quantity, item.unit) || "—"}
          </p>
          <p className="text-[10px] text-[#ccc]">
            {relativeDate(item.updatedAt)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── List Item ────────────────────────────────────────────────────────────────

function ListItem({
  item,
  selectMode,
  selected,
  onToggleSelect,
  onEdit,
}: {
  item: SerializedPantryItem;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
}) {
  const expiry = expiryLabel(item.expiresAt);
  return (
    <div
      onClick={selectMode ? onToggleSelect : undefined}
      className="flex items-center gap-[10px] px-4 py-[11px] bg-white dark:bg-[#1e2528] border-b border-[#f5f5f5] dark:border-[#2a3044] cursor-pointer"
    >
      {selectMode && (
        <div
          className={[
            "w-5 h-5 rounded-full border flex-shrink-0 flex items-center justify-center",
            selected
              ? "bg-[#00E5C3] border-[#00E5C3]"
              : "bg-white dark:bg-[#1e2528] border-[#e0e0e0] dark:border-[#2e3538]",
          ].join(" ")}
        >
          {selected && (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path
                d="M2 5L4 7L8 3"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
      )}

      <div className="text-[22px] flex-shrink-0">
        {categoryEmoji(item.category)}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-[#111] dark:text-[#e0e0e0] truncate">
          {item.name}
        </p>
        <div className="flex items-center gap-1.5 text-[11px] text-[#aaa]">
          <span>{item.brand ?? categoryLabel(item.category)}</span>
          {expiry && (
            <>
              <span className="text-[#ddd]">·</span>
              <span
                className={
                  expiry === "Expired" ? "text-red-500" : "text-amber-500"
                }
              >
                {expiry}
              </span>
            </>
          )}
          <span className="text-[#ddd]">·</span>
          <span>{relativeDate(item.updatedAt)}</span>
        </div>
      </div>

      <p className="text-[13px] font-medium text-[#111] dark:text-[#e0e0e0] flex-shrink-0">
        {formatQty(item.quantity, item.unit) || "—"}
      </p>

      {!selectMode && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="w-7 h-7 rounded-[8px] border border-[#ebebeb] dark:border-[#2e3538] flex items-center justify-center flex-shrink-0"
        >
          <Pencil size={12} className="text-[#888]" />
        </button>
      )}
    </div>
  );
}

// ─── Main Client Component ────────────────────────────────────────────────────

export default function PantryClient({
  initialItems,
}: {
  initialItems: SerializedPantryItem[];
}) {
  const [items, setItems] = useState<SerializedPantryItem[]>(initialItems);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("updated");
  const [showSort, setShowSort] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editItem, setEditItem] = useState<
    SerializedPantryItem | null | undefined
  >(undefined);
  // undefined = sheet closed, null = add mode, item = edit mode
  const [showAddToList, setShowAddToList] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ── Filter + sort ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = items;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.brand ?? "").toLowerCase().includes(q) ||
          categoryLabel(i.category).toLowerCase().includes(q),
      );
    }
    return [...result].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "category")
        return categoryLabel(a.category).localeCompare(
          categoryLabel(b.category),
        );
      if (sortBy === "expiry") {
        if (!a.expiresAt && !b.expiresAt) return 0;
        if (!a.expiresAt) return 1;
        if (!b.expiresAt) return -1;
        return (
          new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime()
        );
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [items, searchQuery, sortBy]);

  // ── Grouped by category ──────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, SerializedPantryItem[]>();
    filtered.forEach((item) => {
      const key = item.category ?? "__none__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    });
    return map;
  }, [filtered]);

  // ── Select helpers ───────────────────────────────────────────────────────
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  // ── Bulk delete (Used up / Remove) ───────────────────────────────────────
  async function handleBulkDelete() {
    if (selectedIds.size === 0 || deleting) return;
    setDeleting(true);
    await Promise.all(
      [...selectedIds].map((id) =>
        fetch(`/api/pantry/${id}`, { method: "DELETE" }),
      ),
    );
    setItems((prev) => prev.filter((i) => !selectedIds.has(i.id)));
    exitSelectMode();
    setDeleting(false);
  }

  // ── On saved (add or edit) ───────────────────────────────────────────────
  function handleSaved(saved: SerializedPantryItem) {
    setItems((prev) => {
      const exists = prev.find((i) => i.id === saved.id);
      if (exists) return prev.map((i) => (i.id === saved.id ? saved : i));
      return [saved, ...prev];
    });
  }

  // ── Selected items for AddToListSheet ────────────────────────────────────
  const selectedIngredients = [...selectedIds].map((id) => {
    const item = items.find((i) => i.id === id)!;
    return {
      id: item.id,
      name: item.name,
      productId: item.productId,
      quantity: item.quantity,
      unit: item.unit,
    };
  });

  const sortLabels: Record<SortOption, string> = {
    updated: "Recently updated",
    name: "Name",
    category: "Category",
    expiry: "Expiry date",
  };

  const hasActions = selectMode && selectedIds.size > 0;

  return (
    <div className="bg-white dark:bg-[#0f1416]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <p className="text-[20px] font-medium text-[#111] dark:text-[#e0e0e0]">
          Pantry
        </p>
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-[#aaa]">{items.length} items</span>
          <button
            onClick={() => {
              selectMode ? exitSelectMode() : setSelectMode(true);
            }}
            className="text-[13px] font-medium text-[#00b89e]"
          >
            {selectMode ? "Cancel" : "Select"}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mx-4 mb-[10px] h-[38px] bg-[#f4f4f4] dark:bg-[#242b2e] rounded-[12px] flex items-center px-3 gap-2">
        <Search size={14} className="text-[#aaa] flex-shrink-0" />
        <input
          type="text"
          placeholder="Search pantry…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 bg-transparent text-[13px] text-[#111] dark:text-[#e0e0e0] placeholder-[#aaa] outline-none"
        />
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-between px-4 pb-[10px]">
        {/* Sort */}
        <div className="relative">
          <button
            onClick={() => setShowSort((v) => !v)}
            className="flex items-center gap-1.5 text-[12px] text-[#555] dark:text-[#aaa] px-[10px] py-[5px] border border-[#e0e0e0] dark:border-[#2e3538] rounded-[20px] bg-white dark:bg-[#1e2528]"
          >
            <span>{sortLabels[sortBy]}</span>
            <ChevronDown size={11} />
          </button>
          {showSort && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowSort(false)}
              />
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-[#1e2528] border border-[#e0e0e0] dark:border-[#2e3538] rounded-[12px] overflow-hidden z-20 shadow-lg min-w-[160px]">
                {(Object.keys(sortLabels) as SortOption[]).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => {
                      setSortBy(opt);
                      setShowSort(false);
                    }}
                    className={[
                      "w-full text-left px-4 py-2.5 text-[13px] border-b border-[#f5f5f5] dark:border-[#2e3538] last:border-0",
                      sortBy === opt
                        ? "text-[#00b89e] bg-[#f0fdf9] dark:bg-[#1a2e2a]"
                        : "text-[#111] dark:text-[#e0e0e0] hover:bg-[#f7f7f7] dark:hover:bg-[#242b2e]",
                    ].join(" ")}
                  >
                    {sortLabels[opt]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* View toggle */}
        <div className="flex gap-1">
          <button
            onClick={() => setViewMode("grid")}
            className={[
              "w-[30px] h-[30px] rounded-[8px] border flex items-center justify-center",
              viewMode === "grid"
                ? "bg-[#00E5C3] border-[#00E5C3]"
                : "bg-white dark:bg-[#1e2528] border-[#e0e0e0] dark:border-[#2e3538]",
            ].join(" ")}
          >
            <LayoutGrid
              size={13}
              className={viewMode === "grid" ? "text-[#004d40]" : "text-[#888]"}
            />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={[
              "w-[30px] h-[30px] rounded-[8px] border flex items-center justify-center",
              viewMode === "list"
                ? "bg-[#00E5C3] border-[#00E5C3]"
                : "bg-white dark:bg-[#1e2528] border-[#e0e0e0] dark:border-[#2e3538]",
            ].join(" ")}
          >
            <List
              size={13}
              className={viewMode === "list" ? "text-[#004d40]" : "text-[#888]"}
            />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className={hasActions ? "pb-[160px]" : "pb-[90px]"}>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center py-20 px-8 text-center">
            <div className="text-[48px] mb-4">🛒</div>
            <p className="text-[15px] font-medium text-[#111] dark:text-[#e0e0e0] mb-2">
              {searchQuery ? "No items found" : "Your pantry is empty"}
            </p>
            <p className="text-[13px] text-[#aaa]">
              {searchQuery
                ? "Try a different search"
                : "Tap + to add your first item"}
            </p>
          </div>
        ) : (
          [...grouped.entries()].map(([catKey, catItems]) => (
            <div key={catKey}>
              {/* Category label */}
              <p className="text-[10px] font-medium text-[#aaa] uppercase tracking-[0.8px] px-4 pt-[10px] pb-[6px]">
                {catKey === "__none__"
                  ? "Uncategorized"
                  : categoryLabel(catKey)}
              </p>

              {viewMode === "grid" ? (
                <div className="grid grid-cols-2 gap-[10px] px-4">
                  {catItems.map((item) => (
                    <GridItem
                      key={item.id}
                      item={item}
                      selectMode={selectMode}
                      selected={selectedIds.has(item.id)}
                      onToggleSelect={() => toggleSelect(item.id)}
                      onEdit={() => setEditItem(item)}
                    />
                  ))}
                </div>
              ) : (
                <div>
                  {catItems.map((item) => (
                    <ListItem
                      key={item.id}
                      item={item}
                      selectMode={selectMode}
                      selected={selectedIds.has(item.id)}
                      onToggleSelect={() => toggleSelect(item.id)}
                      onEdit={() => setEditItem(item)}
                    />
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => setEditItem(null)}
        className={[
          "fixed right-4 z-10 w-12 h-12 bg-[#00E5C3] rounded-[16px] shadow-lg flex items-center justify-center active:scale-95 transition-all",
          hasActions ? "bottom-[calc(148px+env(safe-area-inset-bottom,0px))]" : "bottom-above-nav",
        ].join(" ")}
        aria-label="Add pantry item"
      >
        <Plus size={22} className="text-[#004d40]" strokeWidth={2.5} />
      </button>

      {/* Bulk action bar */}
      {hasActions && (
        <div className="fixed bottom-above-nav left-0 right-0 bg-white dark:bg-[#1e2528] border-t border-[#ebebeb] dark:border-[#2e3538] px-4 py-3 flex gap-2 z-10">
          <button
            onClick={() => setShowAddToList(true)}
            className="flex-1 py-[10px] rounded-[10px] text-[12px] font-medium text-[#0a7a62] bg-[#f0fdf9] border border-[#b2f0e4]"
          >
            Add to list
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={deleting}
            className="flex-1 py-[10px] rounded-[10px] text-[12px] font-medium text-[#004d40] bg-[#00E5C3] border border-[#00E5C3] disabled:opacity-50"
          >
            Used up
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={deleting}
            className="flex-1 py-[10px] rounded-[10px] text-[12px] font-medium text-[#c0392b] bg-[#fef2f2] border border-[#fecaca] disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      )}

      {/* Edit / Add sheet */}
      {editItem !== undefined && (
        <PantryEditSheet
          item={editItem ?? undefined}
          onClose={() => setEditItem(undefined)}
          onSaved={handleSaved}
        />
      )}

      {/* Add to list sheet */}
      {showAddToList && (
        <AddToListSheet
          mode="recipe"
          ingredients={selectedIngredients}
          onClose={() => {
            setShowAddToList(false);
            exitSelectMode();
          }}
        />
      )}
    </div>
  );
}
