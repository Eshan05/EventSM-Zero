import type {
  CustomMutatorDefs as ServerCustomMutatorDefs,
  ServerTransaction,
} from '@rocicorp/zero/pg';

import { events as eventsTable } from '@/db/schema';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { eq } from 'drizzle-orm';
import { type Schema, type ZeroAuthData, createMutators as createClientMutators } from './config';
import type { DrizzleTransactionExecutor } from './drizzle-adapter-pg';

const redis = Redis.fromEnv();
const blockedWordsCache: string[] = [];

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
    // ...clientMutators, // This would run client mutator logic using ServerTransaction's ZQL capabilities
    addMessage: async (tx: AppServerTx, args: { text: string; replyToId?: string | null; eventId?: string; }) => {
      // `tx.location` will be 'server'
      const userId = authData.sub;
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
      // TODO: Make this set-able by the admin in the chat interface
      // const globalRatelimit = new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(1, "3s"), prefix: `chat_global_msg_rl` });
      // const { success: globalSuccess } = await globalRatelimit.limit(`add_message_${eventIdToUse}`);
      // if (!globalSuccess) throw new Error('Chat is in slow mode. Please wait.');

      // if (blockedWordsCache.some(bw => cleanedText.toLowerCase().includes(bw))) {
      //   throw new Error('Your message contains blocked words.');
      // }

      const messageId = crypto.randomUUID();
      const serverTimestamp = Date.now();

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
      });

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
      });
      console.log("Server Mutator (PushProcessor): deleteMessage successful for ID", args.messageId);
    },

    clearChat: async (tx: AppServerTx, args: { newEventName?: string }) => {
      if (authData.role !== 'admin') throw new Error('Unauthorized.');

      const drizzleTx = tx.dbTransaction.wrappedTransaction;

      await drizzleTx.update(eventsTable)
        .set({ isActive: false })
        .where(eq(eventsTable.isActive, true));

      const newEventName = args.newEventName || `Chat Session ${new Date().toLocaleString()}`;
      const newEventResult = await drizzleTx.insert(eventsTable).values({
        id: crypto.randomUUID(),
        name: newEventName,
        codeName: `event-${Date.now()}`,
        description: `Event created at ${new Date().toISOString()}`,
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
  } as const satisfies ServerCustomMutatorDefs<ServerTransaction<Schema, DrizzleTransactionExecutor>>;
}