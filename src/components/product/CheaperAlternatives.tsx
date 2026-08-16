"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TrendingDown } from "lucide-react";
import { productImageSrc } from "@/lib/product-image";

/**
 * Cross-brand comparison: "is the store-brand version cheaper?"
 *
 * The price rows above this answer "where is *this item* cheapest". This
 * answers the question that usually saves more money — whether a different
 * brand of the same thing costs less. Ranked by **unit price**, because a group
 * deliberately spans pack sizes and sticker price would mislead: a 284ml can at
 * $2.79 looks cheaper than a 796ml at $3.59 and is in fact twice the price.
 */

type Option = {
  productId: string;
  name: string;
  brand: string | null;
  unitSize: string | null;
  imageUrl: string | null;
  price: number;
  isSale: boolean;
  store: { chain: string; name: string };
  unitPrice: { value: number; basis: string; label: string } | null;
};

type Payload = {
  group: string | null;
  basis: string | null;
  savingsVsCurrent: { productId: string; perUnit: number; percent: number } | null;
  options: Option[];
};

export default function CheaperAlternatives({
  productId,
}: {
  productId: string;
}) {
  // One state object set only from async callbacks. Calling setState
  // synchronously at the top of the effect triggers a cascading render, which
  // is what react-hooks/set-state-in-effect flags.
  const [state, setState] = useState<{ loading: boolean; data: Payload | null }>(
    { loading: true, data: null },
  );
  const { loading, data } = state;

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/products/${productId}/alternatives`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Payload | null) => {
        if (!cancelled) setState({ loading: false, data: d });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, data: null });
      });

    return () => {
      cancelled = true;
    };
  }, [productId]);

  // Nothing to compare against isn't an error state — most of the catalogue
  // has peers, but an ungrouped product simply renders nothing.
  if (loading || !data || data.options.length < 2) return null;

  const savings = data.savingsVsCurrent;

  return (
    <div className="px-4 pt-5">
      <div className="flex items-baseline justify-between mb-2.5">
        <p className="text-[13px] font-medium text-[#111] dark:text-[#e0e0e0]">
          Compare brands
        </p>
        <p className="text-[11px] text-[#aaa]">by unit price</p>
      </div>

      {savings && savings.percent > 0 && (
        <div className="flex items-center gap-2 mb-2.5 px-3 py-2 rounded-[10px] bg-[#f0fdf9] dark:bg-[#1a2e2a] border border-[#c9f2e6] dark:border-[#1e4a3a]">
          <TrendingDown size={14} className="text-[#0a7a62] dark:text-[#6ee7c7] flex-shrink-0" />
          <p className="text-[12px] text-[#0a7a62] dark:text-[#6ee7c7]">
            Switching brand saves{" "}
            <span className="font-semibold">{savings.percent}%</span> per unit
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {data.options.map((o, i) => {
          const isCurrent = o.productId === productId;
          const isBest = i === 0;
          const src = productImageSrc(o.productId, o.imageUrl);

          return (
            <Link
              key={o.productId}
              href={`/product/${o.productId}`}
              className={[
                "flex items-center gap-3 px-3 py-2.5 rounded-[12px] border transition-colors",
                isCurrent
                  ? "border-[#00E5C3] bg-[#f0fdf9] dark:bg-[#1a2e2a]"
                  : "border-[#ebebeb] dark:border-[#2e3538] bg-white dark:bg-[#1e2528]",
              ].join(" ")}
            >
              <div className="w-9 h-9 rounded-[8px] bg-[#f7f7f7] dark:bg-[#242b2e] flex items-center justify-center overflow-hidden flex-shrink-0">
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt={o.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[16px]">🛒</span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[#111] dark:text-[#e0e0e0] truncate">
                  {o.brand ?? o.name}
                </p>
                <p className="text-[11px] text-[#aaa] truncate">
                  {[o.unitSize, o.store.name].filter(Boolean).join(" · ")}
                </p>
              </div>

              <div className="text-right flex-shrink-0">
                <p
                  className={[
                    "text-[13px] font-semibold",
                    isBest ? "text-[#00b89e]" : "text-[#111] dark:text-[#e0e0e0]",
                  ].join(" ")}
                >
                  {o.unitPrice?.label ?? `$${o.price.toFixed(2)}`}
                </p>
                <p className="text-[11px] text-[#aaa]">${o.price.toFixed(2)}</p>
              </div>

              {isBest && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-[#00E5C3] text-[#004d40] flex-shrink-0">
                  Best
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
