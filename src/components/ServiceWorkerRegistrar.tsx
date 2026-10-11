"use client";
import { useEffect } from "react";

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Production only. `sw.js` serves /_next/static/ cache-first, which is
    // safe when every build names its chunks by content, and wrong in dev,
    // where a chunk keeps its name while its code changes: the browser went
    // on running the first version it cached, through edits and restarts.
    // Unregistering also clears a worker left behind by an earlier dev run.
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .then(() => caches.keys())
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .catch(() => {});
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("SW registration failed:", err);
    });
  }, []);

  return null;
}
