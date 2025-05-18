import {
  definePermissions,
  type CustomMutatorDefs,
  type Transaction,
  ANYONE_CAN_DO_ANYTHING, // For broader access if needed
  ANYONE_CAN,             // For allowing anyone (typically authenticated)
  type PermissionsConfig, // Explicit type for clarity
  type ExpressionBuilder, // For building permission expressions
} from '@rocicorp/zero';

import { schema as generatedZeroSchemaFileContent } from '@/zero-schema.gen';
export const schema = generatedZeroSchemaFileContent;
export type Schema = typeof schema;


export interface ZeroAuthData {
  sub: string;    // User ID 
  role: string;   // User role 
  username: string; // Username from JWT 
}

// --- Client-Side Mutator Definitions ---
export function createMutators(authData?: ZeroAuthData) {
  const generateId = () => crypto.randomUUID();

  return {
    addMessage: async (tx: Transaction<Schema>, args: { text?: string; replyToId?: string; eventId: string; }) => {
      if (!authData?.sub) {
        console.warn("Client Mutator: addMessage called without authData.sub. Optimistic update skipped.");
        return;
      }
      if (!args.eventId) {
        console.warn("Client Mutator: addMessage called without eventId. Optimistic update skipped.");
        return;
      }
      if (!args.text || args.text.trim() === "") {
        console.warn("Client Mutator: addMessage called with empty text. Optimistic update skipped.");
        return;
      }

      const messageId = generateId();
      const clientTimestamp = Date.now();

      const optimisticMessageData = {
        id: messageId,
        userId: authData.sub,
        eventId: args.eventId,
        text: args.text.trim(),
        replyToMessageId: args.replyToId || null,
        isDeleted: false,
        createdAt: clientTimestamp,
        deletedAt: null,
        deletedByUserId: null,
      };

      await tx.mutate.messages.insert(optimisticMessageData);
      console.log("Client: Optimistically added message", messageId, "by user", authData.sub);
    },

    deleteMessage: async (tx: Transaction<Schema>, args: { messageId: string }) => {
      if (!authData?.sub) {
        console.warn("Client Mutator: deleteMessage called without authData.sub. Optimistic update skipped.");
        return;
      }
      if (!args.messageId) {
        console.warn("Client Mutator: deleteMessage called without messageId. Optimistic update skipped.");
        return;
      }

      await tx.mutate.messages.update({
        id: args.messageId,
        isDeleted: true,
        deletedAt: Date.now(),
        deletedByUserId: authData.sub,
      });
      console.log("Client: Optimistically marked message as deleted", args.messageId);
    },

    clearChat: async (tx: Transaction<Schema>, args: { newEventName?: string }) => {
      if (!authData?.sub) return;
      console.log(`Client: Sending 'clearChat' request. New name: ${args.newEventName || '(default)'}`);
    },

    addBlockedWord: async (tx: Transaction<Schema>, args: { word: string }) => {
      if (!authData?.sub) return;
      if (!args.word || args.word.trim() === "") return;
      console.log(`Client: Sending 'addBlockedWord' request for: ${args.word}`);
    },

    removeBlockedWord: async (tx: Transaction<Schema>, args: { word: string }) => {
      if (!authData?.sub) return;
      if (!args.word || args.word.trim() === "") return;
      console.log(`Client: Sending 'removeBlockedWord' request for: ${args.word}`);
    },

    muteUser: async (tx: Transaction<Schema>, args: { userId: string, eventId: string, durationInSeconds: number }) => {
      if (!authData?.sub) return;
      console.log(`Client: Sending 'muteUser' request for user ${args.userId} in event ${args.eventId} for ${args.durationInSeconds}s.`);
    },
    unmuteUser: async (tx: Transaction<Schema>, args: { userId: string, eventId: string }) => {
      if (!authData?.sub) return;
      console.log(`Client: Sending 'unmuteUser' request for user ${args.userId} in event ${args.eventId}.`);
    },
    banUser: async (tx: Transaction<Schema>, args: { userId: string, eventId: string }) => {
      if (!authData?.sub) return;
      console.log(`Client: Sending 'banUser' request for user ${args.userId} in event ${args.eventId}.`);
    },
    unbanUser: async (tx: Transaction<Schema>, args: { userId: string, eventId: string }) => {
      if (!authData?.sub) return;
      console.log(`Client: Sending 'unbanUser' request for user ${args.userId} in event ${args.eventId}.`);
    },

  } as const satisfies CustomMutatorDefs<Schema>;
}

// --- Zero Permissions Definition ---
// The first generic argument should be your AuthData type, the second is your Schema type.
export const permissions = definePermissions<ZeroAuthData, Schema>(schema, () => {
  // Helper functions to be used by rules.
  // These helpers themselves don't receive 'auth' directly from Zero;
  // they are called by the rule functions which do.
  const isAuthenticated = (auth: ZeroAuthData | undefined): auth is ZeroAuthData => !!auth?.sub;
  const isAdmin = (auth?: ZeroAuthData) => isAuthenticated(auth) && auth.role === 'admin';

  // Rule: Allow if authenticated.
  // This function is a "rule" and will receive `auth` as its first argument from Zero.
  const allowIfAuthenticatedRule = (
    auth: ZeroAuthData | undefined,
    { cmp }: ExpressionBuilder<Schema, 'users' | 'events' | 'messages'> // 'any' if the table isn't fixed for this rule
  ) => {
    if (!isAuthenticated(auth)) return cmp('id', '=', '__NEVER_MATCH__'); // Deny if not authenticated
    // Allows access to any row if authenticated; specific filtering happens client-side or in query.
    // `id != null` is a common way to express "allow all rows that exist"
    return cmp('id', 'IS NOT', null);
  };

  // Rule: User can only insert messages as themselves.
  const allowInsertOwnMessageRule = (
    auth: ZeroAuthData | undefined,
    { cmp }: ExpressionBuilder<Schema, 'messages'> // Typed to 'messages' table
  ) => {
    if (!isAuthenticated(auth)) return cmp('id', '=', '__NEVER_MATCH__');
    return cmp('userId', auth.sub); // Ensure the message's userId matches the authenticated user's ID
  };

  // Rule: Admin can update any message, or user can update their own (for future edits/reactions)
  const allowUpdateOwnOrAdminRule = (
    auth: ZeroAuthData | undefined,
    { cmp, or }: ExpressionBuilder<Schema, 'messages'>
  ) => {
    if (!isAuthenticated(auth)) return cmp('id', '=', '__NEVER_MATCH__');
    if (isAdmin(auth)) return cmp('id', 'IS NOT', null); // Admin can update any existing message
    return cmp('userId', auth.sub); // User can only modify their own message
  };

  // Rule: For postMutation, usually simpler if preMutation was restrictive.
  // If complex logic is needed, it can be added here. For now, if preMutation passed, allow.
  const allowIfPreMutationPassedRule = (
    auth: ZeroAuthData | undefined,
    { cmp }: ExpressionBuilder<Schema, 'messages'>
  ) => {
    if (!isAuthenticated(auth)) return cmp('id', '=', '__NEVER_MATCH__');
    // Can add checks like ensuring userId wasn't changed if it's not allowed
    return cmp('id', 'IS NOT', null);
  };

  // Rule: Only admins can "hard" delete messages (if using Zero's generic delete mutator)
  const allowAdminToDeleteRule = (
    auth: ZeroAuthData | undefined,
    { cmp }: ExpressionBuilder<Schema, 'messages'>
  ) => {
    if (!isAdmin(auth)) return cmp('id', '=', '__NEVER_MATCH__');
    return cmp('id', 'IS NOT', null); // Admin can delete any existing message
  };

  return {
    users: {
      row: {
        select: [allowIfAuthenticatedRule],
        // Insert, update, delete for users are complex and usually not generic.
        // They'd be handled by specific server mutators and auth logic (e.g., registration, profile update).
        // For Zero's generic mutators, you'd likely restrict them heavily or not define them.
      },
    },
    events: {
      row: {
        select: [allowIfAuthenticatedRule],
        // Events are likely admin-managed.
      },
    },
    messages: {
      row: {
        select: [allowIfAuthenticatedRule],
        insert: [allowInsertOwnMessageRule],
        update: {
          preMutation: [allowUpdateOwnOrAdminRule], // Who can initiate an update
          postMutation: [allowIfPreMutationPassedRule], // What state is valid after update
        },
        // This delete rule applies if you use z.mutate.messages.delete(...)
        // Your custom deleteMessage mutator enforces admin-only on the server already.
        // For optimistic client-side `tx.mutate.messages.update` to mark as deleted,
        // the update rules above are more relevant.
        delete: [allowAdminToDeleteRule],
      },
    },
    // blockedWords and accounts are not synced to client as per drizzle-zero.config.ts
    // So no permissions needed here for Zero client operations.
  } satisfies PermissionsConfig<ZeroAuthData, Schema>;
});