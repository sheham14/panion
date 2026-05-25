"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bell, BellOff, Plus, Flag } from "lucide-react";
import AddToListSheet from "@/components/search/AddToListSheet";
import ReportPriceSheet from "@/components/product/ReportPriceSheet";
import { useGuest } from "@/hooks/useGuest";

// ── Types ──────────────────────────────────────

type StorePrice = {
  storeId: string;
  chain: string;
  storeName: string;
  price: number | null;
  isSale: boolean;
  scrapedAt: string | null;
  daysAgo: number | null;
  color: string;
  bg: string;
  letter: string;
};

type Product = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  unitSize: string | null;
  unitMeasure: string | null;
  imageUrl: string | null;
  description: string | null;
  storePrices: StorePrice[];
  bestPrice: number | null;
  bestStore: string | null;
  unitPrice: string | null;
  isWatched: boolean;
};

type SimilarProduct = {
  id: string;
  name: string;
  brand: string | null;
  unitSize: string | null;
  imageUrl: string | null;
  bestPrice: number | null;
  bestStore: string | null;
};

// ── Freshness ──────────────────────────────────

function freshnessFromDays(days: number | null) {
  if (days === null) return { label: "Not tracked", color: "bg-[#9ca3af]" };
  if (days === 0) return { label: "Updated today", color: "bg-[#22c55e]" };
  if (days <= 3) return { label: `${days}d ago`, color: "bg-[#22c55e]" };
  if (days <= 7) return { label: `${days} days ago`, color: "bg-[#f59e0b]" };
  if (days <= 14) return { label: `${days} days ago`, color: "bg-[#ef4444]" };
  return { label: "Unable to verify", color: "bg-[#9ca3af]" };
}

// ── Store price card ───────────────────────────

function StorePriceCard({ sp, isBest }: { sp: StorePrice; isBest: boolean }) {
  const freshness = freshnessFromDays(sp.daysAgo);
  const unavailable = sp.price === null;

  return (
    <div
      className={[
        "flex items-center gap-3 px-3.5 py-2.5 border rounded-xl transition-all",
        unavailable
          ? "opacity-40 border-[#ebebeb] dark:border-[#2e3538] bg-white dark:bg-[#1e2528]"
          : isBest
            ? "border-[#00E5C3] bg-[#fafffe] dark:bg-[#1a2e2a]"
            : "border-[#ebebeb] dark:border-[#2e3538] bg-white dark:bg-[#1e2528]",
      ].join(" ")}
    >
      {/* Store logo */}
      <div
        className="w-8 h-8 rounded-[9px] flex items-center justify-center text-[11px] font-bold flex-shrink-0"
        style={{ background: sp.bg, color: sp.color }}
      >
        {sp.letter}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-[#111] dark:text-[#e0e0e0]">
          {sp.chain.charAt(0).toUpperCase() + sp.chain.slice(1)}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${freshness.color}`}
          />
          <span className="text-[10px] text-[#aaa]">{freshness.label}</span>
        </div>
      </div>

      {/* Price */}
      <div className="text-right flex-shrink-0">
        {unavailable ? (
          <p className="text-[11px] text-[#ccc]">Unavailable</p>
        ) : (
          <>
            <p
              className={[
                "text-[15px] font-medium",
                isBest ? "text-[#00b89e]" : "text-[#111] dark:text-[#e0e0e0]",
              ].join(" ")}
            >
              ${sp.price!.toFixed(2)}
            </p>
            <div className="flex items-center justify-end gap-1 mt-0.5">
              {sp.isSale && (
                <span className="text-[9px] bg-[#fef2f2] dark:bg-[#3a1a1a] text-[#ef4444] border border-[#fecaca] dark:border-[#5a2020] rounded px-1 py-px">
                  Sale
                </span>
              )}
              {isBest && (
                <span className="text-[9px] bg-[#00E5C3] text-[#004d40] rounded px-1 py-px">
                  Best
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main client component ──────────────────────

export default function ProductDetailClient({
  product,
  similar,
  isLoggedIn,
}: {
  product: Product;
  similar: SimilarProduct[];
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const { isGuest } = useGuest();
  const [isWatched, setIsWatched] = useState(product.isWatched);
  const [showAddToList, setShowAddToList] = useState(false);
  const [showReportSheet, setShowReportSheet] = useState(false);

  async function handleToggleWatch() {
    if (!isLoggedIn) {
      router.push("/signin");
      return;
    }
    const method = isWatched ? "DELETE" : "POST";
    const res = await fetch("/api/watchlist", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: product.id }),
    });
    if (res.ok) setIsWatched((w) => !w);
  }

  const metaParts = [
    product.category?.replace(/_/g, " "),
    product.brand,
    product.unitSize,
  ].filter(Boolean);

  return (
    <div className="bg-white dark:bg-[#0f1416]">
      {/* Hero */}
      <div className="relative h-[180px] bg-[#f7f7f7] dark:bg-[#242b2e] flex items-center justify-center flex-shrink-0">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-[80px]">🛒</span>
        )}

        {/* Back */}
        <button
          onClick={() => router.back()}
          className="absolute top-11 left-4 w-[30px] h-[30px] rounded-[9px] bg-black/10 dark:bg-black/30 flex items-center justify-center"
        >
          <ArrowLeft
            size={14}
            className="text-[#333] dark:text-[#ccc]"
            strokeWidth={1.5}
          />
        </button>

        {/* Watch toggle */}
        <button
          onClick={handleToggleWatch}
          className={[
            "absolute top-11 right-4 w-[30px] h-[30px] rounded-[9px] flex items-center justify-center transition-all",
            isWatched
              ? "bg-[#00E5C322] dark:bg-[#00E5C322]"
              : "bg-black/10 dark:bg-black/30",
          ].join(" ")}
        >
          {isWatched ? (
            <Bell size={14} className="text-[#00b89e]" strokeWidth={1.5} />
          ) : (
            <BellOff
              size={14}
              className="text-[#888] dark:text-[#ccc]"
              strokeWidth={1.5}
            />
          )}
        </button>
      </div>

      {/* Scrollable body */}
      <div className="pb-4">
        {/* Product header */}
        <div className="px-4 py-3.5 border-b border-[#f0f0f0] dark:border-[#1e2528]">
          <h1 className="text-[17px] font-medium text-[#111] dark:text-[#e0e0e0] mb-1.5">
            {product.name}
          </h1>
          {metaParts.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {metaParts.map((part, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  {i > 0 && (
                    <span className="w-[3px] h-[3px] rounded-full bg-[#ddd] dark:bg-[#444]" />
                  )}
                  <span className="text-[12px] text-[#aaa] capitalize">
                    {part}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Best price row */}
        {product.bestPrice !== null && (
          <div className="flex items-baseline gap-2 px-4 pt-3 pb-1">
            <span className="text-[28px] font-medium text-[#00b89e]">
              ${product.bestPrice.toFixed(2)}
            </span>
            <span className="text-[12px] text-[#aaa]">
              best price · {product.bestStore}
            </span>
            {product.unitPrice && (
              <span className="text-[12px] text-[#bbb] ml-auto">
                {product.unitPrice}
              </span>
            )}
          </div>
        )}

        {/* Store prices */}
        <p className="text-[13px] font-medium text-[#111] dark:text-[#e0e0e0] px-4 pt-4 pb-2.5">
          Prices across stores
        </p>
        <div className="px-4 flex flex-col gap-2 mb-4">
          {product.storePrices.map((sp) => (
            <StorePriceCard
              key={sp.storeId}
              sp={sp}
              isBest={sp.chain === product.bestStore && sp.price !== null}
            />
          ))}
        </div>

        {/* Add to list */}
        <div className="px-4 mb-2">
          <button
            onClick={() =>
              isLoggedIn ? setShowAddToList(true) : router.push("/signin")
            }
            className="w-full py-[13px] bg-[#00E5C3] rounded-[13px] text-[14px] font-medium text-[#004d40] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <Plus size={16} strokeWidth={2} />
            Add to grocery list
          </button>
        </div>

        {/* Report price */}
        <button
          onClick={() => isLoggedIn ? setShowReportSheet(true) : router.push("/signin")}
          className="w-full text-center text-[11px] text-[#bbb] py-2 mb-4"
        >
          Price looks wrong? <span className="text-[#00b89e]">Report it</span>
        </button>

        {/* Similar products */}
        {similar.length > 0 && (
          <>
            <p className="text-[13px] font-medium text-[#111] dark:text-[#e0e0e0] px-4 pb-2.5">
              Similar products
            </p>
            <div className="flex gap-2.5 px-4 overflow-x-auto pb-2 scrollbar-subtle">
              {similar.map((p) => (
                <Link
                  key={p.id}
                  href={`/product/${p.id}`}
                  className="flex-shrink-0 w-[110px] bg-white dark:bg-[#1e2528] border border-[#ebebeb] dark:border-[#2e3538] rounded-xl p-2.5 active:scale-95 transition-transform"
                >
                  <div className="w-10 h-10 rounded-[8px] bg-[#f7f7f7] dark:bg-[#242b2e] flex items-center justify-center text-[20px] mb-1.5 overflow-hidden">
                    {p.imageUrl ? (
                      <img
                        src={p.imageUrl}
                        alt={p.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      "🛒"
                    )}
                  </div>
                  <p className="text-[11px] font-medium text-[#111] dark:text-[#e0e0e0] truncate mb-0.5">
                    {p.name}
                  </p>
                  {p.bestPrice !== null && (
                    <p className="text-[12px] font-medium text-[#00b89e]">
                      ${p.bestPrice.toFixed(2)}
                    </p>
                  )}
                  {p.bestStore && (
                    <p className="text-[10px] text-[#aaa] capitalize">
                      {p.bestStore}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Add to list sheet */}
      {showAddToList && (
        <AddToListSheet
          productId={product.id}
          productName={product.name}
          onClose={() => setShowAddToList(false)}
        />
      )}

      {/* Report price sheet */}
      {showReportSheet && (
        <ReportPriceSheet
          productId={product.id}
          storePrices={product.storePrices}
          isGuest={isGuest}
          defaultStoreId={
            product.storePrices.find((sp) => sp.chain === product.bestStore)?.storeId ??
            product.storePrices[0]?.storeId ??
            ""
          }
          onClose={() => setShowReportSheet(false)}
        />
      )}
    </div>
  );
}
