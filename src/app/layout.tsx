import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SessionProvider } from "next-auth/react";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://panion.dev"),
  title: {
    default: "Panion — Grocery Price Intelligence",
    template: "%s — Panion",
  },
  description:
    "Find the best grocery prices at stores in St. John's, Newfoundland. Compare prices, track your pantry, and get AI-powered meal suggestions with Clove.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Panion",
  },
  openGraph: {
    title: "Panion — Grocery Price Intelligence",
    description:
      "Find the best grocery prices at stores in St. John's, Newfoundland.",
    url: "https://panion.dev",
    siteName: "Panion",
    type: "website",
    locale: "en_CA",
  },
  twitter: {
    card: "summary_large_image",
    title: "Panion — Grocery Price Intelligence",
    description:
      "Find the best grocery prices at stores in St. John's, Newfoundland.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${dmSans.variable} antialiased`}
      >
        <SessionProvider>
          {children}
        </SessionProvider>
        <ServiceWorkerRegistrar />
        <Analytics />
      </body>
    </html>
  );
}
