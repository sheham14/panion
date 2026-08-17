"use client";

import { useState } from "react";
import { X } from "lucide-react";

type StorePrice = {
  storeId: string;
  chain: string;
  price: number | null;
};

type Props = {
  productId: string;
  storePrices: StorePrice[];
  defaultStoreId: string;
  onClose: () => void;
  isGuest?: boolean;
};

export default function ReportPriceSheet({
  productId,
  storePrices,
  defaultStoreId,
  onClose,
  isGuest = false,
}: Props) {
  /**
   * Every store is selectable, including ones we hold no price for.
   *
   * This used to filter to `sp.price !== null`, which excluded exactly the
   * stores a report is most valuable for: a store with no price could never be
   * chosen, so the gap could never be filled. Sobeys had zero prices and was
   * therefore absent from its own dropdown.
   */
  const availableStores = storePrices;

  const [selectedStoreId, setSelectedStoreId] = useState(defaultStoreId);
  const [price, setPrice] = useState(
    () =>
      availableStores.find((sp) => sp.storeId === defaultStoreId)?.price?.toFixed(2) ?? ""
  );
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function handleStoreSelect(storeId: string) {
    setSelectedStoreId(storeId);
    const storePrice = availableStores.find((sp) => sp.storeId === storeId)?.price;
    // Clear rather than keep the previous store's figure — leaving it prefilled
    // invites submitting one store's price against another.
    setPrice(
      storePrice !== undefined && storePrice !== null
        ? storePrice.toFixed(2)
        : "",
    );
  }

  async function handleSubmit() {
    const reportedPrice = parseFloat(price);
    if (isNaN(reportedPrice) || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/price-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          storeId: selectedStoreId,
          reportedPrice,
          notes: notes.trim() || undefined,
        }),
      });
      if (res.ok) {
        setSubmitted(true);
        setTimeout(onClose, 1500);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-20" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-sm bg-white dark:bg-[#1e2528] rounded-t-[24px] z-30 pb-8">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-[#e0e0e0] dark:bg-[#2e3538]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#f0f0f0] dark:border-[#2e3538]">
          <p className="text-[15px] font-medium text-[#111] dark:text-[#e0e0e0]">
            Report a price
          </p>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#f4f4f4] dark:bg-[#242b2e] flex items-center justify-center"
          >
            <X size={14} className="text-[#888]" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 pt-4 flex flex-col gap-4">
          {isGuest ? (
            <div className="bg-[#f9f9f9] dark:bg-[#242b2e] rounded-xl p-4 text-center">
              <p className="text-[13px] text-[#888] mb-3">
                Sign in to report prices and help the community.
              </p>
              <button
                onClick={onClose}
                className="text-[13px] font-medium text-[#00b89e]"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              {/* Store selector */}
              <div>
                <p className="text-[12px] text-[#aaa] mb-2">Store</p>
                <div className="flex gap-2 flex-wrap">
                  {availableStores.map((sp) => (
                    <button
                      key={sp.storeId}
                      onClick={() => handleStoreSelect(sp.storeId)}
                      className={[
                        "px-3 py-1.5 rounded-full text-[12px] font-medium border transition-all capitalize",
                        selectedStoreId === sp.storeId
                          ? "bg-[#00E5C3] border-[#00E5C3] text-[#004d40]"
                          : "bg-white dark:bg-[#242b2e] border-[#e0e0e0] dark:border-[#2e3538] text-[#555] dark:text-[#bbb]",
                      ].join(" ")}
                    >
                      {sp.chain}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price input */}
              <div>
                <p className="text-[12px] text-[#aaa] mb-2">Price I saw</p>
                <div className="flex items-center border border-[#e0e0e0] dark:border-[#2e3538] rounded-xl overflow-hidden focus-within:border-[#00E5C3] transition-colors">
                  <span className="px-3 text-[14px] text-[#888] bg-[#f9f9f9] dark:bg-[#242b2e] self-stretch flex items-center border-r border-[#e0e0e0] dark:border-[#2e3538]">
                    $
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="flex-1 px-3 py-2.5 text-[14px] text-[#111] dark:text-[#e0e0e0] bg-white dark:bg-[#1e2528] outline-none"
                  />
                </div>
              </div>

              {/* Notes input */}
              <div>
                <p className="text-[12px] text-[#aaa] mb-2">Notes <span className="text-[#ccc]">(optional)</span></p>
                <input
                  type="text"
                  maxLength={500}
                  placeholder="Any details? e.g. saw this at checkout"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-[#e0e0e0] dark:border-[#2e3538] bg-white dark:bg-[#1e2528] text-[13px] text-[#111] dark:text-[#e0e0e0] placeholder-[#bbb] outline-none focus:border-[#00E5C3] transition-colors"
                />
              </div>

              {/* Submit */}
              {submitted ? (
                <p className="text-center text-[13px] text-[#00b89e] py-3">
                  Thanks for the report!
                </p>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={!price || isNaN(parseFloat(price)) || loading}
                  className="w-full py-[13px] bg-[#00E5C3] rounded-[13px] text-[14px] font-medium text-[#004d40] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {loading ? "Submitting…" : "Submit report"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}