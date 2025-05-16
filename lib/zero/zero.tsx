'use client';

import {
  useState,
  useEffect,
  useMemo,
  type ReactNode
} from 'react';
import { Zero } from '@rocicorp/zero';

import { ZeroProvider as OfficialZeroProvider, useZero as useOfficialZeroHook, createUseZero, useQuery } from '@rocicorp/zero/react';
import { useSession } from 'next-auth/react';

import {
  schema as zeroSchemaDefinition,
  createMutators,
  type Schema,
  type ZeroAuthData
} from '@/lib/zero/config';
import { CustomUser } from '@/lib/auth';
import LinesLoader from '../../components/linesLoader';

type AppMutators = ReturnType<typeof createMutators>;
export const useZero = createUseZero<Schema, AppMutators>();

// This component fetches the token, initializes Zero, and wraps children with OfficialZeroProvider
export function ZeroProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const [zeroToken, setZeroToken] = useState<string | null>(null);
  const [zeroError, setZeroError] = useState<Error | null>(null);
  const [isZeroLoading, setIsZeroLoading] = useState(true);

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.id) {
      setIsZeroLoading(true);
      setZeroError(null);
      fetch('/api/zero-token')
        .then(res => {
          if (!res.ok) {
            return res.json().catch(() => ({ message: `HTTP error ${res.status}` }))
              .then(errBody => { throw new Error(errBody.message || `Failed to fetch zero token: ${res.status}`); });
          }
          return res.json();
        })
        .then(data => {
          setZeroToken(data.zeroToken);
          setIsZeroLoading(false);
        })
        .catch(err => {
          console.error("Error fetching zero token:", err);
          setZeroError(err);
          setIsZeroLoading(false);
          setZeroToken(null);
        });
    } else if (status === 'unauthenticated') {
      setZeroToken(null);
      setIsZeroLoading(false);
      setZeroError(null);
    } else if (status === 'loading') {
      setIsZeroLoading(true);
    }
  }, [status, session]);

  const zeroInstance = useMemo(() => {
    const userIdFromSession = (session?.user as any)?.id as string | undefined;

    if (zeroToken && userIdFromSession) {
      console.log(`Initializing Zero client instance for user ${userIdFromSession}...`);
      setZeroError(null);

      const config = {
        server: process.env.NEXT_PUBLIC_ZERO_SERVER_URL!, // WebSocket URL for zero-cache
        auth: zeroToken, // Pass the fetched JWT for WebSocket auth
        userID: userIdFromSession, // Pass the user ID matching the JWT's 'sub' claim
        schema: zeroSchemaDefinition, // Pass schema to client Zero instance
        mutators: createMutators(/* authData not passed client-side */), // Client mutator definitions
      };

      const instance = new Zero(config);
      // --- Set up Zero event listeners ---
      // Based on errors, onError, onConnect, onDisconnect properties might not exist
      // or might be handled differently. We will remove direct property assignment.
      // Zero hooks like useQuery often expose loading/error states implicitly.
      // If you need explicit connection status, check Zero client API types or docs further.
      // For now, rely on hooks and general error state.
      console.log("Note: Zero client instance event properties (onError, onConnect, onDisconnect) might not be available or used differently.");
      return instance;
    } else {
      return null;
    }
  }, [zeroToken, (session?.user as CustomUser)?.id, session?.user]);

  useEffect(() => {
    return () => {
      if (zeroInstance) {
        console.log('Closing Zero client connection.');
        zeroInstance.close();
      }
    };
  }, [zeroInstance]);


  const isLoading = status === 'loading' || (status === 'authenticated' && !zeroInstance && !zeroError);
  if (isLoading) {
    return <LinesLoader />;
  }

  if (zeroError) {
    return <div>Error connecting to chat: {zeroError.message}</div>;
  }

  if (!zeroInstance) {
    return <div>Initializing Zero instance...</div>;
  }

  return (
    <OfficialZeroProvider zero={zeroInstance}>
      {children}
    </OfficialZeroProvider>
  );
}