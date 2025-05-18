import { NextRequest, NextResponse } from 'next/server';
import {
  PushProcessor,
  ZQLDatabase,
} from '@rocicorp/zero/pg';
import { jwtVerify, type JWTPayload } from 'jose';
import { TextEncoder } from 'util';

import { dbPg, pgPool } from '@/db/config-pg';
import { schema as zeroSchema, type ZeroAuthData } from '@/lib/zero/config';
import { createServerMutators } from '@/lib/zero/server-mutators';
import { DrizzlePgConnection } from '@/lib/zero/drizzle-adapter-pg';

const drizzleZeroConnection = new DrizzlePgConnection(dbPg, pgPool);
const zqlDatabase = new ZQLDatabase(drizzleZeroConnection, zeroSchema);
const processor = new PushProcessor(zqlDatabase);

async function getAuthDataFromPushRequest(req: NextRequest): Promise<ZeroAuthData | undefined> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return undefined;
  const token = authHeader.substring(7);
  if (!process.env.ZERO_AUTH_SECRET) { console.error("ZERO_AUTH_SECRET missing"); return undefined; }
  const secret = new TextEncoder().encode(process.env.ZERO_AUTH_SECRET);
  try {
    const { payload }: { payload: JWTPayload & ZeroAuthData } = await jwtVerify(token, secret);
    if (!payload.sub || !payload.role || !payload.username) return undefined;
    return { sub: payload.sub, role: payload.role, username: payload.username };
  } catch (error) { console.error("JWT verify failed:", error); return undefined; }
}

export type ReadonlyJSONValue =
  | null
  | boolean
  | number
  | string
  | readonly ReadonlyJSONValue[]
  | { readonly [key: string]: ReadonlyJSONValue };

export interface PushBody {
  clientGroupID: string;
  mutations: Array<{ id: number;[key: string]: unknown }>;
  pushVersion: number;
  schemaVersion?: number;
  [key: string]: unknown;
}
export interface PushResponse {
  mutations: Array<{ id: number; error?: string;[key: string]: unknown }>;
  [key: string]: unknown;
}

// --- Main Push Endpoint Handler ---
export async function POST(request: NextRequest): Promise<NextResponse> {
  let pushRequestPayload: PushBody;
  try {
    pushRequestPayload = await request.json() as PushBody;
    if (!pushRequestPayload || !pushRequestPayload.mutations) {
      throw new Error("Invalid PushRequest payload structure.");
    }
    // console.log("Zero Push (PushProcessor): Received payload:", JSON.stringify(pushRequestPayload, null, 2));
  } catch (error) {
    if (error instanceof Error) {
      console.error("Zero Push (PushProcessor): Failed to parse request body:", error.message);
      return NextResponse.json({ error: "Invalid request body", details: error.message }, { status: 400 });
    } else {
      console.error("Zero Push (PushProcessor): Failed to parse request body:", error);
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
  }

  const authData = await getAuthDataFromPushRequest(request);
  if (!authData) {
    const errorResponse: PushResponse = {
      mutations: pushRequestPayload.mutations.map((m: { id: number }) => ({ id: m.id, error: "Authentication failed" }))
    } as PushResponse;
    return NextResponse.json(errorResponse, { status: 401 });
  }

  const asyncTasks: Array<() => Promise<void>> = [];
  const mutatorsForServerExecution = createServerMutators(authData, asyncTasks);

  try {
    const pushResponse = await processor.process(
      mutatorsForServerExecution,
      request.nextUrl?.searchParams ?? {},
      pushRequestPayload as unknown as ReadonlyJSONValue
    );

    await Promise.all(asyncTasks.map(task => task().catch(e => console.error("Error in async task:", e))));

    // console.log("Zero Push (PushProcessor): Successfully processed. Response:", JSON.stringify(pushResponse, null, 2));
    return NextResponse.json(pushResponse);

  } catch (error) {
    if (error instanceof Error)
      console.error("Zero Push (PushProcessor): Unhandled error during process:", error.message, error.stack);
    const errorResponse: PushResponse = {
      mutations: pushRequestPayload.mutations.map((m: { id: number }) => ({
        id: m.id,
        error: "Internal server error during push processing."
      }))
    } as PushResponse;
    return NextResponse.json(errorResponse, { status: 500 });
  }
}