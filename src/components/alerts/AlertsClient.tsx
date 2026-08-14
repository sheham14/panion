"use client";

import { useState, useRef } from "react";
import { MoreHorizontal, Bell } from "lucide-react";
import type { SerializedAlert, AlertPayload } from "@/app/(main)/alerts/page";
import { useRouter } from "next/dist/client/components/navigation";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

function priceDrop(payload: AlertPayload): string {
  const drop = payload.oldPrice - payload.newPrice;
  return `−$${drop.toFixed(2)}`;
}

// ─── Alert Row ────────────────────────────────────────────────────────────────

function AlertRow({
  alert,
  onRead,
  onDismiss,
}: {
  alert: SerializedAlert;
  onRead: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const isUnread = !alert.readAt;
  const touchStartX = useRef<number>(0);
  const [swiped, setSwiped] = useState(false);
  const router = useRouter();

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (diff > 60) setSwiped(true);
    else if (diff < -20) setSwiped(false);
  }

  return (
    <div className="relative overflow-hidden border-b border-[#f5f5f5] dark:border-[#2a3044]">
      {/* Swipe dismiss action */}
      <div className="absolute right-0 top-0 bottom-0 w-[72px] bg-red-50 dark:bg-[#2e1a1a] flex items-center justify-center">
        <button onClick={() => onDismiss(alert.id)}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M3 3L13 13M13 3L3 13"
              stroke="#ef4444"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Card */}
      <div
        className={[
          "flex items-start gap-3 px-4 py-[14px] transition-transform duration-200 relative z-10 cursor-pointer",
          isUnread
            ? "bg-[#fafffe] dark:bg-[#1a2e2a] border-l-[3px] border-l-[#00E5C3]"
            : "bg-white dark:bg-[#161b1e] border-l-[3px] border-l-transparent",
          swiped ? "-translate-x-[72px]" : "translate-x-0",
        ].join(" ")}
        onClick={() => {
          if (isUnread) onRead(alert.id);
          if (alert.payload.productId) {
            router.push(`/product/${alert.payload.productId}`);
          }
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Emoji icon */}
        <div className="w-[42px] h-[42px] rounded-[12px] bg-[#f7f7f7] dark:bg-[#242b2e] flex items-center justify-center text-[20px] flex-shrink-0">
          {alert.payload.emoji}
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <p
            className={[
              "text-[13px] truncate mb-[3px]",
              isUnread
                ? "font-semibold text-[#111] dark:text-[#e0e0e0]"
                : "font-medium text-[#111] dark:text-[#e0e0e0]",
            ].join(" ")}
          >
            {alert.payload.productName}
          </p>

          {/* Price row */}
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[12px] text-[#aaa] line-through">
              ${alert.payload.oldPrice.toFixed(2)}
            </span>
            <span className="text-[11px] text-[#aaa]">→</span>
            <span className="text-[14px] font-medium text-[#00b89e]">
              ${alert.payload.newPrice.toFixed(2)}
            </span>
            <span className="text-[10px] bg-[#f0fdf9] dark:bg-[#1a2e2a] text-[#0a7a62] dark:text-[#6ee7c7] border border-[#b2f0e4] dark:border-[#1e4a3a] rounded-[4px] px-[5px] py-[1px]">
              {priceDrop(alert.payload)}
            </span>
          </div>

          {/* Meta */}
          <div className="flex items-center gap-1.5">
            <div
              className="w-[5px] h-[5px] rounded-full flex-shrink-0"
              style={{ background: alert.payload.storeColor }}
            />
            <span className="text-[11px] text-[#bbb]">
              {alert.payload.storeName}
            </span>
          </div>
        </div>

        {/* Time */}
        <span className="text-[11px] text-[#ccc] flex-shrink-0 mt-0.5">
          {relativeTime(alert.createdAt)}
        </span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AlertsClient({
  initialAlerts,
}: {
  initialAlerts: SerializedAlert[];
}) {
  const [alerts, setAlerts] = useState(initialAlerts);
  const [menuOpen, setMenuOpen] = useState(false);

  const todayAlerts = alerts.filter((a) => isToday(a.createdAt));
  const earlierAlerts = alerts.filter((a) => !isToday(a.createdAt));
  const unreadCount = alerts.filter((a) => !a.readAt).length;

  function handleRead(id: string) {
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, readAt: new Date().toISOString() } : a,
      ),
    );
    fetch(`/api/alerts/${id}/read`, { method: "PATCH" });
  }

  function handleDismiss(id: string) {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    fetch(`/api/alerts/${id}`, { method: "DELETE" });
  }

  async function handleMarkAllRead() {
    setAlerts((prev) =>
      prev.map((a) => ({ ...a, readAt: a.readAt ?? new Date().toISOString() })),
    );
    await fetch("/api/alerts/read", { method: "PATCH" });
    setMenuOpen(false);
  }

  async function handleClearRead() {
    setAlerts((prev) => prev.filter((a) => !a.readAt));
    await fetch("/api/alerts/read", { method: "DELETE" });
    setMenuOpen(false);
  }

  return (
    <div className="bg-[#f7f7f7] dark:bg-[#161b1e]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-[10px] bg-[#f7f7f7] dark:bg-[#161b1e]">
        <div className="flex items-center gap-2">
          <p className="text-[20px] font-medium text-[#111] dark:text-[#e0e0e0]">
            Alerts
          </p>
          {unreadCount > 0 && (
            <span className="text-[11px] font-medium bg-[#00E5C3] text-[#004d40] rounded-full px-2 py-0.5">
              {unreadCount}
            </span>
          )}
        </div>

        {/* 3-dot menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="w-8 h-8 rounded-[10px] bg-[#f4f4f4] dark:bg-[#242b2e] flex items-center justify-center"
          >
            <MoreHorizontal
              size={16}
              className="text-[#555] dark:text-[#aaa]"
            />
          </button>

          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute top-9 right-0 z-20 bg-white dark:bg-[#1e2528] border border-[#e0e0e0] dark:border-[#2e3538] rounded-[12px] overflow-hidden shadow-lg min-w-[180px]">
                <button
                  onClick={handleMarkAllRead}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-[13px] text-[#111] dark:text-[#e0e0e0] hover:bg-[#f7f7f7] dark:hover:bg-[#242b2e] border-b border-[#f5f5f5] dark:border-[#2e3538]"
                >
                  Mark all as read
                </button>
                <button
                  onClick={handleClearRead}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-[13px] text-[#111] dark:text-[#e0e0e0] hover:bg-[#f7f7f7] dark:hover:bg-[#242b2e]"
                >
                  Clear read notifications
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {alerts.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
          <div className="w-14 h-14 rounded-[18px] bg-[#f0fdf9] dark:bg-[#1a2e2a] flex items-center justify-center mb-4">
            <Bell size={24} className="text-[#00b89e]" strokeWidth={1.5} />
          </div>
          <p className="text-[15px] font-medium text-[#111] dark:text-[#e0e0e0] mb-2">
            No notifications yet
          </p>
          <p className="text-[13px] text-[#aaa] leading-relaxed">
            We&apos;ll let you know when prices drop on your saved products
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#161b1e]">
          {/* Today */}
          {todayAlerts.length > 0 && (
            <>
              <p className="text-[10px] font-medium text-[#ccc] uppercase tracking-[0.8px] px-4 pt-3 pb-[6px]">
                Today
              </p>
              {todayAlerts.map((alert) => (
                <AlertRow
                  key={alert.id}
                  alert={alert}
                  onRead={handleRead}
                  onDismiss={handleDismiss}
                />
              ))}
            </>
          )}

          {/* Earlier */}
          {earlierAlerts.length > 0 && (
            <>
              <p className="text-[10px] font-medium text-[#ccc] uppercase tracking-[0.8px] px-4 pt-3 pb-[6px]">
                Earlier
              </p>
              {earlierAlerts.map((alert) => (
                <AlertRow
                  key={alert.id}
                  alert={alert}
                  onRead={handleRead}
                  onDismiss={handleDismiss}
                />
              ))}
            </>
          )}
        </div>
      )}

      <div className="h-20" />
    </div>
  );
}
