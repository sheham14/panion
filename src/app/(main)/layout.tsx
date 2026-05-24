import BottomNav from "@/components/layout/BottomNav";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-white dark:bg-[#0f1416] max-w-sm mx-auto">
      <main className="pb-[72px]">{children}</main>
      <BottomNav />
    </div>
  );
}