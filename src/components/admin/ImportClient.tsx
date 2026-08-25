"use client";

import { useCallback, useState } from "react";
import { AlertTriangle, Check, Download, Loader2 } from "lucide-react";

type Store = { id: string; name: string; chain: string };

type PreviewRow = {
  index: number;
  productId: string;
  matchedName: string | null;
  matchedSize: string | null;
  capturedName: string | null;
  price: number;
  existingPrice: number | null;
  via: string;
  suspicious: boolean;
};

type Unresolved = { index: number; name: string | null; barcode: string | null };

type PreviewResponse = {
  dryRun: boolean;
  store: { id: string; name: string };
  submitted: number;
  resolved: number;
  preview: PreviewRow[];
  unresolved: Unresolved[];
  accepted?: number;
  updated?: number;
};

/**
 * Paste-and-review import.
 *
 * The review step is not ceremony. Captures from Walmart and Voilà carry no
 * barcode, so every match is name-and-size — the same path that once matched a
 * bag of chicken nuggets to a pack of chicken breasts and showed it as a 2.7x
 * saving. Nothing is written until a human has looked at what it matched to.
 */
export default function ImportClient({
  stores,
  bookmarkletHref,
}: {
  stores: Store[];
  bookmarkletHref: string;
}) {
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");

  /*
   * React DOM sanitizes any `javascript:` href it renders, replacing it with a
   * URL that throws "React has blocked a javascript: URL as a security
   * precaution" — which would silently break the dragged bookmark. Setting the
   * attribute imperatively, with no `href` prop in the JSX, keeps React's hands
   * off it.
   */
  const bookmarkletRef = useCallback(
    (el: HTMLAnchorElement | null) => {
      el?.setAttribute("href", bookmarkletHref);
    },
    [bookmarkletHref],
  );
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [imported, setImported] = useState<PreviewResponse | null>(null);
  const [skipped, setSkipped] = useState<number[]>([]);

  async function send(dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/capture/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          dryRun,
          capture: raw,
          // Rows the reviewer unticked never reach the writer.
          skipIndexes: dryRun ? [] : skipped,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? `Request failed (${res.status})`);
        return;
      }
      if (dryRun) {
        setPreview(body);
        setImported(null);
        // Suspicious rows start unticked — opt in to writing them, not out.
        setSkipped(
          (body.preview as PreviewRow[])
            .filter((r) => r.suspicious)
            .map((r) => r.index),
        );
      } else {
        setImported(body);
        setPreview(null);
        setRaw("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (index: number) =>
    setSkipped((s) =>
      s.includes(index) ? s.filter((i) => i !== index) : [...s, index],
    );

  const willWrite = preview
    ? preview.preview.filter((r) => !skipped.includes(r.index)).length
    : 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-[22px] font-semibold text-[#111] dark:text-[#e0e0e0]">
        Import prices
      </h1>
      <p className="text-[13px] text-[#888] mt-1">
        Capture a store&apos;s search results in your browser, paste here, review,
        import.
      </p>

      {/* ── Step 1: the bookmarklet ─────────────────────────────── */}
      <section className="mt-6 p-4 rounded-[12px] border border-[#ebebeb] dark:border-[#2e3538]">
        <p className="text-[13px] font-medium text-[#111] dark:text-[#e0e0e0]">
          1. Install the capture button
        </p>
        <p className="text-[12px] text-[#888] mt-1">
          Drag this to your bookmarks bar. You only do this once.
        </p>
        <a
          ref={bookmarkletRef}
          onClick={(e) => e.preventDefault()}
          draggable
          className="inline-flex items-center gap-2 mt-3 px-3.5 py-2 rounded-[10px] bg-[#00E5C3] text-[#004d40] text-[13px] font-semibold cursor-grab active:cursor-grabbing"
        >
          <Download size={14} />
          Capture → Panion
        </a>
        <p className="text-[11px] text-[#aaa] mt-3">
          Then: search on walmart.ca or voila.ca, click the button, come back and
          paste.
        </p>
      </section>

      {/* ── Step 2: paste ───────────────────────────────────────── */}
      <section className="mt-4 p-4 rounded-[12px] border border-[#ebebeb] dark:border-[#2e3538]">
        <p className="text-[13px] font-medium text-[#111] dark:text-[#e0e0e0]">
          2. Paste the capture
        </p>

        <label className="block mt-3 text-[12px] text-[#888]">
          Store
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="block w-full mt-1 px-3 py-2 rounded-[10px] border border-[#ebebeb] dark:border-[#2e3538] bg-white dark:bg-[#1e2528] text-[13px] text-[#111] dark:text-[#e0e0e0]"
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="Paste here (Ctrl+V)"
          rows={5}
          className="w-full mt-3 px-3 py-2 rounded-[10px] border border-[#ebebeb] dark:border-[#2e3538] bg-white dark:bg-[#1e2528] text-[12px] font-mono text-[#111] dark:text-[#e0e0e0]"
        />

        <button
          onClick={() => send(true)}
          disabled={busy || !raw.trim() || !storeId}
          className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-[10px] bg-[#111] dark:bg-[#e0e0e0] text-white dark:text-[#111] text-[13px] font-semibold disabled:opacity-40"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          Preview
        </button>
      </section>

      {error && (
        <div className="mt-4 px-3 py-2 rounded-[10px] bg-[#fef2f2] dark:bg-[#3a1e1e] border border-[#fecaca] dark:border-[#5a2a2a] text-[12px] text-[#b91c1c] dark:text-[#fca5a5]">
          {error}
        </div>
      )}

      {imported && (
        <div className="mt-4 px-3 py-2.5 rounded-[10px] bg-[#f0fdf9] dark:bg-[#1a2e2a] border border-[#c9f2e6] dark:border-[#1e4a3a] text-[13px] text-[#0a7a62] dark:text-[#6ee7c7] flex items-center gap-2">
          <Check size={15} />
          Imported {imported.accepted} prices to {imported.store.name}
          {imported.updated !== undefined && ` (${imported.updated} changed)`}.
        </div>
      )}

      {/* ── Step 3: review ──────────────────────────────────────── */}
      {preview && (
        <section className="mt-4 p-4 rounded-[12px] border border-[#ebebeb] dark:border-[#2e3538]">
          <p className="text-[13px] font-medium text-[#111] dark:text-[#e0e0e0]">
            3. Review — {preview.resolved} of {preview.submitted} matched
          </p>
          <p className="text-[12px] text-[#888] mt-1">
            Untick anything that matched the wrong product. Suspicious rows are
            unticked already.
          </p>

          <div className="mt-3 flex flex-col gap-1.5 max-h-[420px] overflow-y-auto">
            {preview.preview.map((r) => {
              const on = !skipped.includes(r.index);
              return (
                <label
                  key={r.index}
                  className={[
                    "flex items-start gap-2.5 px-3 py-2 rounded-[10px] border cursor-pointer",
                    r.suspicious
                      ? "border-[#fbbf24] bg-[#fffbeb] dark:bg-[#2e2717] dark:border-[#5a4a1e]"
                      : "border-[#ebebeb] dark:border-[#2e3538]",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(r.index)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-[#111] dark:text-[#e0e0e0] truncate">
                      {r.capturedName}
                    </p>
                    <p className="text-[11px] text-[#888] truncate">
                      → {r.matchedName}
                      {r.matchedSize ? ` · ${r.matchedSize}` : ""}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[12px] font-semibold text-[#111] dark:text-[#e0e0e0]">
                      ${r.price.toFixed(2)}
                    </p>
                    {r.existingPrice !== null && (
                      <p className="text-[11px] text-[#aaa]">
                        was ${r.existingPrice.toFixed(2)}
                      </p>
                    )}
                  </div>
                  {r.suspicious && (
                    <AlertTriangle
                      size={14}
                      className="text-[#b45309] flex-shrink-0 mt-0.5"
                    />
                  )}
                </label>
              );
            })}
          </div>

          {preview.unresolved.length > 0 && (
            <details className="mt-3">
              <summary className="text-[12px] text-[#888] cursor-pointer">
                {preview.unresolved.length} not in the catalogue — ignored
              </summary>
              <div className="mt-2 flex flex-col gap-1">
                {preview.unresolved.slice(0, 40).map((u) => (
                  <p key={u.index} className="text-[11px] text-[#aaa] truncate">
                    {u.name}
                  </p>
                ))}
              </div>
            </details>
          )}

          <button
            onClick={() => send(false)}
            disabled={busy || willWrite === 0}
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-[10px] bg-[#00E5C3] text-[#004d40] text-[13px] font-semibold disabled:opacity-40"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Import {willWrite} price{willWrite === 1 ? "" : "s"}
          </button>
        </section>
      )}
    </div>
  );
}
