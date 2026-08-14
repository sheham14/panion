"use client";

import { useState } from "react";
import { X } from "lucide-react";

type ListItem = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  productId: string | null;
};

type Props = {
  listId: string;
  checkedItems: ListItem[];
  onConfirm: (addedToPantry: boolean) => void; // called after pantry add + clear
  onJustClear: () => void;
  onCancel: () => void;
};

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

function formatQty(quantity: number | null, unit: string | null): string {
  if (!quantity && !unit) return "";
  const q =
    quantity != null
      ? quantity % 1 === 0
        ? quantity.toFixed(0)
        : String(quantity)
      : "";
  return unit ? `${q} ${unit}`.trim() : q;
}

export default function PantryFromListSheet({
  listId,
  checkedItems,
  onConfirm,
  onJustClear,
  onCancel,
}: Props) {
  const [mode, setMode] = useState<"default" | "select">("default");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(checkedItems.map((i) => i.id)),
  );
  const [saving, setSaving] = useState(false);

  function toggleItem(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addToPantry(itemIds: string[]) {
    if (itemIds.length === 0) return;
    setSaving(true);
    try {
      await fetch(`/api/pantry/from-list/${listId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: itemIds.map((id) => ({ listItemId: id })),
        }),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleAddAll() {
    await addToPantry(checkedItems.map((i) => i.id));
    onConfirm(true);
  }

  async function handleAddSelected() {
    await addToPantry([...selectedIds]);
    onConfirm(true);
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-20" onClick={onCancel} />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-sm bg-white dark:bg-[#1e2528] rounded-t-[24px] z-30 pb-8 max-h-[80vh] flex flex-col">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-[#e0e0e0] dark:bg-[#2e3538]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#f0f0f0] dark:border-[#2e3538] flex-shrink-0">
          <div>
            <p className="text-[15px] font-medium text-[#111] dark:text-[#e0e0e0]">
              {mode === "select" ? "Select items" : "Add to pantry?"}
            </p>
            <p className="text-[12px] text-[#aaa]">
              {checkedItems.length} item{checkedItems.length !== 1 ? "s" : ""}{" "}
              checked off
            </p>
          </div>
          <button
            onClick={onCancel}
            className="w-8 h-8 rounded-full bg-[#f4f4f4] dark:bg-[#242b2e] flex items-center justify-center"
          >
            <X size={14} className="text-[#888]" />
          </button>
        </div>

        {mode === "default" ? (
          /* Default mode — three options */
          <div className="px-5 pt-4 flex flex-col gap-2">
            <button
              onClick={handleAddAll}
              disabled={saving}
              className="w-full py-3 bg-[#00E5C3] rounded-[12px] text-[13px] font-medium text-[#004d40] disabled:opacity-50"
            >
              {saving
                ? "Adding…"
                : `Add all ${checkedItems.length} items to pantry & clear`}
            </button>
            <button
              onClick={() => setMode("select")}
              className="w-full py-3 rounded-[12px] border border-[#e0e0e0] dark:border-[#2e3538] text-[13px] font-medium text-[#111] dark:text-[#e0e0e0]"
            >
              Select items to add
            </button>
            <button
              onClick={onJustClear}
              className="w-full py-3 rounded-[12px] text-[13px] text-[#aaa]"
            >
              Just clear, don&apos;t add to pantry
            </button>
          </div>
        ) : (
          /* Select mode — checklist */
          <>
            <div className="flex-1 overflow-y-auto px-5 pt-2">
              {checkedItems.map((item) => {
                const checked = selectedIds.has(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => toggleItem(item.id)}
                    className="w-full flex items-center gap-3 py-3 border-b border-[#f5f5f5] dark:border-[#2a3044] last:border-0"
                  >
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
                    <div className="flex-1 text-left">
                      <p className="text-[13px] font-medium text-[#111] dark:text-[#e0e0e0]">
                        {item.name}
                      </p>
                      {(item.quantity || item.unit) && (
                        <p className="text-[11px] text-[#aaa]">
                          {formatQty(item.quantity, item.unit)}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Select mode actions */}
            <div className="px-5 pt-3 flex flex-col gap-2 flex-shrink-0 border-t border-[#f0f0f0] dark:border-[#2e3538]">
              <button
                onClick={handleAddSelected}
                disabled={saving || selectedIds.size === 0}
                className="w-full py-3 bg-[#00E5C3] rounded-[12px] text-[13px] font-medium text-[#004d40] disabled:opacity-50"
              >
                {saving
                  ? "Adding…"
                  : `Add ${selectedIds.size} item${selectedIds.size !== 1 ? "s" : ""} to pantry & clear`}
              </button>
              <button
                onClick={onJustClear}
                className="w-full py-3 rounded-[12px] text-[13px] text-[#aaa]"
              >
                Just clear, don&apos;t add to pantry
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
