// app/api/zero-push/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { TextEncoder } from 'util';

// Your Drizzle instance (configured for Neon, e.g., with HTTP adapter)
import { db } from '@/db/config';
// Your Drizzle table schemas
import {
  messages as messagesTable,
  events as eventsTable,
  blockedWords as blockedWordsTable,
  users as usersTable
} from '@/db/schema';
// Drizzle operators
import { eq, desc } from 'drizzle-orm';

// Your Zero schema, auth data type, and mutator factory
import { type ZeroAuthData } from '@/lib/zero/config'; // Only need ZeroAuthData type here for auth

// Upstash Redis for rate limiting
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import { auth, CustomSession } from '@/lib/auth';

// Type for Drizzle transaction object (adjust if your `db` type is more specific)
type DrizzleTransaction = typeof db;


// --- Initialize Redis Client ---
const redis = Redis.fromEnv(); // Assumes UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are in .env

// --- Blocked Words Cache ---
let blockedWordsCache: string[] = [];
async function loadBlockedWords() {
  try {
    const words = await db.select({ word: blockedWordsTable.word }).from(blockedWordsTable);
    blockedWordsCache = words.map(w => w.word.toLowerCase());
    console.log("Zero Push: Blocked words cache loaded/reloaded:", blockedWordsCache.length);
  } catch (error) {
    console.error("Zero Push: Failed to load blocked words cache:", error);
  }
}
// Initial load and periodic reload
loadBlockedWords().catch(console.error);
const blockedWordsInterval = setInterval(() => loadBlockedWords().catch(console.error), 5 * 60 * 1000); // Reload every 5 minutes
// Optional: Cleanup interval on server shutdown if in a long-running process (not typical for serverless)

async function getAuthDataFromRequest(req: NextRequest): Promise<ZeroAuthData | undefined> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    console.warn("Zero Push: No Bearer token in Authorization header for this request.");
    return undefined;
  }
  const token = authHeader.substring(7); // Remove "Bearer "

  if (!process.env.ZERO_AUTH_SECRET) {
    console.error("Zero Push: ZERO_AUTH_SECRET environment variable is not set. Cannot verify push token.");
    return undefined; // Critical configuration error
  }
  // Ensure ZERO_AUTH_SECRET is the same as AUTH_SECRET used for signing the zeroToken
  const secret = new TextEncoder().encode(process.env.ZERO_AUTH_SECRET);

  try {
    const { payload } = await jwtVerify(token, secret);

    // Validate essential claims expected by ZeroAuthData
    if (!payload.sub || typeof payload.sub !== 'string' ||
      !payload.role || typeof payload.role !== 'string' ||
      !payload.username || typeof payload.username !== 'string') {
      console.warn("Zero Push: JWT payload from Bearer token missing or has invalid type for required claims (sub, role, username). Payload:", payload);
      return undefined;
    }
    return {
      sub: payload.sub,
      role: payload.role,
      username: payload.username,
      // displayName: payload.displayName as string | undefined, // If you add this
    };
  } catch (error) {
    // Log the specific error for debugging JWT issues
    if (error instanceof Error && (error.name === 'JWTExpired' || error.name === 'JWSSignatureVerificationFailed' || error.name === 'JWTInvalid')) {
      console.warn(`Zero Push: JWT (Bearer token) verification failed specifically: ${error.message}`);
    } else {
      console.error("Zero Push: General error during JWT (Bearer token) verification:", error);
    }
    return undefined;
  }
}


// --- Server-Side Mutator Implementations ---
// These functions contain the authoritative logic for each mutation.
// They accept `authData` and `args` from the client, and the Drizzle `tx` object.
const serverMutatorImplementations = {
  /**
   * Adds a new chat message.
   * Performs validation, rate limiting, word blocking, and DB persistence.
   * Returns data needed to construct the Zero patch for clients.
   */
  async addMessage(
    authData: ZeroAuthData,
    args: { text: string; replyToId?: string; eventId?: string; }, // eventId can be optional if server determines it
    tx: DrizzleTransaction // Drizzle transaction object
  ) {
    const userId = authData.sub;

    // --- Server-side Validation ---
    if (!userId) throw new Error('Authentication required to add message.');

    // Determine eventId: prioritize from args, then active event, then default (if applicable)
    let eventIdToUse = args.eventId;
    if (!eventIdToUse) {
      const currentEvent = await tx.query.events.findFirst({
        where: eq(eventsTable.isActive, true),
        columns: { id: true },
        orderBy: [desc(eventsTable.createdAt)]
      });
      eventIdToUse = currentEvent?.id;
    }
    // if (!eventIdToUse && SOME_DEFAULT_EVENT_ID_FOR_SERVER) eventIdToUse = SOME_DEFAULT_EVENT_ID_FOR_SERVER;

    if (!eventIdToUse) throw new Error('No active chat event found or eventId not provided.');
    // if (!args.text || args.text.trim() === "") throw new Error('Message text cannot be empty.');
    const cleanedText = 'Test'; // args.text.trim() || ""; // Uncomment for production

    // --- Rate Limiting (Upstash) ---
    // const userRatelimit = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "2s"), prefix: `chat_user_msg_rl_${userId}` });
    // const { success: userSuccess } = await userRatelimit.limit(`add_message_${eventIdToUse}`); // Include eventId if limits are per event
    // if (!userSuccess) throw new Error('You are sending messages too quickly.');

    // const globalRatelimit = new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(1, "3s"), prefix: `chat_global_msg_rl` });
    // const { success: globalSuccess } = await globalRatelimit.limit(`add_message_${eventIdToUse}`);
    // if (!globalSuccess) throw new Error('Chat is in slow mode. Please wait.');

    // --- Word Blocking ---
    if (blockedWordsCache.some(bw => cleanedText.toLowerCase().includes(bw))) {
      throw new Error('Your message contains blocked words.');
    }

    // --- DB Persistence ---
    const messageId = crypto.randomUUID();
    const serverTimestamp = new Date(); // Use Date object for DB

    await tx.insert(messagesTable).values({
      id: messageId,
      userId: userId,
      eventId: eventIdToUse,
      text: cleanedText,
      replyToMessageId: args.replyToId || undefined, // Drizzle handles undefined as NULL
      isDeleted: false,
      createdAt: serverTimestamp,
      // deletedAt, deletedByUserId will be null/default
    });

    // Data for the patch: what Zero clients need to update their state.
    // This should match the structure defined by your `drizzle-zero generate` for the 'messages' table.
    return {
      id: messageId,
      userId: userId,
      eventId: eventIdToUse,
      text: cleanedText,
      replyToMessageId: args.replyToId || null, // Use null for JSON consistency if field is nullable
      isDeleted: false,
      createdAt: serverTimestamp.getTime(), // Zero expects number timestamp
      usernameDisplay: authData.username, // Send username for immediate display on other clients
      // Ensure `usernameDisplay` is a field in your Zero 'messages' schema if you use it.
      // If not, clients will look up user by userId from the 'users' table in Zero.
    };
  },

  /**
   * Admin action to soft-delete a message.
   */
  async deleteMessage(
    authData: ZeroAuthData,
    args: { messageId: string },
    tx: DrizzleTransaction
  ) {
    if (authData.role !== 'admin') throw new Error('Unauthorized to delete messages.');
    if (!args.messageId) throw new Error('Message ID is required for deletion.');

    const deleteTimestamp = new Date();
    const result = await tx.update(messagesTable)
      .set({
        isDeleted: true,
        deletedAt: deleteTimestamp, // Assuming your Drizzle schema has this
        deletedByUserId: authData.sub, // Assuming your Drizzle schema has this
      })
      .where(eq(messagesTable.id, args.messageId))
      .returning({ id: messagesTable.id }); // Check if any row was updated

    if (result.length === 0) {
      throw new Error('Message not found in database or already deleted.');
    }

    // Data for the patch
    return {
      id: args.messageId,
      isDeleted: true,
      deletedAt: deleteTimestamp.getTime(),
      deletedByUserId: authData.sub,
    };
  },

  /**
   * Admin action to "clear" chat by starting a new event.
   */
  async clearChat(
    authData: ZeroAuthData,
    args: { newEventName?: string },
    tx: DrizzleTransaction
  ) {
    if (authData.role !== 'admin') throw new Error('Unauthorized to clear chat.');

    // Mark all currently active events as inactive
    await tx.update(eventsTable)
      .set({ isActive: false })
      .where(eq(eventsTable.isActive, true));

    // Create a new active event
    const newEventResult = await tx.insert(eventsTable).values({
      name: args.newEventName || `Chat Session ${new Date().toLocaleString()}`, // More readable default
      isActive: true,
      // createdAt handled by DB default
    }).returning({ id: eventsTable.id, name: eventsTable.name });

    const newEvent = newEventResult[0];
    if (!newEvent?.id) {
      throw new Error("Failed to create new event session in database.");
    }

    // Data for the patch: informs clients about the new active event.
    // Clients subscribe to ['currentEventDetails'] and react.
    return {
      currentEventDetails: {
        id: newEvent.id,
        name: newEvent.name || null,
      }
    };
  },

  /**
   * Admin action to add a blocked word.
   */
  async addBlockedWord(
    authData: ZeroAuthData,
    args: { word: string },
    tx: DrizzleTransaction
  ) {
    if (authData.role !== 'admin') throw new Error('Unauthorized to add blocked words.');
    if (!args.word || args.word.trim() === "") throw new Error('Blocked word cannot be empty.');
    const wordToAdd = args.word.trim().toLowerCase();

    try {
      await tx.insert(blockedWordsTable).values({
        word: wordToAdd,
        addedByUserId: authData.sub,
      });
      await loadBlockedWords(); // Refresh in-memory cache
    } catch (e: any) {
      // Check for unique constraint violation (error code depends on DB, e.g., '23505' for PostgreSQL)
      if (e.message.includes('Unique constraint failed') || (e.code && e.code === '23505')) {
        throw new Error(`Word "${wordToAdd}" is already blocked.`);
      }
      console.error("Zero Push: DB error adding blocked word:", e);
      throw new Error('Failed to add blocked word due to a database error.');
    }
    return { word: wordToAdd, status: 'added' }; // Minimal response for patch if needed
  },

  /**
   * Admin action to remove a blocked word.
   */
  async removeBlockedWord(
    authData: ZeroAuthData,
    args: { word: string },
    tx: DrizzleTransaction
  ) {
    if (authData.role !== 'admin') throw new Error('Unauthorized to remove blocked words.');
    if (!args.word || args.word.trim() === "") throw new Error('Word to remove cannot be empty.');
    const wordToRemove = args.word.trim().toLowerCase();

    const result = await tx.delete(blockedWordsTable)
      .where(eq(blockedWordsTable.word, wordToRemove))
      .returning({ id: blockedWordsTable.id });

    if (result.length === 0) {
      throw new Error(`Word "${wordToRemove}" not found in blocked list.`);
    }
    await loadBlockedWords(); // Refresh in-memory cache
    return { word: wordToRemove, status: 'removed' }; // Minimal response
  },
};


// --- Push Endpoint Route Handler (Manual Execution) ---
export async function POST(request: NextRequest): Promise<NextResponse> {
  console.log("Zero Push Headers:", Object.fromEntries(request.headers.entries()))
  let pushRequestPayload: { clientGroupID: string; mutations: Array<{ id: number; name: string; args: any; }> };
  try {
    pushRequestPayload = await request.json();
    if (!pushRequestPayload || typeof pushRequestPayload.clientGroupID !== 'string' || !Array.isArray(pushRequestPayload.mutations)) {
      throw new Error("Invalid PushRequest format.");
    }
  } catch (error: any) {
    console.error("Zero Push: Failed to parse request body or invalid format:", error.message);
    return NextResponse.json({ error: "Invalid request body", details: error.message }, { status: 400 });
  }

  const authData = await getAuthDataFromRequest(request);

  // Initialize PushResponse structure
  const pushResponse: {
    mutations: Array<{ id: number; state?: 'ok' | 'error'; error?: string; serverUndo?: any[]; }>; // serverUndo might be needed for complex cases
    patches?: Array<{ op: 'set' | 'delete'; path: (string | number)[]; value?: any; }>;
  } = {
    mutations: [],
    patches: [] // Patches generated by successful server mutators
  };

  if (!authData) {
    console.warn("Zero Push: Authentication failed.!!!!!!!!!!!!!!!!!!!!!!");
    pushRequestPayload.mutations.forEach(mut => {
      pushResponse.mutations.push({ id: mut.id, state: 'error', error: 'Authentication failed' });
    });
    return NextResponse.json(pushResponse, { status: 401 });
  }

  // Process each mutation sequentially (important if they depend on each other)
  for (const mutation of pushRequestPayload.mutations) {
    const { name, args, id: mutationID } = mutation; // `id` here is the mutationID from Zero client
    const implementation = (serverMutatorImplementations as any)[name];

    if (!implementation) {
      console.warn(`Zero Push: Unknown mutation "${name}" (MutationID: ${mutationID}) received.`);
      pushResponse.mutations.push({ id: mutationID, state: 'error', error: `Unknown mutation: ${name}` });
      continue;
    }

    try {
      console.log(`Zero Push: Executing server mutator "${name}" (MutationID: ${mutationID})...`);
      const resultData = await db.transaction(async (drizzleTx) => {
        return await implementation(authData, args, drizzleTx); // Pass Drizzle transaction context
      });

      pushResponse.mutations.push({ id: mutationID, state: 'ok' });

      if (name === 'addMessage' && resultData?.id) {
        // `resultData` from `addMessage` now includes `usernameDisplay` potentially
        pushResponse.patches!.push({ op: 'set', path: ['messages', resultData.id], value: resultData });
      } else if (name === 'deleteMessage' && resultData?.id) {
        // resultData from deleteMessage includes { id, isDeleted, deletedAt, deletedByUserId }
        // We need to update the corresponding fields in the Zero 'messages' object
        pushResponse.patches!.push({ op: 'set', path: ['messages', resultData.id, 'isDeleted'], value: true });
        if (resultData.deletedAt !== undefined) {
          pushResponse.patches!.push({ op: 'set', path: ['messages', resultData.id, 'deletedAt'], value: resultData.deletedAt });
        }
        if (resultData.deletedByUserId !== undefined) {
          pushResponse.patches!.push({ op: 'set', path: ['messages', resultData.id, 'deletedByUserId'], value: resultData.deletedByUserId });
        }
      } else if (name === 'clearChat' && resultData?.currentEventDetails?.id) {
        pushResponse.patches!.push({ op: 'set', path: ['currentEventDetails'], value: resultData.currentEventDetails });
      }
      // Note: addBlockedWord/removeBlockedWord do not generate patches if they don't modify Zero state directly

    } catch (error: any) {
      console.error(`PUSH_ENDPOINT_ERROR: Mutation "${name}", ID "${mutationID}" FAILED.`);
      console.error("Error Object:", error); // Log the whole error object
      console.error("Error Message:", error.message);
      console.error("Error Stack:", error.stack);
      console.error(`Zero Push: Error executing server mutator "${name}" (MutationID: ${mutationID}):`, error.message, error.stack);
      pushResponse.mutations.push({ id: mutationID, state: 'error', error: error.message || 'Mutation execution failed on server' });
      // No patch is generated for failed mutations
    }
  }

  // Return the constructed Push Response
  return NextResponse.json(pushResponse);
}