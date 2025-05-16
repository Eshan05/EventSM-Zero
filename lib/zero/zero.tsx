'use client';

import {
  useState,
  useEffect,
  useMemo,
  type ReactNode
} from 'react';
import { Zero } from '@rocicorp/zero';
import {
  ZeroProvider as OfficialZeroProvider,
  createUseZero,
} from '@rocicorp/zero/react';
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

interface ZeroClientStateContainer {
  instance: Zero<Schema, AppMutators>;
  initializedWithToken: string;
  initializedWithUserId: string;
}

export function ZeroProvider({ children }: { children: ReactNode }) {
  const { data: session, status: authStatus } = useSession();

  const [fetchedZeroToken, setFetchedZeroToken] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoadingToken, setIsLoadingToken] = useState(true);

  const [currentZeroClientContainer, setCurrentZeroClientContainer] = useState<ZeroClientStateContainer | null>(null);

  const userIdFromSession = useMemo(() => {
    return (session?.user as CustomUser)?.id;
  }, [session?.user]);

  const zeroAuthDataForMutators = useMemo((): ZeroAuthData | undefined => {
    if (session?.user && userIdFromSession) {
      const user = session.user as CustomUser;
      return {
        sub: userIdFromSession,
        role: user.role || 'user',
        username: user.username || 'Anonymous',
      };
    }
    return undefined;
  }, [session?.user, userIdFromSession]);

  useEffect(() => {
    if (authStatus === 'authenticated' && session?.user?.id) {
      setIsLoadingToken(true);
      setError(null);
      fetch('/api/zero-token')
        .then(res => {
          if (!res.ok) {
            return res.json().catch(() => ({ message: `HTTP error ${res.status}` }))
              .then(errBody => { throw new Error(errBody.message || `Failed to fetch zero token: ${res.status}`); });
          }
          return res.json();
        })
        .then(data => {
          if (data.zeroToken) {
            setFetchedZeroToken(data.zeroToken);
          } else {
            throw new Error("Zero token not found in API response.");
          }
        })
        .catch(err => {
          console.error("Error fetching zero token:", err);
          setError(err);
          setFetchedZeroToken(null);
        })
        .finally(() => {
          setIsLoadingToken(false);
        });
    } else if (authStatus === 'unauthenticated') {
      setFetchedZeroToken(null);
      setIsLoadingToken(false);
      setError(null);
      if (currentZeroClientContainer) {
        console.log("User unauthenticated, closing existing Zero client.");
        currentZeroClientContainer.instance.close();
        setCurrentZeroClientContainer(null);
      }
    } else if (authStatus === 'loading') {
      setIsLoadingToken(true);
    }
  }, [authStatus, session?.user?.id, currentZeroClientContainer]);

  useEffect(() => {
    if (fetchedZeroToken && userIdFromSession && zeroAuthDataForMutators) {
      if (
        currentZeroClientContainer &&
        currentZeroClientContainer.initializedWithToken === fetchedZeroToken &&
        currentZeroClientContainer.initializedWithUserId === userIdFromSession
      ) {
        return;
      }

      if (currentZeroClientContainer) {
        console.log("Closing existing Zero client due to token/user change.");
        currentZeroClientContainer.instance.close();
      }

      console.log(`Attempting to initialize Zero client instance for user ${userIdFromSession}...`);
      try {
        const newZeroClientInstance = new Zero<Schema, AppMutators>({
          server: process.env.NEXT_PUBLIC_ZERO_SERVER_URL || "http://localhost:4848",
          auth: fetchedZeroToken,
          userID: userIdFromSession,
          schema: zeroSchemaDefinition,
          mutators: createMutators(zeroAuthDataForMutators),
          onUpdateNeeded: (reason) => {
            console.warn('Zero: Update needed.', reason);
            if (reason.type === 'SchemaVersionNotSupported') {
              alert("Application version mismatch. Reloading to get the latest version.");
              window.location.reload();
            }
          },
        });

        setCurrentZeroClientContainer({
          instance: newZeroClientInstance,
          initializedWithToken: fetchedZeroToken,
          initializedWithUserId: userIdFromSession,
        });
        setError(null);
        console.log("Zero client initialized successfully.");
      } catch (initError: any) {
        console.error("Failed to initialize Zero client:", initError);
        setError(new Error(`Failed to initialize chat service: ${initError.message}`));
        setCurrentZeroClientContainer(null);
      }

    } else if (!fetchedZeroToken && !isLoadingToken && currentZeroClientContainer) {
      console.log("ZeroProvider: Token lost or invalid. Closing existing Zero client.");
      currentZeroClientContainer.instance.close();
      setCurrentZeroClientContainer(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchedZeroToken, userIdFromSession, zeroAuthDataForMutators, isLoadingToken]);


  const isOverallLoading = authStatus === 'loading' || isLoadingToken;

  if (isOverallLoading) return <LinesLoader />;
  if (error) return <div className="p-4 text-center">Error connecting to chat service: {error.message}. Please try refreshing.</div>;
  if (authStatus === 'authenticated' && !currentZeroClientContainer) return <LinesLoader />;


  // --- THIS IS THE CORRECTED PART ---
  // Pass the actual Zero instance, or null if not available.
  // The ZeroProvider from @rocicorp/zero/react should handle the null case gracefully
  // by not providing a context, and useZero() should return undefined or throw if used outside.
  // However, if its type signature `zero: Zero<S, MD>` is strict (no null),
  // we must ensure we only render it when `currentZeroClientContainer.instance` is available.
  const zeroInstanceForProvider = currentZeroClientContainer ? currentZeroClientContainer.instance : null;

  if (authStatus === 'authenticated' && !zeroInstanceForProvider) {
    // This means authenticated, not loading token, no error, but client still not ready.
    // This can happen briefly before the effect creates the client.
    return <LinesLoader />;
  }

  // If the OfficialZeroProvider cannot accept `null`, then we must conditionally render it.
  // Given the type `zero: Zero<S, MD>;`, it indeed cannot accept `null`.
  // So, we only render OfficialZeroProvider when we have an instance.
  // Children that depend on `useZero()` will not render or will handle `z` being undefined
  // if `OfficialZeroProvider` is not in the tree (e.g. for unauthenticated users).

  if (!zeroInstanceForProvider && authStatus !== 'unauthenticated') {
    // This case covers authenticated users for whom the client is not yet ready,
    // but we're past initial loading and error checks.
    return <LinesLoader />;
  }

  // Only render the provider if we have an instance.
  // If unauthenticated, zeroInstanceForProvider will be null, and we'll pass children directly.
  // ChatPage handles unauthenticated state separately.
  if (zeroInstanceForProvider) {
    return (
      <OfficialZeroProvider zero={zeroInstanceForProvider}>
        {children}
      </OfficialZeroProvider>
    );
  }

  // For unauthenticated users or if zeroInstanceForProvider is null for other reasons (e.g. error handled above)
  // Render children directly; they should handle lack of Zero context.
  // ChatPage, for instance, checks session status.
  return <>{children}</>;
}