import {
  definePermissions,
  type CustomMutatorDefs,
  type Transaction,
  ANYONE_CAN_DO_ANYTHING,
  PermissionsConfig,
  ANYONE_CAN
} from '@rocicorp/zero';

import { schema as generatedZeroSchemaFileContent } from '@/zero-schema.gen';
export const schema = generatedZeroSchemaFileContent;
export type Schema = typeof schema;


export interface ZeroAuthData {
  sub: string;    // User ID (subject claim from JWT)
  role: string;   // User role (e.g., 'admin', 'user')
  username: string; // Username from JWT (ensure it's included)
  // Removed displayName as your drizzle-zero config for users doesn't use 'name'
}

// --- Client-Side Mutator Definitions ---
export function createMutators(authData?: ZeroAuthData) {
  const generateId = () => crypto.randomUUID();

  return {
    /**
     * Optimistically adds a message to the client's Zero state.
     * Client will use message.userId to look up username from Zero's 'users' table/map.
     */
    addMessage: async (tx: Transaction<Schema>, args: { text?: string; replyToId?: string; eventId: string; }) => {
      if (!authData?.sub) { return; }
      if (!args.eventId) { return; }
      if (!args.text || args.text.trim() === "") { return; }

      const messageId = generateId();
      const clientTimestamp = Date.now();

      // Data for optimistic insertion into the 'messages' table in Zero state.
      // Fields must match what's defined in your `drizzle-zero.config.ts` for 'messages'
      // and thus in `schema.gen.ts`.
      const optimisticMessageData = {
        id: messageId,
        userId: authData.sub, // Essential for linking to the user
        eventId: args.eventId,
        text: args.text.trim() || "",
        replyToMessageId: args.replyToId || null,
        isDeleted: false,
        createdAt: clientTimestamp, // Number timestamp for Zero
        // NO `usernameDisplay` here, assuming client looks up `users` table by `userId`
        // The server-side mutator *will* handle the DB insert correctly.
        // The Zero patch from the server will then provide the authoritative state.
      };

      // Optimistically insert using the Zero client transaction's mutate API
      // The 'messages' key here must match the table name in your Zero schema (from drizzle-zero)
      await tx.mutate.messages.insert(optimisticMessageData as any); // Cast if needed
      console.log("Client: Optimistically added message", messageId);
    },

    deleteMessage: async (tx: Transaction<Schema>, args: { messageId: string }) => {
      if (!authData?.sub) return;
      if (!args.messageId) return;

      await tx.mutate.messages.update({
        id: args.messageId,
        isDeleted: true,
        // If you added deletedAt and deletedByUserId to your Zero schema for messages:
        // deletedAt: Date.now(), // Optimistic deletion timestamp
        // deletedByUserId: authData.sub, // Optimistic deletion user
      } as any); // Cast if needed
      console.log("Client: Optimistically marked message as deleted", args.messageId);
    },

    clearChat: async (tx: Transaction<Schema>, args: { newEventName?: string }) => {
      if (!authData?.sub) return;
      console.log(`Client: Sending 'clearChat' request. New name: ${args.newEventName || '(default)'}`);
      // Client-side effect is minimal; server drives the state change via 'currentEventDetails' patch.
    },

    addBlockedWord: async (tx: Transaction<Schema>, args: { word: string }) => {
      if (!authData?.sub) return;
      if (!args.word || args.word.trim() === "") return;
      console.log(`Client: Sending 'addBlockedWord' request for: ${args.word}`);
      // No client-side Zero state update here as 'blockedWords' is false in drizzle-zero.config.ts
    },

    removeBlockedWord: async (tx: Transaction<Schema>, args: { word: string }) => {
      if (!authData?.sub) return;
      if (!args.word || args.word.trim() === "") return;
      console.log(`Client: Sending 'removeBlockedWord' request for: ${args.word}`);
      // No client-side Zero state update
    },

  } as const satisfies CustomMutatorDefs<Schema>; // Ensure types match
}


export const permissions = definePermissions<CustomMutatorDefs<Schema>, Schema>(schema, () => {
  return {
    // ANYONE_CAN for now
    addMessage: {
      row: {
        select: ANYONE_CAN
      }
    },
    deleteMessage: {
      row: {
        select: ANYONE_CAN
      }
    },
    clearChat: {
      row: {
        select: ANYONE_CAN
      }
    },
    addBlockedWord: {
      row: {
        select: ANYONE_CAN
      }
    },
    removeBlockedWord: {
      row: {
        select: ANYONE_CAN
      }
    },
  } as PermissionsConfig<CustomMutatorDefs<Schema>, Schema>;
});