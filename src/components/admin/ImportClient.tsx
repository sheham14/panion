"use client";

import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Download,
  ExternalLink,
  Inbox,
  Loader2,
  Trash2,
} from "lucide-react";
import { bookmarkletHref as buildBookmarkletHref } from "@/lib/capture/bookmarklet";

type Store = { id: string; name: string; chain: string };

type PendingBatch = {
  id: string;
  source: string;
  url: string | null;
  itemCount: number;
  capturedAt: string | null;
  createdAt: string;
};

type WorklistRow = {
  category: string;
  missing: number;
  covered: number;
  links: { term: string; missing: number; examples: string[]; url: string }[];
};

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

type Unresolved = {
  index: number;
  name: string | null;
  barcode: string | null;
  reason?: "no_match" | "duplicate_product";
  collidedWith?: string | null;
};

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
  origin,
  hasToken,
  tokenHint,
  tokenLastUsedAt,
  pendingBatches,
  worklist,
  worklistStoreName,
}: {
  stores: Store[];
  bookmarkletHref: string;
  origin: string | null;
  hasToken: boolean;
  tokenHint: string | null;
  tokenLastUsedAt: string | null;
  pendingBatches: PendingBatch[];
  worklist: WorklistRow[];
  worklistStoreName: string | null;
}) {
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [batches, setBatches] = useState<PendingBatch[]>(pendingBatches);
  const [activeBatch, setActiveBatch] = useState<string | null>(null);
  const [freshToken, setFreshToken] = useState<string | null>(null);

  // Only the hash is stored server-side, so an armed href can only be built
  // here, in the moment a token is minted.
  const armedHref = useMemo(
    () =>
      freshToken && origin
        ? buildBookmarkletHref({ token: freshToken, origin })
        : bookmarkletHref,
    [freshToken, origin, bookmarkletHref],
  );

  /*
   * React DOM sanitizes any `javascript:` href it renders, replacing it with a
   * URL that throws "React has blocked a javascript: URL as a security
   * precaution" — which would silently break the dragged bookmark. Setting the
   * attribute imperatively, with no `href` prop in the JSX, keeps React's hands
   * off it.
   */
  const bookmarkletRef = useCallback(
    (el: HTMLAnchorElement | null) => {
      el?.setAttribute("href", armedHref);
    },
    [armedHref],
  );
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [imported, setImported] = useState<PreviewResponse | null>(null);
  const [skipped, setSkipped] = useState<number[]>([]);

  async function generateToken() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/capture/token", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? `Request failed (${res.status})`);
        return;
      }
      setFreshToken(body.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function refreshBatches() {
    const res = await fetch("/api/capture/batches");
    if (!res.ok) return;
    const body = await res.json();
    setBatches(body.batches ?? []);
  }

  async function discardBatch(batchId: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/capture/batches", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId }),
      });
      if (res.ok) {
        setBatches((b) => b.filter((x) => x.id !== batchId));
        if (activeBatch === batchId) {
          setActiveBatch(null);
          setPreview(null);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function send(dryRun: boolean, batchId?: string | null) {
    setBusy(true);
    setError(null);
    const useBatch = batchId ?? activeBatch;
    try {
      const res = await fetch("/api/capture/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          dryRun,
          // A queued capture and pasted text are mutually exclusive.
          ...(useBatch ? { batchId: useBatch } : { capture: raw }),
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
        if (useBatch) setActiveBatch(useBatch);
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
        // An imported batch has left the queue.
        if (useBatch) {
          setBatches((b) => b.filter((x) => x.id !== useBatch));
          setActiveBatch(null);
        }
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

  // Rows that found nothing are routine; rows that collided with an already
  // claimed product are a warning about the match that won.
  const unresolved = preview?.unresolved ?? [];
  const collided = unresolved.filter((u) => u.reason === "duplicate_product");
  const noMatch = unresolved.filter((u) => u.reason !== "duplicate_product");

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-[22px] font-semibold text-[#111] dark:text-[#e0e0e0]">
        Import prices
      </h1>
      <p className="text-[13px] text-[#888] mt-1">
        Capture a store&apos;s search results in your browser, review what each row
        matched to, import.
      </p>

      {/* ── Step 1: the bookmarklet ─────────────────────────────── */}
      <section className="mt-6 p-4 rounded-[12px] border border-[#ebebeb] dark:border-[#2e3538]">
        <p className="text-[13px] font-medium text-[#111] dark:text-[#e0e0e0]">
          1. Install the capture button
        </p>
        <p className="text-[12px] text-[#888] mt-1">
          {freshToken
            ? "Drag this to your bookmarks bar now — it carries the key generated below."
            : "Drag this to your bookmarks bar. Generate a key first if you want captures to arrive here automatically."}
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

        {/*
          Auto-submit removes the copy/paste round trip, not the review step.
          Captures land in the queue below and still need a human to confirm
          what each row matched to.
        */}
        <div className="mt-4 pt-3 border-t border-[#ebebeb] dark:border-[#2e3538]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[12px] font-medium text-[#111] dark:text-[#e0e0e0]">
                Auto-submit key
              </p>
              <p className="text-[11px] text-[#aaa] mt-0.5">
                {hasToken && !freshToken
                  ? `A key ending ${tokenHint} is active${
                      tokenLastUsedAt
                        ? `, last used ${new Date(tokenLastUsedAt).toLocaleString()}`
                        : " and has never been used"
                    }. Generating a new one revokes it.`
                  : "Lets the button send captures straight here. It can only queue captures for review — never write a price."}
              </p>
            </div>
            <button
              onClick={generateToken}
              disabled={busy}
              className="flex-shrink-0 px-3 py-1.5 rounded-[8px] border border-[#ebebeb] dark:border-[#2e3538] text-[12px] text-[#111] dark:text-[#e0e0e0] disabled:opacity-40"
            >
              {hasToken ? "Regenerate" : "Generate"}
            </button>
          </div>

          {freshToken && (
            <p className="mt-2 text-[11px] text-[#0a7a62] dark:text-[#00E5C3]">
              New key generated and baked into the button above.{" "}
              <strong>Re-drag it to your bookmarks bar now</strong> — the old
              bookmark no longer works, and the key is not shown again.
            </p>
          )}

          {/*
            The endpoint is worth showing: it comes from the host you loaded
            this page on, and a capture posted at the wrong one fails in a way
            the retailer's page cannot report back.
          */}
          <p className="mt-2 text-[11px] text-[#aaa]">
            Captures post to{" "}
            <code className="font-mono">{origin ?? "(unknown)"}</code>. Load this
            page on the address you actually use, so the bookmark is armed with
            it.
          </p>
        </div>

        <p className="text-[11px] text-[#aaa] mt-3">
          Then: search on walmart.ca or voila.ca and click the button. With a key
          it queues below; without one it copies to your clipboard to paste.
        </p>
      </section>

      {/* ── The review queue ────────────────────────────────────── */}
      {batches.length > 0 && (
        <section className="mt-4 p-4 rounded-[12px] border border-[#00E5C3] dark:border-[#00E5C3]/40">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium text-[#111] dark:text-[#e0e0e0] flex items-center gap-2">
              <Inbox size={14} />
              {batches.length} capture{batches.length === 1 ? "" : "s"} waiting
              for review
            </p>
            <button
              onClick={refreshBatches}
              className="text-[11px] text-[#888] underline"
            >
              Refresh
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            {batches.map((b) => (
              <div
                key={b.id}
                className={`flex items-center gap-3 px-3 py-2 rounded-[10px] border ${
                  activeBatch === b.id
                    ? "border-[#00E5C3] bg-[#00E5C3]/5"
                    : "border-[#ebebeb] dark:border-[#2e3538]"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-[#111] dark:text-[#e0e0e0] truncate">
                    {b.source} — {b.itemCount} product
                    {b.itemCount === 1 ? "" : "s"}
                    {b.itemCount === 0 ? " (diagnostic)" : ""}
                  </p>
                  <p className="text-[11px] text-[#aaa] truncate">
                    {b.url ?? "unknown page"} ·{" "}
                    {new Date(b.capturedAt ?? b.createdAt).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => send(true, b.id)}
                  disabled={busy || b.itemCount === 0}
                  className="flex-shrink-0 px-3 py-1.5 rounded-[8px] bg-[#00E5C3] text-[#004d40] text-[12px] font-semibold disabled:opacity-40"
                >
                  Review
                </button>
                <button
                  onClick={() => discardBatch(b.id)}
                  disabled={busy}
                  title="Discard"
                  className="flex-shrink-0 p-1.5 rounded-[8px] text-[#888] hover:text-[#b91c1c] disabled:opacity-40"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── What to capture next ────────────────────────────────── */}
      {worklist.length > 0 && (
        <section className="mt-4 p-4 rounded-[12px] border border-[#ebebeb] dark:border-[#2e3538]">
          <p className="text-[13px] font-medium text-[#111] dark:text-[#e0e0e0]">
            What to capture next
            {worklistStoreName ? ` for ${worklistStoreName}` : ""}
          </p>
          <p className="text-[12px] text-[#888] mt-1">
            Searches are built from the products actually missing a price here,
            not from generic category terms — so each one has something to match
            against. Other chains&apos; store brands are excluded; they cannot be
            stocked here.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {worklist.map((row) => (
              <details
                key={row.category}
                className="rounded-[10px] border border-[#ebebeb] dark:border-[#2e3538] px-3 py-2"
              >
                <summary className="text-[12px] text-[#111] dark:text-[#e0e0e0] cursor-pointer">
                  {row.category.replace(/_/g, " ")} —{" "}
                  <strong>{row.missing}</strong> missing, {row.covered} covered
                </summary>
                <div className="mt-2 flex flex-col gap-1">
                  {row.links.map((l) => (
                    <a
                      key={l.term}
                      href={l.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex items-center gap-2 px-2 py-1.5 rounded-[8px] border border-[#ebebeb] dark:border-[#2e3538] hover:border-[#00E5C3]"
                    >
                      <span className="text-[11px] font-medium text-[#111] dark:text-[#e0e0e0] flex-shrink-0">
                        {l.term}
                      </span>
                      <span className="text-[10px] text-[#aaa] truncate flex-1">
                        {l.missing} missing · e.g. {l.examples.join("; ")}
                      </span>
                      <ExternalLink size={10} className="flex-shrink-0 text-[#888]" />
                    </a>
                  ))}
                  {row.links.length === 0 && (
                    <span className="text-[11px] text-[#aaa]">
                      No search link for this chain — search manually.
                    </span>
                  )}
                </div>
              </details>
            ))}
          </div>
        </section>
      )}

      {/* ── Step 2: paste ───────────────────────────────────────── */}
      <section className="mt-4 p-4 rounded-[12px] border border-[#ebebeb] dark:border-[#2e3538]">
        <p className="text-[13px] font-medium text-[#111] dark:text-[#e0e0e0]">
          2. Choose the store{batches.length > 0 ? "" : ", or paste a capture"}
        </p>
        <p className="text-[12px] text-[#888] mt-1">
          The store applies to whichever capture you review — a page cannot know
          which shop you were browsing.
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
          onChange={(e) => {
            setRaw(e.target.value);
            // Pasting means reviewing the pasted text, not a queued batch.
            if (e.target.value.trim()) setActiveBatch(null);
          }}
          placeholder="Paste here (Ctrl+V) — only needed without an auto-submit key"
          rows={5}
          className="w-full mt-3 px-3 py-2 rounded-[10px] border border-[#ebebeb] dark:border-[#2e3538] bg-white dark:bg-[#1e2528] text-[12px] font-mono text-[#111] dark:text-[#e0e0e0]"
        />

        <button
          onClick={() => send(true, null)}
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

          {/*
            Zero matches reads like a malfunction but almost never is. Import
            never invents catalogue entries, so a capture of products Panion
            does not hold correctly resolves nothing — that is the refusal
            working. Say so, and point at the actual fix.
          */}
          {preview.resolved === 0 && (
            <div className="mt-3 px-3 py-2.5 rounded-[10px] bg-[#fffbeb] dark:bg-[#2e2a1e] border border-[#fde68a] dark:border-[#4a3f1e] text-[12px] text-[#92400e] dark:text-[#fcd34d]">
              <p className="font-medium">
                Nothing matched — this is usually right, not a failure.
              </p>
              <p className="mt-1">
                An import never creates catalogue entries, so a page of products
                Panion doesn&apos;t hold resolves nothing. Either these products
                aren&apos;t in the catalogue, or they&apos;re variants of ones
                that are (a different scent, size, or formulation), which the
                matcher refuses on purpose.
              </p>
              <p className="mt-1">
                Use a search from the worklist above — those are built from
                products that <em>are</em> missing a price here. To make a new
                aisle comparable, add it to the catalogue first with{" "}
                <code className="font-mono">
                  npm run catalogue:import -- --category &lt;name&gt;
                </code>
                .
              </p>
            </div>
          )}

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

          {noMatch.length > 0 && (
            <details className="mt-3">
              <summary className="text-[12px] text-[#888] cursor-pointer">
                {noMatch.length} not in the catalogue — ignored
              </summary>
              <div className="mt-2 flex flex-col gap-1">
                {noMatch.slice(0, 40).map((u) => (
                  <p key={u.index} className="text-[11px] text-[#aaa] truncate">
                    {u.name}
                  </p>
                ))}
              </div>
            </details>
          )}

          {/*
            Collisions are shown open and in warning colour, not folded away
            with the ignored rows. Several distinct captures landing on one
            catalogue product is the signature of a bad match — it is how four
            different Dempster's loaves once resolved to a single Whole Wheat
            row — so the row above is suspect even though nothing flagged it.
          */}
          {collided.length > 0 && (
            <details open className="mt-3">
              <summary className="text-[12px] text-[#b45309] cursor-pointer">
                {collided.length} matched a product another row already claimed
                — check the match above
              </summary>
              <div className="mt-2 flex flex-col gap-1">
                {collided.slice(0, 40).map((u) => (
                  <p key={u.index} className="text-[11px] text-[#aaa] truncate">
                    {u.name}
                    {u.collidedWith ? ` → ${u.collidedWith}` : ""}
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
