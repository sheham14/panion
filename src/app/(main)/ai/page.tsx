import AIChatClient from "@/components/recipes/AIChatClient";

export default function AIChatPage() {
  return (
    <div className="h-[calc(100dvh-72px-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] flex flex-col">
      <AIChatClient />
    </div>
  );
}