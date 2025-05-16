'use client';

import { Providers } from "@/components/providers";

export default function VLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <Providers>
      {children}
    </Providers>
  );
}
