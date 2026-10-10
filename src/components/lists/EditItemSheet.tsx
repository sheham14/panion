"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { getAllowedUnits } from "@/lib/unit-convert";

/** A product as the sheet shows it — the linked one, or a search result. */
type ProductChoice = {
  id: string;
  name: string;
  brand: string | null;
  unitSize: string | null;
  /** Search results don't carry it; units then come from `unitSize` alone. */
  unitMeasure?: string | null;
  bestPrice: number | null;
  bestStore: string | null;
};

type Product = ProductChoice & {
  unitMeasure: string | null;
  unitQuantity: number | null;
};

export type EditItemChanges = {
  quantity: number;
  unit: string;
  notes: string;
  customPrice: number | null;
  /** Present only when the link changed: a product id, or null to unlink. */
  productId?: string | null;
};

type ListItem = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
  customPrice: number | null;
  product: Product | null;
};

type Props = {
  item: ListItem;
  onSave: (id: string, data: EditItemChanges) => Promise<boolean>;
  /** Resolves false when the server refused, so the sheet can stay open. */
  onDelete: (id: string) => Promise<boolean>;
  onClose: () => void;
};

export default function EditItemSheet({ item, onSave, onDelete, onClose }: Props) {
  const [customPrice, setCustomPrice] = useState<string>(
    item.customPrice !== null ? String(item.customPrice) : "",
  );
  const [quantity, setQuantity] = useState<string | number>(
    String(item.quantity ?? 1),
  );
  const [selectedUnit, setSelectedUnit] = useState(item.unit ?? "each");
  const [notes, setNotes] = useState(item.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Linking a typed-in item to a catalogue product is what lets the list
  // price it at every store; a custom price was the only option before.
  // undefined = unchanged, null = unlink, a product = link to it.
  const [linkTo, setLinkTo] = useState<ProductChoice | null | undefined>(undefined);
  const shownProduct: ProductChoice | null =
    linkTo === undefined ? item.product : linkTo;
  const [searchOpen, setSearchOpen] = useState(!item.product);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductChoice[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Responses can arrive out of order; only the latest query's results count.
  const searchSeq = useRef(0);

  useEffect(() => () => clearTimeout(searchTimer.current), []);

  function onQueryChange(q: string) {
    setQuery(q);
    clearTimeout(searchTimer.current);
    const seq = ++searchSeq.current;
    if (q.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      let found: ProductChoice[] = [];
      try {
        const res = await fetch(
          `/api/products?q=${encodeURIComponent(q.trim())}&limit=5`,
        );
        if (res.ok) found = await res.json();
      } catch {
        // Leave the results empty; the empty-state line says so.
      }
      if (seq !== searchSeq.current) return;
      setResults(found);
      setSearching(false);
    }, 300);
  }

  function pickProduct(p: ProductChoice) {
    setLinkTo(p);
    setSearchOpen(false);
    setQuery("");
    setResults([]);
  }

  function unlink() {
    setLinkTo(null);
    setSearchOpen(true);
  }

  const allowedUnits = getAllowedUnits(
    shownProduct?.unitMeasure,
    shownProduct?.unitSize,
  );

  // Derived, not synced. This used to be a `useEffect` that called `setUnit`
  // when the product's allowed units changed, which forced a second render
  // pass on every open and briefly rendered an invalid unit. Computing the
  // fallback during render removes both problems.
  const unit = allowedUnits.includes(selectedUnit)
    ? selectedUnit
    : allowedUnits[0];

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Separate from the scroll lock: the parent passes a fresh `onClose` each
  // render, and re-binding a key listener is cheap where re-toggling the
  // body's overflow is not.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Both actions used to close the sheet whatever the server said, so a
  // failed save looked exactly like a successful one.
  async function handleSave() {
    setSaving(true);
    setError(null);
    const ok = await onSave(item.id, {
      quantity: Math.max(1, parseInt(String(quantity)) || 1),
      unit,
      notes,
      // A linked item is priced from the stores; a custom price is only for
      // an item with no product.
      customPrice: shownProduct ? null : customPrice ? parseFloat(customPrice) : null,
      ...(linkTo !== undefined && { productId: linkTo?.id ?? null }),
    });
    setSaving(false);
    if (ok) onClose();
    else setError("Couldn't save that. Check your connection and try again.");
  }

  async function handleRemove() {
    setRemoving(true);
    setError(null);
    const ok = await onDelete(item.id);
    setRemoving(false);
    if (ok) onClose();
    else setError("Couldn't remove that. Check your connection and try again.");
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-20" onClick={onClose} />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${item.name}`}
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-sm max-h-[90dvh] overflow-y-auto bg-white dark:bg-[#1e2528] rounded-t-[20px] z-30 pb-8"
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 rounded-full bg-[#e0e0e0] dark:bg-[#2e3538]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#f0f0f0] dark:border-[#2e3538]">
          <p className="text-[15px] font-medium text-[#111] dark:text-[#e0e0e0]">
            Edit item
          </p>
          <p className="text-[12px] text-[#aaa] truncate max-w-[240px] mt-0.5">
            {item.name}
          </p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 rounded-full bg-[#f4f4f4] dark:bg-[#242b2e] flex items-center justify-center"
          >
            <X size={13} className="text-[#888]" />
          </button>
        </div>

        {/* Linked product, or the search to link one */}
        <div className="px-5 pt-4">
          <p className="text-[11px] font-medium text-[#aaa] uppercase tracking-[0.6px] mb-2">
            {shownProduct && !searchOpen ? "Linked product" : "Link a product"}
          </p>
          {shownProduct && !searchOpen ? (
            <div className="flex items-center gap-3 p-3 border border-[#ebebeb] dark:border-[#2e3538] rounded-xl">
              <div className="w-9 h-9 rounded-[8px] bg-[#f7f7f7] dark:bg-[#242b2e] flex items-center justify-center text-[18px] flex-shrink-0">
                🛒
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[#111] dark:text-[#e0e0e0] truncate">
                  {shownProduct.name}
                </p>
                <p className="text-[11px] text-[#aaa] truncate">
                  {[shownProduct.brand, shownProduct.unitSize]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="flex gap-3 mt-1">
                  <button
                    onClick={() => setSearchOpen(true)}
                    className="text-[11px] font-medium text-[#00b89e]"
                  >
                    Change
                  </button>
                  <button
                    onClick={unlink}
                    className="text-[11px] font-medium text-[#aaa]"
                  >
                    Unlink
                  </button>
                </div>
              </div>
              {shownProduct.bestPrice !== null && (
                <p className="text-[14px] font-medium text-[#00b89e] flex-shrink-0">
                  ${shownProduct.bestPrice.toFixed(2)}
                </p>
              )}
            </div>
          ) : (
            <div>
              <div className="relative">
                <Search
                  size={13}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#bbb]"
                />
                <input
                  type="search"
                  aria-label="Search products to link"
                  placeholder="Search products…"
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  className="w-full pl-8 pr-3 py-2.5 border border-[#ebebeb] dark:border-[#2e3538] rounded-xl text-[13px] text-[#111] dark:text-[#e0e0e0] bg-white dark:bg-[#242b2e] placeholder-[#bbb] outline-none focus:border-[#00E5C3]"
                />
              </div>
              {results.length > 0 ? (
                <ul className="mt-2 border border-[#ebebeb] dark:border-[#2e3538] rounded-xl overflow-hidden">
                  {results.map((p) => (
                    <li key={p.id}>
                      <button
                        onClick={() => pickProduct(p)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[#f7f7f7] dark:hover:bg-[#242b2e] border-b border-[#f5f5f5] dark:border-[#2e3538] last:border-0"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] text-[#111] dark:text-[#e0e0e0] truncate">
                            {p.name}
                          </p>
                          <p className="text-[11px] text-[#aaa] truncate">
                            {[p.brand, p.unitSize].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        {p.bestPrice !== null && (
                          <span className="text-[12px] font-medium text-[#00b89e] flex-shrink-0">
                            ${p.bestPrice.toFixed(2)}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[10px] text-[#bbb] mt-1.5">
                  {searching
                    ? "Searching…"
                    : query.trim().length >= 2
                      ? "No products match. A custom price works too."
                      : "Linking it prices this item at every store."}
                </p>
              )}
              {shownProduct && (
                <button
                  onClick={() => {
                    setSearchOpen(false);
                    setQuery("");
                    setResults([]);
                  }}
                  className="text-[11px] font-medium text-[#aaa] mt-2"
                >
                  Keep {shownProduct.name}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Quantity */}
        <div className="px-5 pt-4">
          <p className="text-[11px] font-medium text-[#aaa] uppercase tracking-[0.6px] mb-2">
            Quantity
          </p>
          <input
            type="text"
            inputMode="numeric"
            value={quantity}
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9]/g, "");
              if (val === "") {
                // State is already `string | number`, so no cast is needed to
                // hold the empty value while the user is mid-edit.
                setQuantity("");
                return;
              }
              const num = Math.min(999, Math.max(1, parseInt(val)));
              setQuantity(num);
            }}
            className="w-full px-4 py-3 border border-[#ebebeb] dark:border-[#2e3538] rounded-xl text-[15px] font-medium text-[#111] dark:text-[#e0e0e0] bg-white dark:bg-[#242b2e] outline-none focus:border-[#00E5C3] text-center"
            maxLength={3}
          />
          <p className="text-[10px] text-[#bbb] text-center mt-1.5">Max 999</p>
        </div>

        {/* Unit */}
        <div className="px-5 pt-4">
          <p className="text-[11px] font-medium text-[#aaa] uppercase tracking-[0.6px] mb-2">
            Unit
          </p>
          <div className="flex flex-wrap gap-2">
            {allowedUnits.map((u) => (
              <button
                key={u}
                onClick={() => setSelectedUnit(u)}
                className={[
                  "px-3 py-1.5 rounded-full border text-[12px] font-medium transition-all",
                  unit === u
                    ? "bg-[#00E5C3] border-[#00E5C3] text-[#004d40]"
                    : "border-[#e0e0e0] dark:border-[#2e3538] bg-white dark:bg-[#242b2e] text-[#888]",
                ].join(" ")}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="px-5 pt-4">
          <p className="text-[11px] font-medium text-[#aaa] uppercase tracking-[0.6px] mb-2">
            Note
          </p>
          <textarea
            rows={2}
            placeholder="e.g. get the organic one, check expiry date"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2.5 border border-[#ebebeb] dark:border-[#2e3538] rounded-[10px] text-[13px] text-[#111] dark:text-[#e0e0e0] bg-[#fafafa] dark:bg-[#242b2e] placeholder-[#bbb] outline-none resize-none focus:border-[#00E5C3]"
          />
        </div>

        {!shownProduct && (
          <div className="px-5 pt-4">
            <p className="text-[11px] font-medium text-[#aaa] uppercase tracking-[0.6px] mb-2">
              Custom price
            </p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-[#aaa]">
                $
              </span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={customPrice}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9.]/g, "");
                  // Only allow one decimal point
                  const parts = val.split(".");
                  if (parts.length > 2) return;
                  // Max 2 decimal places
                  if (parts[1]?.length > 2) return;
                  setCustomPrice(val);
                }}
                className="w-full pl-7 pr-4 py-3 border border-[#ebebeb] dark:border-[#2e3538] rounded-xl text-[15px] text-[#111] dark:text-[#e0e0e0] bg-white dark:bg-[#242b2e] outline-none focus:border-[#00E5C3] placeholder-[#bbb]"
              />
            </div>
            <p className="text-[10px] text-[#bbb] mt-1.5">
              Used to estimate your list subtotal
            </p>
          </div>
        )}

        {/* Report — reporting lives on the product page, which knows every
            store's price. This used to be plain text styled as a link. An
            unlinked item has no stored price to be wrong, so it gets none. */}
        {shownProduct && (
          <p className="text-[11px] text-[#aaa] text-center pt-3">
            Price looks wrong?{" "}
            <Link
              href={`/product/${shownProduct.id}`}
              className="text-[#00b89e] font-medium"
            >
              Report it
            </Link>
          </p>
        )}

        {error && (
          <p role="alert" className="text-[12px] text-[#ef4444] text-center px-5 pt-3">
            {error}
          </p>
        )}

        {/* Save */}
        <div className="px-5 pt-3">
          <button
            onClick={handleSave}
            disabled={saving || removing}
            className="w-full py-3 bg-[#00E5C3] rounded-xl text-[14px] font-medium text-[#004d40] active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button
            onClick={handleRemove}
            disabled={saving || removing}
            className="w-full py-2.5 mt-2 text-[13px] font-medium text-[#ef4444] disabled:opacity-60"
          >
            {removing ? "Removing…" : "Remove from list"}
          </button>
        </div>
      </div>
    </>
  );
}
