import type {
  CustomMutatorDefs as ServerCustomMutatorDefs,
  ServerTransaction,
} from '@rocicorp/zero/pg';

import {
  blockedWords as blockedWordsTable,
  events as eventsTable,
  eventParticipants as eventParticipantsTable,
  eventParticipants,
  messages as messagesTable,
  users as usersTable,
} from '@/db/schema';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { and, desc, eq } from 'drizzle-orm';
import { type Schema, type ZeroAuthData, createMutators as createClientMutators } from './config';
import type { DrizzleTransactionExecutor } from './drizzle-adapter-pg';

const redis = Redis.fromEnv();

const chatUserGlobalRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '2s'),
  prefix: 'chat_user_global_msg_rl',
});

const chatUserEventRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '2s'),
  prefix: 'chat_user_msg_rl',
});

const chatEventGlobalRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '2s'),
  prefix: 'chat_global_msg_rl',
});

const BLOCKED_WORDS_CACHE_KEY = 'blocked_words:v1';

function normalizeForBlockedPhraseMatch(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function messageContainsBlockedWord(message: string, blockedWords: readonly string[]): boolean {
  if (blockedWords.length === 0) return false;

  const normalized = normalizeForBlockedPhraseMatch(message);
  if (!normalized) return false;

  const tokens = new Set(normalized.split(' '));
  for (const raw of blockedWords) {
    const bw = normalizeForBlockedPhraseMatch(raw);
    if (!bw) continue;
    if (bw.includes(' ')) {
      if (normalized.includes(bw)) return true;
    } else {
      if (tokens.has(bw)) return true;
    }
  }
  return false;
}

async function getBlockedWordsCached(drizzleTx: DrizzleTransactionExecutor): Promise<string[]> {
  const cached = await redis.get<string[] | string | null>(BLOCKED_WORDS_CACHE_KEY);
  if (Array.isArray(cached)) return cached;
  if (typeof cached === 'string') {
    try {
      const parsed = JSON.parse(cached) as unknown;
      if (Array.isArray(parsed)) return parsed.filter((w): w is string => typeof w === 'string');
    } catch {
      // ignore
    }
  }

  const rows = await drizzleTx.query.blockedWords.findMany({
    columns: { word: true },
  });
  const words = rows.map(r => r.word).filter((w): w is string => typeof w === 'string');
  await redis.set(BLOCKED_WORDS_CACHE_KEY, words, { ex: 60 });
  return words;
}

/**
 * Creates the map of SERVER-SIDE mutator functions.
 * These are executed by PushProcessor within a DB transaction.
 * The `tx` object is a `ServerTransaction<Schema, DrizzleTransactionExecutor>`.
 */
export function createServerMutators(
  authData: ZeroAuthData, // Auth data from decoded JWT
  asyncTasks: Array<() => Promise<void>> = [] // For out-of-transaction work
) {
  void createClientMutators(authData);
  type AppServerTx = ServerTransaction<Schema, DrizzleTransactionExecutor>;

  return {
    // ...clientMutators, // This would run client mutator logic using ServerTransaction's ZQL capabilities
    addMessage: async (tx: AppServerTx, args: { text: string; replyToId?: string | null; eventId?: string; }) => {
      // `tx.location` will be 'server'
      const userId = authData.sub;
      if (!userId) throw new Error('Authentication required.');

      const drizzleTx = tx.dbTransaction.wrappedTransaction;

      let eventIdToUse = args.eventId;
      if (!eventIdToUse) {
        const eventResult = await drizzleTx.query.events.findFirst({
          where: eq(eventsTable.isActive, true),
          columns: { id: true },
        });
        if (!eventResult?.id) throw new Error('No active chat event found.');
        eventIdToUse = eventResult.id;
      }
      if (!eventIdToUse) throw new Error('No active chat event or eventId not provided.');

      if (authData.role !== 'admin') {
        const event = await drizzleTx.query.events.findFirst({
          where: eq(eventsTable.id, eventIdToUse),
          columns: { slowModeSeconds: true },
        });
        const participationResult = await drizzleTx.query.eventParticipants.findFirst({
          where: and(
            eq(eventParticipantsTable.userId, authData.sub),
            eq(eventParticipantsTable.eventId, eventIdToUse)
          ),
          columns: { customCooldownSeconds: true },
        });

        const eventCooldown = event?.slowModeSeconds ?? 0;
        const userCooldown = participationResult?.customCooldownSeconds ?? -1; // Use -1 to distinguish from a 0s override
        const effectiveCooldown = userCooldown >= 0 ? userCooldown : eventCooldown;

        if (effectiveCooldown > 0) {
          const lastMessage = await drizzleTx.query.messages.findFirst({
            where: and(
              eq(messagesTable.userId, authData.sub),
              eq(messagesTable.eventId, eventIdToUse)
            ),
            columns: { createdAt: true },
            orderBy: [desc(messagesTable.createdAt)],
          });

          if (lastMessage) {
            const timeSinceLastMessage = Date.now() - lastMessage.createdAt.getTime();
            const requiredWaitTime = effectiveCooldown * 1000;

            if (timeSinceLastMessage < requiredWaitTime) {
              const remainingSeconds = Math.ceil((requiredWaitTime - timeSinceLastMessage) / 1000);
              throw new Error(`Slow mode is active. Please wait ${remainingSeconds}s.`);
            }
          }
        }
      }

      const participation = await drizzleTx.query.eventParticipants.findFirst({
        where: and(
          eq(eventParticipantsTable.userId, userId),
          eq(eventParticipantsTable.eventId, eventIdToUse)
        ),
        columns: {
          isBanned: true,
          mutedUntil: true,
        },
      });

      if (participation) {
        if (participation.isBanned) {
          throw new Error('You are banned from this event.');
        }
        if (participation.mutedUntil && participation.mutedUntil.getTime() > Date.now()) {
          const remainingSeconds = Math.ceil((participation.mutedUntil.getTime() - Date.now()) / 1000);
          throw new Error(`You are muted in this event for another ${remainingSeconds} seconds.`);
        }
      }

      if (!args.text?.trim()) throw new Error('Message text cannot be empty.');
      const cleanedText = args.text.trim();

      if (args.replyToId) {
        const parentMessage = await drizzleTx.query.messages.findFirst({
          where: eq(messagesTable.id, args.replyToId),
          columns: { eventId: true, isDeleted: true },
        });
        if (!parentMessage) throw new Error('Cannot reply: parent message not found.');
        if (parentMessage.eventId !== eventIdToUse) throw new Error('Cannot reply across events.');
        if (parentMessage.isDeleted) throw new Error('Cannot reply to a deleted message.');
      }

      // Rate Limiting (Server-Side)
      const { success: appUserSuccess } = await chatUserGlobalRatelimit.limit(`user:${userId}`);
      if (!appUserSuccess) throw new Error('You are sending messages too quickly.');

      const { success: userSuccess } = await chatUserEventRatelimit.limit(`${userId}:${eventIdToUse}`);
      if (!userSuccess) throw new Error('You are sending messages too quickly.');

      const { success: globalSuccess } = await chatEventGlobalRatelimit.limit(`event:${eventIdToUse}`);
      if (!globalSuccess) throw new Error('Chat is busy. Please try again in a moment.');

      if (authData.role !== 'admin') {
        const blockedWords = await getBlockedWordsCached(drizzleTx);
        if (messageContainsBlockedWord(cleanedText, blockedWords)) {
          throw new Error('Your message contains blocked words.');
        }
      }

      const now = new Date();
      await tx.dbTransaction.wrappedTransaction
        .insert(eventParticipantsTable)
        .values({
          userId: userId,
          eventId: eventIdToUse,
          lastSeenAt: now,
        })
        .onConflictDoUpdate({
          target: [eventParticipantsTable.userId, eventParticipantsTable.eventId],
          set: {
            lastSeenAt: now,
          },
        });

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

      const drizzleTx = tx.dbTransaction.wrappedTransaction;

      const deleteTimestamp = Date.now();

      // Optional: Check if message exists using ZQL read first
      const existing = await drizzleTx.query.messages.findFirst({
        where: eq(messagesTable.id, args.messageId),
        columns: { isDeleted: true },
      });
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

    muteUser: async (tx: AppServerTx, args: { userId: string; eventId: string; durationInSeconds: number }) => {
      if (authData.role !== 'admin') throw new Error('Unauthorized.');
      // ... (argument validation)

      const drizzleTx = tx.dbTransaction.wrappedTransaction;

      const targetUser = await drizzleTx.query.users.findFirst({
        where: eq(usersTable.id, args.userId),
        columns: { role: true },
      });
      if (!targetUser || targetUser.role === 'admin') throw new Error('Cannot mute this user.');

      const muteUntilDate = new Date(Date.now() + args.durationInSeconds * 1000);

      // Upsert into the eventParticipants table to set the mute status.
      await tx.dbTransaction.wrappedTransaction
        .insert(eventParticipants)
        .values({
          userId: args.userId,
          eventId: args.eventId,
          mutedUntil: muteUntilDate,
          mutedByUserId: authData.sub,
        })
        .onConflictDoUpdate({
          target: [eventParticipantsTable.userId, eventParticipantsTable.eventId],
          set: {
            mutedUntil: muteUntilDate,
            mutedByUserId: authData.sub,
          },
        });

      console.log(`Server Mutator: User ${args.userId} in event ${args.eventId} muted.`);
    },

    unmuteUser: async (tx: AppServerTx, args: { userId: string; eventId: string; }) => {
      if (authData.role !== 'admin') throw new Error('Unauthorized.');
      if (!args.userId || !args.eventId) throw new Error('User ID and Event ID are required.');

      await tx.dbTransaction.wrappedTransaction
        .update(eventParticipantsTable)
        .set({
          mutedUntil: null,
          mutedByUserId: null,
        })
        .where(
          and(
            eq(eventParticipantsTable.userId, args.userId),
            eq(eventParticipantsTable.eventId, args.eventId)
          )
        );
      console.log(`Server Mutator: User ${args.userId} UNMUTED from event ${args.eventId}.`);
    },

    banUser: async (tx: AppServerTx, args: { userId: string; eventId: string; }) => {
      if (authData.role !== 'admin') throw new Error('Unauthorized.');
      if (!args.userId || !args.eventId) throw new Error('User ID and Event ID are required.');

      const drizzleTx = tx.dbTransaction.wrappedTransaction;

      const targetUser = await drizzleTx.query.users.findFirst({
        where: eq(usersTable.id, args.userId),
        columns: { role: true },
      });
      if (!targetUser || targetUser.role === 'admin') throw new Error('Cannot ban this user.');

      await tx.dbTransaction.wrappedTransaction
        .insert(eventParticipants)
        .values({
          userId: args.userId,
          eventId: args.eventId,
          isBanned: true,
          bannedByUserId: authData.sub,
          bannedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [eventParticipants.userId, eventParticipants.eventId],
          set: {
            isBanned: true,
            bannedByUserId: authData.sub,
            bannedAt: new Date(),
          },
        });
      console.log(`Server Mutator: User ${args.userId} BANNED from event ${args.eventId}.`);
    },

    unbanUser: async (tx: AppServerTx, args: { userId: string; eventId: string; }) => {
      if (authData.role !== 'admin') throw new Error('Unauthorized.');
      if (!args.userId || !args.eventId) throw new Error('User ID and Event ID are required.');

      await tx.dbTransaction.wrappedTransaction
        .update(eventParticipantsTable)
        .set({
          isBanned: false,
          bannedByUserId: null,
          bannedAt: null,
        })
        .where(
          and(
            eq(eventParticipantsTable.userId, args.userId),
            eq(eventParticipantsTable.eventId, args.eventId)
          )
        );
      console.log(`Server Mutator: User ${args.userId} UNBANNED from event ${args.eventId}.`);
    },

    setEventSlowMode: async (tx: AppServerTx, args: { eventId: string; seconds: number }) => {
      if (authData.role !== 'admin') throw new Error('Unauthorized.');
      if (typeof args.seconds !== 'number' || args.seconds < 0) throw new Error('Invalid duration.');

      await tx.mutate.events.update({
        id: args.eventId,
        slowModeSeconds: args.seconds,
      });
      console.log(`Server: Event ${args.eventId} slow mode set to ${args.seconds}s.`);
    },

    setUserSlowMode: async (tx: AppServerTx, args: { eventId: string; userId: string; seconds: number | null }) => {
      if (authData.role !== 'admin') throw new Error('Unauthorized.');
      if (typeof args.seconds !== 'number' && args.seconds !== null) throw new Error('Invalid duration.');

      await tx.dbTransaction.wrappedTransaction
        .insert(eventParticipants)
        .values({
          userId: args.userId,
          eventId: args.eventId,
          customCooldownSeconds: args.seconds,
        })
        .onConflictDoUpdate({
          target: [eventParticipants.userId, eventParticipants.eventId],
          set: { customCooldownSeconds: args.seconds },
        });
      console.log(`Server: User ${args.userId} in event ${args.eventId} custom cooldown set to ${args.seconds}s.`);
    },

  } as const satisfies ServerCustomMutatorDefs<ServerTransaction<Schema, DrizzleTransactionExecutor>>;
}