"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  ClipboardList,
  Utensils,
  Sparkles,
  Refrigerator,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Home", Icon: Home, exact: true },
  { href: "/lists", label: "Lists", Icon: ClipboardList, exact: false },
  { href: "/pantry", label: "Pantry", Icon: Refrigerator, exact: false },
  { href: "/recipes", label: "Recipes", Icon: Utensils, exact: false },
  { href: "/ai", label: "Clove", Icon: Sparkles, exact: false },
];

export default function BottomNav() {
  const pathname = usePathname();

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href;
    // Prefer the most specific match — if another item is a sub-path of this
    // one and also matches, defer to it.
    const moreSpecific = NAV_ITEMS.some(
      (other) =>
        other.href !== href &&
        other.href.startsWith(href) &&
        pathname.startsWith(other.href),
    );
    if (moreSpecific) return false;
    return pathname.startsWith(href);
  }

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white dark:bg-[#161b1e] border-t border-[#ebebeb] dark:border-[#2e3538] flex items-center justify-around px-2 z-10 pb-safe">
      {NAV_ITEMS.map(({ href, label, Icon, exact }) => {
        const active = isActive(href, exact);
        return (
          <Link
            key={href}
            href={href}
            className={[
              "flex flex-col items-center gap-[3px] pt-4 pb-0 text-[10px] font-medium transition-colors min-w-[52px]",
              active
                ? "text-[#00b89e]"
                : "text-[#bbb] dark:text-[#444] hover:text-[#00b89e] dark:hover:text-[#00b89e]",
            ].join(" ")}
          >
            <Icon size={22} strokeWidth={1.5} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
