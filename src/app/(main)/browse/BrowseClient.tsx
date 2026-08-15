"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { getStoreColor } from "@/lib/store-meta";

// ── Types ─────────────────────────────────────────────────────────────────────

type StorePrice = {
  currentPrice: number | null;
  isSale: boolean;
  store: { id: string; chain: string; name: string };
};

type Product = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  unitSize: string | null;
  storeProducts: StorePrice[];
};

type Store = { id: string; chain: string; name: string };

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; emoji: string }> = {
  dairy:            { label: "Dairy",             emoji: "🥛" },
  meat_seafood:     { label: "Meat & Seafood",    emoji: "🥩" },
  produce:          { label: "Produce",           emoji: "🥦" },
  bakery_bread:     { label: "Bakery & Bread",    emoji: "🍞" },
  frozen:           { label: "Frozen",            emoji: "🧊" },
  pantry_dry_goods: { label: "Pantry & Dry Goods",emoji: "🥫" },
  snacks_candy:     { label: "Snacks & Candy",    emoji: "🍪" },
  beverages:        { label: "Beverages",         emoji: "🥤" },
  household:        { label: "Household",         emoji: "🧹" },
  personal_care:    { label: "Personal Care",     emoji: "🧴" },
  baby:             { label: "Baby",              emoji: "👶" },
  pet:              { label: "Pet",               emoji: "🐾" },
  deli_prepared:    { label: "Deli & Prepared",   emoji: "🥙" },
  health_wellness:  { label: "Health & Wellness", emoji: "💊" },
  seasonal:         { label: "Seasonal",          emoji: "🌿" },
  other:            { label: "Other",             emoji: "📦" },
};

function priceTag(price: number, isSale: boolean) {
  return (
    <span
      className={[
        "text-[11px] font-medium px-1.5 py-0.5 rounded-md",
        isSale
          ? "bg-[#fff3f3] dark:bg-[#3a1a1a] text-[#e53e3e]"
          : "bg-[#f4f4f4] dark:bg-[#242b2e] text-[#555] dark:text-[#bbb]",
      ].join(" ")}
    >
      ${price.toFixed(2)}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function BrowseClient({
  products,
  stores,
}: {
  products: Product[];
  stores: Store[];
}) {
  const [view, setView] = useState<"category" | "store">("category");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    products.forEach((p) => { if (p.category) seen.add(p.category); });
    return Array.from(seen).sort();
  }, [products]);

  const filtered = useMemo(() => {
    if (!activeFilter) return products;
    if (view === "category") return products.filter((p) => p.category === activeFilter);
    return products.filter((p) =>
      p.storeProducts.some((sp) => sp.store.id === activeFilter),
    );
  }, [products, view, activeFilter]);

  // Group for "By Store" view — only products available at that store
  const byStore = useMemo(() => {
    if (view !== "store") return null;
    const map = new Map<string, { store: Store; products: Product[] }>();
    const targetStores = activeFilter
      ? stores.filter((s) => s.id === activeFilter)
      : stores;
    for (const store of targetStores) {
      const storeProducts = products.filter((p) =>
        p.storeProducts.some((sp) => sp.store.id === store.id),
      );
      if (storeProducts.length) map.set(store.id, { store, products: storeProducts });
    }
    return map;
  }, [view, activeFilter, products, stores]);

  const filterPills =
    view === "category"
      ? categories.map((c) => ({
          id: c,
          label: CATEGORY_META[c]?.emoji
            ? `${CATEGORY_META[c].emoji} ${CATEGORY_META[c].label}`
            : c,
        }))
      : stores.map((s) => ({ id: s.id, label: s.name }));

  return (
    <div className="min-h-screen bg-white dark:bg-[#0f1416] pb-24">
      {/* Header */}
      <div className="sticky top-safe z-20 bg-white dark:bg-[#0f1416] px-4 pt-5 pb-3 border-b border-[#f0f0f0] dark:border-[#1e2528]">
        <h1 className="text-[20px] font-semibold text-[#111] dark:text-[#e8e8e8] mb-3">
          Browse Products
        </h1>

        {/* View toggle */}
        <div className="flex gap-1.5 mb-3">
          {(["category", "store"] as const).map((v) => (
            <button
              key={v}
              onClick={() => { setView(v); setActiveFilter(null); }}
              className={[
                "px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-colors",
                view === v
                  ? "bg-[#00E5C3] text-[#004d40]"
                  : "bg-[#f4f4f4] dark:bg-[#1e2528] text-[#888] dark:text-[#666]",
              ].join(" ")}
            >
              {v === "category" ? "By Category" : "By Store"}
            </button>
          ))}
        </div>

        {/* Filter pills */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          <button
            onClick={() => setActiveFilter(null)}
            className={[
              "flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-medium transition-colors",
              activeFilter === null
                ? "bg-[#111] dark:bg-[#e8e8e8] text-white dark:text-[#0f1416]"
                : "bg-[#f4f4f4] dark:bg-[#1e2528] text-[#888]",
            ].join(" ")}
          >
            All
          </button>
          {filterPills.map((pill) => (
            <button
              key={pill.id}
              onClick={() => setActiveFilter(pill.id === activeFilter ? null : pill.id)}
              className={[
                "flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-medium transition-colors",
                activeFilter === pill.id
                  ? "bg-[#111] dark:bg-[#e8e8e8] text-white dark:text-[#0f1416]"
                  : "bg-[#f4f4f4] dark:bg-[#1e2528] text-[#888]",
              ].join(" ")}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pt-3">
        {view === "category" ? (
          <CategoryView products={filtered} />
        ) : (
          <StoreView byStore={byStore!} />
        )}
      </div>
    </div>
  );
}

// ── Category view ─────────────────────────────────────────────────────────────

function CategoryView({ products }: { products: Product[] }) {
  const grouped = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of products) {
      const key = p.category ?? "other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [products]);

  if (!products.length) {
    return <p className="text-[13px] text-[#aaa] text-center py-12">No products found.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {Array.from(grouped.entries()).map(([cat, items]) => {
        const meta = CATEGORY_META[cat] ?? { label: cat, emoji: "📦" };
        return (
          <section key={cat}>
            <h2 className="text-[12px] font-semibold text-[#aaa] uppercase tracking-wider mb-2">
              {meta.emoji} {meta.label}
            </h2>
            <div className="flex flex-col gap-2">
              {items.map((p) => <ProductRow key={p.id} product={p} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ── Store view ────────────────────────────────────────────────────────────────

function StoreView({
  byStore,
}: {
  byStore: Map<string, { store: Store; products: Product[] }>;
}) {
  if (!byStore || byStore.size === 0) {
    return <p className="text-[13px] text-[#aaa] text-center py-12">No products found.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {Array.from(byStore.values()).map(({ store, products }) => {
        const color = getStoreColor(store.chain);
        return (
          <section key={store.id}>
            <h2
              className="text-[12px] font-semibold uppercase tracking-wider mb-2"
              style={{ color }}
            >
              {store.name}
            </h2>
            <div className="flex flex-col gap-2">
              {products.map((p) => (
                <ProductRow key={p.id} product={p} highlightStore={store.id} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ── Product row ───────────────────────────────────────────────────────────────

function ProductRow({
  product,
  highlightStore,
}: {
  product: Product;
  highlightStore?: string;
}) {
  const prices = highlightStore
    ? product.storeProducts.filter((sp) => sp.store.id === highlightStore)
    : product.storeProducts;

  return (
    <Link
      href={`/product/${product.id}`}
      className="flex items-start justify-between gap-3 py-3 border-b border-[#f5f5f5] dark:border-[#1e2528] active:bg-[#f9f9f9] dark:active:bg-[#1a2020] -mx-1 px-1 rounded-lg transition-colors"
    >
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-[#111] dark:text-[#e0e0e0] leading-snug">
          {product.name}
        </p>
        <p className="text-[11px] text-[#aaa] mt-0.5">
          {[product.brand, product.unitSize].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        {prices.length === 0 ? (
          <span className="text-[11px] text-[#ccc]">—</span>
        ) : (
          prices.slice(0, 3).map((sp, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span
                className="text-[10px] font-medium"
                style={{ color: getStoreColor(sp.store.chain) }}
              >
                {sp.store.chain}
              </span>
              {sp.currentPrice !== null && priceTag(sp.currentPrice, sp.isSale)}
            </div>
          ))
        )}
      </div>
    </Link>
  );
}