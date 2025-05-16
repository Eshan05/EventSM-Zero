import { ModeToggle } from "@/components/mode-toggle";
import LinesLoader from '@/components/linesLoader';
import { Suspense } from "react";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="w-full min-h-screen">
      <aside className="fixed top-4 right-4"> <ModeToggle /> </aside>
      <Suspense fallback={<LinesLoader />}>
        {children}</Suspense>
    </main>
  );
}