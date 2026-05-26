import BottomNav from "@/components/layout/BottomNav";
import GuestBanner from "@/components/GuestBanner";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-white dark:bg-[#0f1416] w-full max-w-md mx-auto pt-safe">
      <GuestBanner />
      <main className="pb-[calc(72px+env(safe-area-inset-bottom,0px))]">{children}</main>
      <BottomNav />
    </div>
  );
}