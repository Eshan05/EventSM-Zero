'use client';
import { ZeroProvider } from '@/lib/zero/zero';
import { SessionProvider } from 'next-auth/react';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ZeroProvider>
        {children}
      </ZeroProvider>
    </SessionProvider>
  );
}