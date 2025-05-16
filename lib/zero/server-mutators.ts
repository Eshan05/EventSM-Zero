import type {
  CustomMutatorDefs as ServerCustomMutatorDefs,
  ServerTransaction,
} from '@rocicorp/zero/pg';

import type { DrizzleTransactionExecutor } from './drizzle-adapter-pg';
import { type Schema, createMutators as createClientMutators, type ZeroAuthData, schema } from './config';

import { dbPg as db } from '@/db/config-pg';
import { messages as messagesTable, events as eventsTable, users as usersTable, blockedWords as blockedWordsTable } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

const redis = Redis.fromEnv();
let blockedWordsCache: string[] = [];

/**
 * Creates the map of SERVER-SIDE mutator functions.
 * These are executed by PushProcessor within a DB transaction.
 * The `tx` object is a `ServerTransaction<Schema, DrizzleTransactionExecutor>`.
 */
export function createServerMutators(
  authData: ZeroAuthData, // Auth data from decoded JWT
  asyncTasks: Array<() => Promise<void>> = [] // For out-of-transaction work
) {
  const clientMutators = createClientMutators(authData);
  type AppServerTx = ServerTransaction<Schema, DrizzleTransactionExecutor>;

  return {
    // You can spread clientMutators if you want their ZQL-based DB logic to run on server
    // ...clientMutators, // This would run client mutator logic using ServerTransaction's ZQL capabilities

    // --- Override or Define Server-Specific Mutators ---

    addMessage: async (tx: AppServerTx, args: { text: string; replyToId?: string | null; eventId?: string; }) => {
      // `tx.location` will be 'server'
      const userId = authData.sub;
      // Server-side validation
      if (!userId) throw new Error('Authentication required.');

      let eventIdToUse = args.eventId;
      if (!eventIdToUse) {
        // Use ServerTransaction's ZQL query mapped to DB
        const eventResult = await tx.query.events.where('isActive', true).one();
        if (!eventIdToUse || eventIdToUse === null) throw new Error('No active chat event found.');
        eventIdToUse = eventResult!.id!;
      }
      if (!eventIdToUse) throw new Error('No active chat event or eventId not provided.');
      if (!args.text?.trim()) throw new Error('Message text cannot be empty.');
      const cleanedText = args.text.trim();

      // Rate Limiting (Server-Side)
      const userRatelimit = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "2s"), prefix: `chat_user_msg_rl_${userId}` });
      const { success: userSuccess } = await userRatelimit.limit(`add_msg_${eventIdToUse}`);
      if (!userSuccess) throw new Error('You are sending messages too quickly.');
      // ... global rate limit ...

      // Word Blocking - use tx.dbTransaction.wrappedTransaction for direct Drizzle query if needed
      // Or if blockedWords are in Zero schema, use tx.query.blockedWords
      // For now, using pre-loaded cache:
      // if (blockedWordsCache.some(bw => cleanedText.toLowerCase().includes(bw))) {
      //   throw new Error('Your message contains blocked words.');
      // }

      const messageId = crypto.randomUUID();
      const serverTimestamp = Date.now();

      // Use tx.mutate for ZQL-driven DB write (PushProcessor handles patch gen)
      await tx.mutate.messages.insert({
        id: messageId,
        userId: userId,
        eventId: eventIdToUse,
        text: cleanedText,
        replyToMessageId: args.replyToId || null,
        isDeleted: false,
        createdAt: serverTimestamp,
        deletedAt: null, // Provide defaults for all fields in Zero 'messages' schema
        deletedByUserId: null,
      } as any);

      console.log("Server Mutator (PushProcessor): addMessage successful for ID", messageId);
      // No need to return patch data, PushProcessor generates patches from DB changes observed by ZQLDatabase
    },

    deleteMessage: async (tx: AppServerTx, args: { messageId: string }) => {
      if (authData.role !== 'admin') throw new Error('Unauthorized.');
      if (!args.messageId) throw new Error('Message ID required.');

      const deleteTimestamp = Date.now();

      // Optional: Check if message exists using ZQL read first
      const existing = await tx.query.messages.where('id', args.messageId).one();
      if (!existing) throw new Error("Message not found to delete.");
      if (existing.isDeleted) throw new Error("Message already deleted.");


      await tx.mutate.messages.update({
        id: args.messageId,
        isDeleted: true,
        deletedAt: deleteTimestamp,
        deletedByUserId: authData.sub,
      } as any);
      console.log("Server Mutator (PushProcessor): deleteMessage successful for ID", args.messageId);
    },

    clearChat: async (tx: AppServerTx, args: { newEventName?: string }) => {
      if (authData.role !== 'admin') throw new Error('Unauthorized.');

      // Use Drizzle directly for complex multi-table updates if easier
      // `tx.dbTransaction.wrappedTransaction` is your DrizzleTransactionExecutor
      const drizzleTx = tx.dbTransaction.wrappedTransaction;

      await drizzleTx.update(eventsTable)
        .set({ isActive: false })
        .where(eq(eventsTable.isActive, true));

      const newEventName = args.newEventName || `Chat Session ${new Date().toLocaleString()}`;
      const newEventResult = await drizzleTx.insert(eventsTable).values({
        id: crypto.randomUUID(), // Drizzle needs ID unless DB generates it and you return it
        name: newEventName,
        isActive: true,
      }).returning({ id: eventsTable.id, name: eventsTable.name });

      const newEvent = newEventResult[0];
      if (!newEvent?.id) throw new Error("Failed to create new event.");

      // To update Zero state's `currentEventDetails` (if it's not a table):
      // This is the tricky part with PushProcessor if currentEventDetails is not a DB table
      // that ZQLDatabase observes. PushProcessor primarily generates patches from DB table changes.
      // If `currentEventDetails` is a simple key-value in Zero schema, you might need
      // to have a small table in your DB that represents this global state, and update it.
      // For example, a `global_settings` table with `key='currentEventId'` and `value=newEvent.id`.
      // Then `tx.mutate.global_settings.update(...)` would trigger a patch.
      // OR, the client just re-queries active events from the `events` table after seeing it change.
      console.log("Server Mutator (PushProcessor): clearChat processed. New event:", newEvent.id);
      // For now, assume clients refetch or observe `events` table for active event.
    },

    // ... addBlockedWord, removeBlockedWord using tx.mutate or tx.dbTransaction.wrappedTransaction ...

  } as const satisfies ServerCustomMutatorDefs<ServerTransaction<Schema, DrizzleTransactionExecutor>>;
}