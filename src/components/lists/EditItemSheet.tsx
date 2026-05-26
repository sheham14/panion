"use client";

import { useEffect, useState } from "react";
import { X, Minus, Plus } from "lucide-react";
import { getAllowedUnits } from "@/lib/unit-convert";

type Product = {
  id: string;
  name: string;
  brand: string | null;
  unitSize: string | null;
  unitMeasure: string | null;
  unitQuantity: number | null;
  bestPrice: number | null;
  bestStore: string | null;
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
  onSave: (
    id: string,
    data: {
      quantity: number;
      unit: string;
      notes: string;
      customPrice: number | null;
    },
  ) => Promise<void>;
  onClose: () => void;
};

export default function EditItemSheet({ item, onSave, onClose }: Props) {
  const [customPrice, setCustomPrice] = useState<string>(
    item.customPrice !== null ? String(item.customPrice) : "",
  );
  const [quantity, setQuantity] = useState<string | number>(
    String(item.quantity ?? 1),
  );
  const [unit, setUnit] = useState(item.unit ?? "each");
  const [notes, setNotes] = useState(item.notes ?? "");
  const [saving, setSaving] = useState(false);
  const allowedUnits = getAllowedUnits(
    item.product?.unitMeasure,
    item.product?.unitSize,
  );

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    const allowed = getAllowedUnits(
      item.product?.unitMeasure,
      item.product?.unitSize,
    );
    if (!allowed.includes(unit)) {
      setUnit(allowed[0]);
    }
  }, [item.product?.unitMeasure, item.product?.unitSize]);

  async function handleSave() {
    setSaving(true);
    await onSave(item.id, {
      quantity: Math.max(1, parseInt(String(quantity)) || 1),
      unit,
      notes,
      customPrice: customPrice ? parseFloat(customPrice) : null,
    });
    setSaving(false);
    onClose();
  }
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-20" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-sm bg-white dark:bg-[#1e2528] rounded-t-[20px] z-30 pb-8">
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
            className="w-7 h-7 rounded-full bg-[#f4f4f4] dark:bg-[#242b2e] flex items-center justify-center"
          >
            <X size={13} className="text-[#888]" />
          </button>
        </div>

        {/* Linked product */}
        {item.product && (
          <div className="px-5 pt-4">
            <p className="text-[11px] font-medium text-[#aaa] uppercase tracking-[0.6px] mb-2">
              Linked product
            </p>
            <div className="flex items-center gap-3 p-3 border border-[#ebebeb] dark:border-[#2e3538] rounded-xl">
              <div className="w-9 h-9 rounded-[8px] bg-[#f7f7f7] dark:bg-[#242b2e] flex items-center justify-center text-[18px] flex-shrink-0">
                🛒
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[#111] dark:text-[#e0e0e0] truncate">
                  {item.product.name}
                </p>
                <p className="text-[11px] text-[#aaa]">
                  {[item.product.brand, item.product.unitSize]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {item.product.bestPrice && (
                <p className="text-[14px] font-medium text-[#00b89e] flex-shrink-0">
                  ${item.product.bestPrice.toFixed(2)}
                </p>
              )}
            </div>
          </div>
        )}

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
                setQuantity("" as any); // allow empty while typing
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
                onClick={() => setUnit(u)}
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

        {!item.product && (
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

        {/* Report */}
        <p className="text-[11px] text-[#aaa] text-center pt-3">
          Price looks wrong? <span className="text-[#00b89e]">Report it</span>
        </p>

        {/* Save */}
        <div className="px-5 pt-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 bg-[#00E5C3] rounded-xl text-[14px] font-medium text-[#004d40] active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </>
  );
}
