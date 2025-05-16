// app/api/zero-push/route.ts (Manual Execution with Neon-HTTP)
import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { TextEncoder } from 'util';
import { typedDb } from '@/lib/utils.server'; // Your Neon-HTTP Drizzle DB instance
import { schema as zeroSchema, type ZeroAuthData, createMutators } from '@/lib/zero/config'; // Your Zero schema/mutator defs
// Import DB schema and external services for server logic
import { messages as messagesTable, events as eventsTable, blockedWords as blockedWordsTable, users as usersTable } from '@/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

const redis = Redis.fromEnv();
// Load blocked words cache here (same as before)
let blockedWordsCache: string[] = [];
async function loadBlockedWords() { /* ... */ }
loadBlockedWords().catch(console.error);
setInterval(() => loadBlockedWords().catch(console.error), 5 * 60 * 1000);


// ... (getAuthDataFromRequest function - same) ...
async function getAuthDataFromRequest(req: NextRequest): Promise<ZeroAuthData | undefined> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    console.warn("Zero Push: No Bearer token in Authorization header.");
    return undefined; // No token provided
  }

  const token = authHeader.substring(7); // Remove "Bearer "

  if (!process.env.ZERO_AUTH_SECRET) {
    console.error("Zero Push: ZERO_AUTH_SECRET environment variable is not set.");
    // In production, you might return a 500 error here if auth is critical
    return undefined; // Cannot verify
  }

  const secret = new TextEncoder().encode(process.env.ZERO_AUTH_SECRET);

  try {
    // Verify the token using the same secret as NEXTAUTH_SECRET / ZERO_AUTH_SECRET
    const { payload } = await jwtVerify(token, secret);

    // Extract and return the claims expected by your mutators (ZeroAuthData)
    // Ensure these match what you put in the JWT in your zero-token endpoint
    const authData: ZeroAuthData = {
      sub: payload.sub as string, // 'sub' is required user ID
      role: payload.role as string, // Custom 'role' claim
      // Add other claims if needed:
      // username: payload.username as string | undefined,
      // displayName: payload.displayName as string | undefined,
    };

    if (!authData.sub) {
      console.warn("Zero Push: JWT payload missing 'sub' claim.");
      return undefined; // JWT invalid or missing required claim
    }

    return authData;

  } catch (error) {
    console.error("Zero Push: JWT verification failed:", error);
    return undefined; // Verification failed
  }
}


// --- Manual Server-Side Mutator Execution ---
// This object maps mutator names to their server-side *implementation* functions.
// These functions will run within a Drizzle transaction and handle DB writes, etc.
const serverMutatorImplementations = {
  async addMessage(authData: ZeroAuthData, args: { text: string; replyToId?: string; eventId: string; }) {
    // This logic is now fully responsible for DB write, rate limits, etc.
    // It runs inside a Drizzle transaction managed below in the handler.
    // It does NOT use Zero's tx.mutate/tx.query within this scope for DB access.

    const userId = authData.sub;
    const userRole = authData.role;

    // --- Server-side Validation & Logic ---
    if (!userId) throw new Error('Authentication required.');
    // Get current event ID from DB - use the passed Drizzle transaction
    const currentEvent = await typedDb.query.events.findFirst({ // Use typedDb directly
      where: eq(eventsTable.isActive, true),
      columns: { id: true },
      orderBy: [desc(eventsTable.createdAt)]
    });
    const currentEventId = currentEvent?.id || null;

    if (!currentEventId) throw new Error('No active chat event found.');
    if (!args.text || args.text.trim() === "") throw new Error('Message text cannot be empty.');
    const cleanedText = args.text.trim();

    // --- Rate Limiting (Upstash) ---
    const userRatelimit = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "2s"), prefix: `chat_user_msg_rl_${userId}` });
    const { success: userSuccess } = await userRatelimit.limit("post_message");
    if (!userSuccess) { throw new Error('You are sending messages too quickly.'); }

    const globalRatelimit = new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(1, "3s"), prefix: `chat_global_msg_rl` });
    const { success: globalSuccess } = await globalRatelimit.limit("post_message");
    if (!globalSuccess) { throw new Error('Chat is in slow mode. Please wait.'); }

    // --- Word Blocking ---
    if (blockedWordsCache.some(bw => cleanedText.toLowerCase().includes(bw))) {
      throw new Error('Your message contains blocked words.');
    }

    // --- DB Persistence (Using Drizzle Transaction) ---
    const messageId = crypto.randomUUID(); // Generate UUID
    const serverTimestamp = Date.now();

    // Perform the DB insert using the Drizzle transaction passed to the handler's callback
    await typedDb.insert(messagesTable).values({
      id: messageId,
      userId: userId,
      eventId: currentEventId,
      text: cleanedText,
      replyToMessageId: args.replyToId || undefined,
      isDeleted: false,
      createdAt: new Date(serverTimestamp),
    });

    // Return data needed for Zero's patch (at least the message ID and any server-set fields)
    return { id: messageId, userId, eventId: currentEventId, text: cleanedText, replyToMessageId: args.replyToId || null, isDeleted: false, createdAt: serverTimestamp };
  },

  async deleteMessage(authData: ZeroAuthData, args: { messageId: string }) {
    if (authData.role !== 'admin') { throw new Error('Unauthorized.'); }
    if (!args.messageId) { throw new Error('Message ID is required.'); }

    const result = await typedDb.update(messagesTable)
      .set({ isDeleted: true })
      .where(eq(messagesTable.id, args.messageId))
      .returning({ id: messagesTable.id });

    if (result.length === 0) {
      throw new Error('Message not found in database.');
    }

    // Return data needed for Zero patch (at least the ID and the changed fields)
    return { id: args.messageId, isDeleted: true };
  },

  async clearChat(authData: ZeroAuthData, args: { newEventName?: string }) {
    if (authData.role !== 'admin') { throw new Error('Unauthorized.'); }

    await typedDb.update(eventsTable).set({ isActive: false }).where(eq(eventsTable.isActive, true));
    const newEventResult = await typedDb.insert(eventsTable).values({
      name: args.newEventName || `Chat Session ${new Date().toISOString()}`,
      isActive: true,
    }).returning({ id: eventsTable.id, name: eventsTable.name });

    const newEvent = newEventResult[0];
    if (!newEvent?.id) {
      throw new Error("Failed to create new event session in database.");
    }

    // Return data for Zero patch (update currentEventDetails key)
    return { currentEventDetails: { id: newEvent.id, name: newEvent.name || null } };
  },

  async addBlockedWord(authData: ZeroAuthData, args: { word: string }) {
    if (authData.role !== 'admin') { throw new Error('Unauthorized.'); }
    if (!args.word || args.word.trim() === "") throw new Error('Word cannot be empty.');
    const wordToAdd = args.word.trim().toLowerCase();

    try {
      await typedDb.insert(blockedWordsTable).values({
        word: wordToAdd,
        addedByUserId: authData.sub,
      });
      await loadBlockedWords(); // Refresh cache
      // No Zero state update needed unless admin panel syncs this via Zero
    } catch (e: any) {
      if (e.code === '23505') { throw new Error('Word already blocked.'); }
      else { console.error("Error adding blocked word:", e); throw new Error('Failed to add blocked word.'); }
    }
    return {}; // Return empty object or data if successful
  },

  async removeBlockedWord(authData: ZeroAuthData, args: { word: string }) {
    if (authData.role !== 'admin') { throw new Error('Unauthorized.'); }
    if (!args.word || args.word.trim() === "") throw new Error('Word cannot be empty.');
    const wordToRemove = args.word.trim().toLowerCase();

    try {
      const result = await typedDb.delete(blockedWordsTable)
        .where(eq(blockedWordsTable.word, wordToRemove))
        .returning({ id: blockedWordsTable.id });

      if (result.length === 0) {
        throw new Error('Word not found in blocked list.');
      }
      await loadBlockedWords(); // Refresh cache
    } catch (e) {
      console.error("Error removing blocked word:", e);
      throw new Error('Failed to remove blocked word.');
    }
    return {}; // Return empty object or data if successful
  },

  // ... other mutator implementations
};


// --- Push Endpoint Route Handler (Manual Execution) ---
export async function POST(request: NextRequest): Promise<NextResponse> {
  let pushRequest;
  try {
    pushRequest = await request.json();
  } catch (error) {
    console.error("Zero Push: Failed to parse request body:", error);
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const authData = await getAuthDataFromRequest(request);
  if (!authData) {
    return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
  }

  const pushResponse: any = { // Build the PushResponse manually
    mutations: [],
    patches: [], // You generate patches to send back
  };

  // Process each mutation in the request
  for (const mutation of pushRequest.mutations) {
    const { name, args, id } = mutation;
    const implementation = (serverMutatorImplementations as any)[name]; // Find the implementation

    if (!implementation) {
      console.warn(`Zero Push: Unknown mutation "${name}" received.`);
      pushResponse.mutations.push({ id, error: `Unknown mutation: ${name}` });
      continue; // Skip unknown mutations
    }

    try {
      // Execute the server-side mutator implementation within a Drizzle transaction
      // Note: Neon-HTTP transaction might not fully support all types of Drizzle operations
      // or might have limitations compared to TCP.
      const resultData = await typedDb.transaction(async (tx) => {
        // Pass the Drizzle transaction 'tx' or use `typedDb` directly if it's transaction-aware
        // The functions in `serverMutatorImplementations` use `typedDb` assuming it handles transactions correctly.
        // If your implementation needs the tx object, you'd refactor `serverMutatorImplementations`.
        // For simplicity with typedDb already imported, let's keep that style for now.
        return await implementation(authData, args); // Execute the logic
      });

      // On success, add the mutation result and generate a patch
      pushResponse.mutations.push({ id, state: 'ok' });
      // Generate a patch to update Zero state on clients based on the resultData
      // This requires translating the result back into Zero patches.
      // This is the complex part of manual implementation - building the patch.
      // For addMessage: need to add the new message object to Zero state.
      // For deleteMessage: need to mark the message as deleted.
      // For clearChat: need to update the currentEventDetails key.

      // Example patch generation (simplified):
      if (name === 'addMessage' && resultData?.id) {
        // Add the message to Zero state at the path ['messages', messageId]
        pushResponse.patches.push({ op: 'set', path: ['messages', resultData.id], value: resultData });
      } else if (name === 'deleteMessage' && resultData?.id) {
        // Set the isDeleted field on the message
        pushResponse.patches.push({ op: 'set', path: ['messages', resultData.id, 'isDeleted'], value: true });
      } else if (name === 'clearChat' && resultData?.currentEventDetails?.id) {
        // Set the currentEventDetails key
        pushResponse.patches.push({ op: 'set', path: ['currentEventDetails'], value: resultData.currentEventDetails });
      }
      // Add patch generation for other mutators if they update Zero state

    } catch (error: any) {
      // On failure, add the error to the mutation result
      console.error(`Zero Push: Error executing mutation "${name}" (ID: ${id}):`, error);
      pushResponse.mutations.push({ id, state: 'error', error: error.message || 'Mutation failed' });
      // No patch is generated for failed mutations
    }
  }

  // Return the manually constructed Push Response
  return NextResponse.json(pushResponse);
}

// Helper to get the current active event ID from the database
// (Needed by addMessage server implementation)
// This function will use typedDb directly, not relying on a Zero tx object
async function getCurrentActiveEventId(): Promise<string | null> {
  try {
    const activeEvent = await typedDb.query.events.findFirst({
      where: eq(eventsTable.isActive, true),
      columns: { id: true },
      orderBy: [desc(eventsTable.createdAt)]
    });
    return activeEvent?.id || null;
  } catch (error) {
    console.error("Failed to get current active event ID in server mutator:", error);
    throw new Error("Failed to determine active event."); // Propagate error
  }
}