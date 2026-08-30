"use client";

import { useState, useEffect } from "react";
import { X, Search } from "lucide-react";
import type { SerializedPantryItem } from "@/app/(main)/pantry/page";

const CATEGORY_OPTIONS = [
  { value: "dairy", label: "Dairy" },
  { value: "meat_seafood", label: "Meat & Seafood" },
  { value: "produce", label: "Produce" },
  { value: "bakery_bread", label: "Bakery & Bread" },
  { value: "frozen", label: "Frozen" },
  { value: "pantry_dry_goods", label: "Dry Goods" },
  { value: "snacks_candy", label: "Snacks & Candy" },
  { value: "beverages", label: "Beverages" },
  { value: "household", label: "Household" },
  { value: "personal_care", label: "Personal Care" },
  { value: "baby", label: "Baby" },
  { value: "pet", label: "Pet" },
  { value: "deli_prepared", label: "Deli & Prepared" },
  { value: "health_wellness", label: "Health & Wellness" },
  { value: "other", label: "Other" },
];

const inputCls =
  "w-full px-3 py-2.5 rounded-xl border border-[#e0e0e0] dark:border-[#2e3538] bg-white dark:bg-[#242b2e] text-[13px] text-[#111] dark:text-[#e0e0e0] placeholder-[#bbb] outline-none focus:border-[#00E5C3] transition-colors";

type Props = {
  item?: SerializedPantryItem; // if present = edit mode, else = add mode
  onClose: () => void;
  onSaved: (item: SerializedPantryItem) => void;
};

type ProductResult = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
};

export default function PantryEditSheet({ item, onClose, onSaved }: Props) {
  const isEdit = !!item;

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const [name, setName] = useState(item?.name ?? "");
  const [brand, setBrand] = useState(item?.brand ?? "");
  const [quantity, setQuantity] = useState(
    item?.quantity ? String(item.quantity) : "",
  );
  const [unit, setUnit] = useState(item?.unit ?? "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [customCategory, setCustomCategory] = useState("");
  // Replace the expiresAt state with three parts
  const currentYear = new Date().getFullYear();
  const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const [expiryMonth, setExpiryMonth] = useState(() => {
    if (!item?.expiresAt) return "";
    return String(new Date(item.expiresAt).getMonth() + 1);
  });
  const [expiryDay, setExpiryDay] = useState(() => {
    if (!item?.expiresAt) return "";
    return String(new Date(item.expiresAt).getDate());
  });
  const [expiryYear, setExpiryYear] = useState(() => {
    if (!item?.expiresAt) return "";
    return String(new Date(item.expiresAt).getFullYear());
  });

  // Derived ISO string for the payload
  const expiresAt =
    expiryMonth && expiryDay && expiryYear
      ? `${expiryYear}-${String(expiryMonth).padStart(2, "0")}-${String(expiryDay).padStart(2, "0")}`
      : null;

  // Days in selected month
  const daysInMonth =
    expiryMonth && expiryYear
      ? new Date(Number(expiryYear), Number(expiryMonth), 0).getDate()
      : 31;
  const [productId, setProductId] = useState(item?.productId ?? null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Product search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [linkedProduct, setLinkedProduct] = useState<ProductResult | null>(
    null,
  );

  async function handleSearch(q: string) {
    setSearchQuery(q);
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `/api/products?q=${encodeURIComponent(q)}&limit=5`,
      );
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
      }
    } finally {
      setSearching(false);
    }
  }

  function handleLinkProduct(product: ProductResult) {
    setLinkedProduct(product);
    setProductId(product.id);
    setName(product.name);
    if (product.brand) setBrand(product.brand);
    if (product.category) setCategory(product.category);
    setSearchQuery("");
    setSearchResults([]);
  }

  function handleUnlinkProduct() {
    setLinkedProduct(null);
    setProductId(null);
  }

  const effectiveCategory =
    category === "__custom__" ? customCategory : category;

  async function handleSave() {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      name: name.trim(),
      brand: brand.trim() || null,
      category: effectiveCategory || null,
      quantity: quantity ? parseFloat(quantity) : null,
      unit: unit.trim() || null,
      productId: productId ?? null,
      expiresAt: expiresAt || null,
    };

    try {
      const res = await fetch(
        isEdit ? `/api/pantry/${item!.id}` : "/api/pantry",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Something went wrong");
        return;
      }

      const saved = await res.json();
      onSaved({
        id: saved.id ?? item!.id,
        name: payload.name,
        brand: payload.brand,
        category: payload.category,
        quantity: payload.quantity,
        unit: payload.unit,
        productId: payload.productId,
        // The edit sheet never changes which product a row points at, so the
        // photo the tile was already showing is still the right one. Re-reading
        // it from the server would cost a round-trip to learn nothing.
        imageUrl: item?.imageUrl ?? null,
        expiresAt: payload.expiresAt,
        // A new item starts now; an edited one keeps the date it arrived.
        createdAt: item?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        addedFrom: item?.addedFrom ?? "manual",
      });
      onClose();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-20" onClick={onClose} />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-sm bg-white dark:bg-[#1e2528] rounded-t-[24px] z-30 pb-8 max-h-[90vh] overflow-y-auto">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 sticky top-0 bg-white dark:bg-[#1e2528]">
          <div className="w-10 h-1 rounded-full bg-[#e0e0e0] dark:bg-[#2e3538]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#f0f0f0] dark:border-[#2e3538] sticky top-5 bg-white dark:bg-[#1e2528]">
          <p className="text-[15px] font-medium text-[#111] dark:text-[#e0e0e0]">
            {isEdit ? "Edit item" : "Add to pantry"}
          </p>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#f4f4f4] dark:bg-[#242b2e] flex items-center justify-center"
          >
            <X size={14} className="text-[#888]" />
          </button>
        </div>

        <div className="px-5 pt-4 flex flex-col gap-4">
          {error && (
            <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
              <p className="text-[13px] text-red-600 dark:text-red-400">
                {error}
              </p>
            </div>
          )}

          {/* Product search / link */}
          <div>
            <p className="text-[11px] text-[#aaa] mb-1.5">
              {linkedProduct ? "Linked product" : "Search product (optional)"}
            </p>
            {linkedProduct ? (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-[#00E5C3] bg-[#f0fdf9] dark:bg-[#1a2e2a]">
                <div>
                  <p className="text-[13px] font-medium text-[#111] dark:text-[#e0e0e0]">
                    {linkedProduct.name}
                  </p>
                  {linkedProduct.brand && (
                    <p className="text-[11px] text-[#aaa]">
                      {linkedProduct.brand}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleUnlinkProduct}
                  className="text-[11px] text-[#aaa] hover:text-red-400"
                >
                  Unlink
                </button>
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <Search
                    size={13}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#bbb]"
                  />
                  <input
                    type="text"
                    placeholder="Search products…"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    className={`${inputCls} pl-8`}
                  />
                </div>
                {searching && searchResults.length === 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#1e2528] border border-[#e0e0e0] dark:border-[#2e3538] rounded-xl z-10 shadow-lg px-3 py-2.5">
                    <p className="text-[13px] text-[#aaa]">Searching…</p>
                  </div>
                )}
                {searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#1e2528] border border-[#e0e0e0] dark:border-[#2e3538] rounded-xl overflow-hidden z-10 shadow-lg">
                    {searchResults.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handleLinkProduct(p)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-[#f7f7f7] dark:hover:bg-[#242b2e] border-b border-[#f5f5f5] dark:border-[#2e3538] last:border-0 text-left"
                      >
                        <div>
                          <p className="text-[13px] text-[#111] dark:text-[#e0e0e0]">
                            {p.name}
                          </p>
                          {p.brand && (
                            <p className="text-[11px] text-[#aaa]">{p.brand}</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Name */}
          <div>
            <p className="text-[11px] text-[#aaa] mb-1.5">Name</p>
            <input
              type="text"
              placeholder="e.g. Olive oil"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
            />
          </div>

          {/* Brand */}
          <div>
            <p className="text-[11px] text-[#aaa] mb-1.5">Brand (optional)</p>
            <input
              type="text"
              placeholder="e.g. Bertolli"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className={inputCls}
            />
          </div>

          {/* Quantity + Unit */}
          <div className="flex gap-3">
            <div className="flex-1">
              <p className="text-[11px] text-[#aaa] mb-1.5">Quantity</p>
              <input
                type="number"
                min="0"
                placeholder="e.g. 500"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="flex-1">
              <p className="text-[11px] text-[#aaa] mb-1.5">Unit</p>
              <input
                type="text"
                placeholder="e.g. ml, g, pcs"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* Category */}
          <div>
            <p className="text-[11px] text-[#aaa] mb-1.5">Category</p>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={inputCls}
            >
              <option value="">Select category…</option>
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
              <option value="__custom__">Custom…</option>
            </select>
            {category === "__custom__" && (
              <input
                type="text"
                placeholder="Enter category name"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                className={`${inputCls} mt-2`}
              />
            )}
          </div>

          {/* Expiry */}
          <div>
            <p className="text-[11px] text-[#aaa] mb-1.5">
              Expiry date (optional)
            </p>
            <div className="flex gap-2">
              {/* Month */}
              <select
                value={expiryMonth}
                onChange={(e) => {
                  setExpiryMonth(e.target.value);
                  setExpiryDay("");
                }}
                className={`${inputCls} flex-[2]`}
              >
                <option value="">Month</option>
                {MONTHS.map((m, i) => (
                  <option key={m} value={String(i + 1)}>
                    {m}
                  </option>
                ))}
              </select>

              {/* Day */}
              <select
                value={expiryDay}
                onChange={(e) => setExpiryDay(e.target.value)}
                disabled={!expiryMonth}
                className={`${inputCls} flex-1`}
              >
                <option value="">Day</option>
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(
                  (d) => (
                    <option key={d} value={String(d)}>
                      {d}
                    </option>
                  ),
                )}
              </select>

              {/* Year */}
              <select
                value={expiryYear}
                onChange={(e) => setExpiryYear(e.target.value)}
                className={`${inputCls} flex-1`}
              >
                <option value="">Year</option>
                {Array.from({ length: 7 }, (_, i) => currentYear - 1 + i).map(
                  (y) => (
                    <option key={y} value={String(y)}>
                      {y}
                    </option>
                  ),
                )}
              </select>
            </div>
            {expiresAt && (
              <button
                onClick={() => {
                  setExpiryMonth("");
                  setExpiryDay("");
                  setExpiryYear("");
                }}
                className="text-[11px] text-[#aaa] mt-1.5 hover:text-red-400"
              >
                Clear date
              </button>
            )}
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 bg-[#00E5C3] rounded-[12px] text-[13px] font-medium text-[#004d40] disabled:opacity-50 mt-1"
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add to pantry"}
          </button>
        </div>
      </div>
    </>
  );
}
