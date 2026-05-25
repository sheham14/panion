import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-white dark:bg-[#0f1416] max-w-sm mx-auto flex flex-col items-center justify-center px-6 text-center">
      <p className="text-[13px] font-medium text-[#00E5C3] mb-6">Panion</p>
      <p className="text-[64px] font-bold text-[#00E5C3] leading-none mb-4">
        404
      </p>
      <h1 className="text-[20px] font-semibold text-[#111] dark:text-[#e0e0e0] mb-2">
        Page not found
      </h1>
      <p className="text-[14px] text-[#aaa] leading-relaxed mb-8">
        This page doesn&apos;t exist or may have moved.
      </p>
      <Link
        href="/"
        className="inline-flex items-center bg-[#00E5C3] text-[#0f1416] text-[14px] font-semibold px-6 py-2.5 rounded-full"
      >
        Go home
      </Link>
    </div>
  );
}