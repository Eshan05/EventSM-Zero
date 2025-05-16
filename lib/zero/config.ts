import {
  type CustomMutatorDefs,
  type Transaction,
} from '@rocicorp/zero';

import { schema as generatedZeroSchemaFileContent } from '@/zero-schema.gen';
export const schema = generatedZeroSchemaFileContent.default;
export type Schema = typeof schema;


export interface ZeroAuthData {
  sub: string;
  role: string;
  username?: string;
  displayName?: string;
}

/**
 * Creates the map of mutator functions.
 * This function will be called client-side (with decoded JWT)
 * and server-side (with decoded JWT from push request).
 * The `tx` object will be different (client vs server transaction).
 */
export function createMutators(authData?: ZeroAuthData) {
  return {
    // Your mutator definitions here...
    // The `tx` parameter should be typed as `Transaction<Schema>` for client-side context
    // and will be a `ServerTransaction<Schema, RawDrizzleTx>` in the server context (handled by PushProcessor).
    // The `CustomMutatorDefs<S>` type expects `S` to be the SCHEMA type, not the TRANSACTION type.

    addMessage: async (tx: Transaction<Schema>, args: { text: string; replyToId?: string; eventId: string; }) => {
      // Basic client-side validation (server validation is authoritative)
      if (!authData?.sub) throw new Error('Authentication required.');
      if (!args.eventId) throw new Error('Event ID missing.');
      if (!args.text || args.text.trim() === "") throw new Error('Message text cannot be empty.');

      // Generate a temporary ID for the client-side message
      const messageId = crypto.randomUUID(); // or nanoid();
      const clientTimestamp = Date.now(); // Use client time for optimistic display

      // Optimistically add the message to the Zero state
      // Note: Fields should match your *generated* schema.
      const messageDataForZero = {
        id: messageId,
        userId: authData.sub,
        // Ensure these match column names from your Drizzle schema included in drizzle-zero.config.ts
        eventId: args.eventId,
        text: args.text.trim(),
        replyToMessageId: args.replyToId || null,
        isDeleted: false, // Optimistically assume not deleted
        createdAt: clientTimestamp, // Optimistic timestamp (number)
        // Fields like usernameDisplay, role from users table are likely *relationships* in Zero,
        // or denormalized fields you added manually to drizzle-zero.config.ts for the message table.
        // If 'usernameDisplay' is NOT a column in your messages table, you can't tx.mutate.messages.insert it.
        // You'd query the user via relationship or have a denormalized field in your Zero message schema.
        // Let's assume usernameDisplay *is* added as a denormalized field in drizzle-zero.config.ts for 'messages'.
        usernameDisplay: authData.displayName || authData.username || 'User', // Added assuming denormalized field
      };

      // Use tx.mutate.insert for table data that has a primary key ('messages')
      // The type should be inferred correctly now if schema is right.
      // Remove the `as any` cast if types are correct.
      await tx.mutate.messages.insert(messageDataForZero);
    },

    deleteMessage: async (tx: Transaction<Schema>, args: { messageId: string }) => {
      if (!authData?.sub) throw new Error('Authentication required.');
      if (!args.messageId) throw new Error('Message ID is required.');

      // Update the message in Zero state
      await tx.mutate.messages.update({
        id: args.messageId,
        isDeleted: true,
        // tx.mutate.update only takes fields from the table itself
        // If you need to update related data optimistically, do it separately or use tx.set
      });
    },

    clearChat: async (tx: Transaction<Schema>, args: { newEventName?: string }) => {
      // As discussed, client mutator for clearChat is often just a signal.
      // The Zero state update (setting currentEventDetails) should come from the server patch.
      // So, the client mutator might just exist to allow `zero.mutate.clearChat()` call.
      // No state changes here typically for this complex server-driven action.
      if (!authData?.sub) throw new Error('Authentication required.');
      console.log('Client sending clearChat request...');
      // No tx.set/delete here for this action.
    },

    addBlockedWord: async (tx: Transaction<Schema>, args: { word: string }) => {
      if (!authData?.sub) throw new Error('Authentication required.');
      if (!args.word || args.word.trim() === "") throw new Error('Word cannot be empty.');
      console.log(`Client sending addBlockedWord request for: ${args.word}`);
      // No state changes here unless blocked words are part of client-sync'd Zero state.
    },

    removeBlockedWord: async (tx: Transaction<Schema>, args: { word: string }) => {
      if (!authData?.sub) throw new Error('Authentication required.');
      if (!args.word || args.word.trim() === "") throw new Error('Word cannot be empty.');
      console.log(`Client sending removeBlockedWord request for: ${args.word}`);
      // No state changes here unless blocked words are part of client-sync'd Zero state.
    },

    // Add other client mutators here
  } as const satisfies CustomMutatorDefs<Schema>; // **CORRECTION**: The type parameter is the SCHEMA itself, not Transaction<Schema>
}


// --- Server-Side Logic Placeholders (Loaded by `zero-cache` and used by `PushProcessor`) ---
// The *implementation* of the mutators with DB access, rate limits, etc.,
// will be conditionally executed when tx.location === 'server' OR you provide
// a separate set of server-mutators to PushProcessor that wrap the client ones.
// The standard pattern with PushProcessor is to pass the *same* createMutators function,
// and PushProcessor's ZQLDatabase/ServerTransaction makes `tx.mutate` and `tx.query`
// work against the PostgreSQL DB and provides `tx.location === 'server'`.

// Example of server-side implementation *within* the same mutator function using tx.location
/*
async addMessage: async (tx: Transaction<Schema>, args: { text: string; replyToId?: string; eventId: string; }) => {
    // ... (client-side optimistic update logic - runs when tx.location === 'client')

    if (tx.location === 'server') {
        // This code runs ONLY on the server, within the DB transaction.
        // `tx` here is narrowed to `ServerTransaction<Schema, RawDrizzleTx>`.
        // You can access the raw DB transaction via `tx.dbTransaction`.

        const userId = authData?.sub; // authData is passed to createMutators which is called by PushProcessor
        const userRole = authData?.role;

        // --- Server-side Validation & Logic ---
        if (!userId) throw new Error('Authentication required (server check).'); // Double-check auth
        // Get current event ID from DB - you need DB access here
        const currentEventId = await getCurrentActiveEventId(); // Assuming this func has DB access
        if (!currentEventId) throw new Error('No active chat event found (server check).');
        if (!args.text || args.text.trim() === "") throw new Error('Message text cannot be empty (server check).');
        const cleanedText = args.text.trim();

        // --- Rate Limiting (Upstash) ---
        // ... (Upstash Redis logic using your redis instance, access redis from outside mutator func or pass it in)
        // Example: Check user rate limit... if fails, throw new Error('Too fast!');

        // --- Word Blocking (Cache loaded from DB) ---
        // ... (Check against blockedWordsCache)
        // Example: if blocked, throw new Error('Blocked word!');

        // --- DB Persistence ---
        // Perform DB insert here using tx.dbTransaction (raw driver client) or your Drizzle adapter
        // This is the authoritative write.
        try {
            // Using Drizzle adapter's wrapped transaction:
             const drizzleTx = tx.dbTransaction; // Access the raw Drizzle transaction provided by adapter
             await drizzleTx.insert(...).values({
                // ... message data
                createdAt: new Date(Date.now()), // Server timestamp for DB
             });

            // OR if using tx.mutate against ZQLDatabase (via PushProcessor):
            // This is what PushProcessor enables - using the same tx.mutate.messages.insert call
            // that you used client-side, but it translates to a DB write server-side.
            // So you often *don't* need to duplicate the tx.mutate calls inside tx.location === 'server'.
            // The `await tx.mutate.messages.insert(messageDataForZero);` you wrote for the client
            // *also* runs on the server via ZQLDatabase when tx.location === 'server'.
            // What you put inside the `if (tx.location === 'server')` block is typically server-specific side effects
            // (sending email, calling external API) or validation that relies on up-to-date DB state or external services.

             console.log('Message persisted to DB on server.');

        } catch (dbError) {
             console.error("DB insert failed for new message on server:", dbError);
             // Throwing here automatically rolls back the DB transaction managed by PushProcessor
             throw new Error("Failed to save message.");
        }

        // Any code here runs after successful DB persistence
        // e.g., add async tasks: asyncTasks.push(() => sendNotification(...));
    }
}
*/

// This config file needs to export the schema and createMutators function.
// The server (via PushProcessor) and client (via new Zero) will import these.
// The actual logic inside mutators (using tx.location) or separate server-mutators
// depends on your preference for code structure. The simplest is `tx.location`.