import {
  definePermissions,
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
export function createMutators(authData?: ZeroAuthData): CustomMutatorDefs<Schema> {
  return {
    // Your mutator definitions here...
    // The `tx` parameter should be typed as `Transaction<Schema>` for client-side context
    // and will be a `ServerTransaction<Schema, RawDrizzleTx>` in the server context (handled by PushProcessor).
    // The `CustomMutatorDefs<S>` type expects `S` to be the SCHEMA type, not the TRANSACTION type.

    addMessage: async (tx, args: { text: string; replyToId?: string; eventId: string; }) => {
      if (!authData?.sub) throw new Error('Authentication required.');
      if (!args.eventId) throw new Error('Event ID missing.');
      if (!args.text || args.text.trim() === "") throw new Error('Message text cannot be empty.');
      const messageId = crypto.randomUUID();
      const clientTimestamp = Date.now();

      const messageDataForZero = {
        id: messageId,
        userId: authData.sub,
        eventId: args.eventId,
        text: args.text.trim(),
        replyToMessageId: args.replyToId || null,
        isDeleted: false,
        createdAt: clientTimestamp,
        usernameDisplay: authData.displayName || authData.username || 'User',
      };

      await tx.mutate.messages.insert(messageDataForZero);
    },

    deleteMessage: async (tx, args: { messageId: string }) => {
      if (!authData?.sub) throw new Error('Authentication required.');
      if (!args.messageId) throw new Error('Message ID is required.');

      await tx.mutate.messages.update({
        id: args.messageId,
        isDeleted: true,
      });
    },

    clearChat: async (tx, args: { newEventName?: string }) => {
      if (!authData?.sub) throw new Error('Authentication required.');
      console.log('Client sending clearChat request...');
    },

    addBlockedWord: async (tx, args: { word: string }) => {
      if (!authData?.sub) throw new Error('Authentication required.');
      if (!args.word || args.word.trim() === "") throw new Error('Word cannot be empty.');
      console.log(`Client sending addBlockedWord request for: ${args.word}`);
    },

    removeBlockedWord: async (tx, args: { word: string }) => {
      if (!authData?.sub) throw new Error('Authentication required.');
      if (!args.word || args.word.trim() === "") throw new Error('Word cannot be empty.');
      console.log(`Client sending removeBlockedWord request for: ${args.word}`);
    },

  } as const satisfies CustomMutatorDefs<Schema>;
}


export const permissions = definePermissions<CustomMutatorDefs<Schema>, Schema>(schema, () => {
  return {};
});