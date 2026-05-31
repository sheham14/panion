/**
 * Component test — proves the GuestBanner renders only when the session is unauthenticated.
 * Demonstrates RTL setup; intentionally minimal — most UI testing isn't worth the maintenance cost.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import GuestBanner from "@/components/GuestBanner";

// Mock next/navigation since the component uses useRouter
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock the useGuest hook directly — easier than mocking next-auth's SessionProvider
vi.mock("@/hooks/useGuest", () => ({
  useGuest: vi.fn(),
}));

import { useGuest } from "@/hooks/useGuest";

describe("GuestBanner", () => {
  it("renders the banner when the user is a guest", () => {
    vi.mocked(useGuest).mockReturnValue({ isGuest: true, isLoading: false, session: null });
    render(<GuestBanner />);
    expect(screen.getByText(/guest mode/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("renders nothing when the user is authenticated", () => {
    vi.mocked(useGuest).mockReturnValue({ isGuest: false, isLoading: false, session: null });
    const { container } = render(<GuestBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});
