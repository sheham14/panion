"use client";
import { useSession } from "next-auth/react";

// Inside the (main) route group, middleware only allows through users who
// either have a real session OR the panion-guest cookie. So if the session
// status is "unauthenticated" and we're rendering a main-app page, the user
// must be in guest mode — no cookie read required.
export function useGuest() {
  const { data: session, status } = useSession();
  const isGuest = status === "unauthenticated";
  const isLoading = status === "loading";
  return { isGuest, isLoading, session };
}
