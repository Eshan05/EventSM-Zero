import { ModeToggle } from "@/components/mode-toggle";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="w-full min-h-screen">
      <aside className="fixed top-4 right-4"> <ModeToggle /> </aside>
      {children}
    </main>
  );
}