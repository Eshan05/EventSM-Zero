import { drizzleZeroConfig } from 'drizzle-zero';
import * as drizzleSchema from './db/schema.ts';
import { is } from 'drizzle-orm';

export default drizzleZeroConfig(drizzleSchema, {
  tables: {
    users: {
      id: true,
      name: false,
      username: true,
      role: true,
      image: true,
      hashedPassword: false,
      email: false,
      emailVerified: false,
      createdAt: false,
      updatedAt: false,
    },
    events: {
      id: true,
      name: true,
      codeName: true,
      description: true,
      isActive: true,
      createdAt: false,
    },
    eventParticipants: {
      idx: true,
      userId: true,
      eventId: true,
      customCooldownSeconds: true,
      role: true,
      lastSeenAt: true,
      currentPresence: true,
      createdAt: true,

      mutedUntil: true,
      mutedByUserId: true,
      isBanned: true,
      bannedAt: true,
      bannedByUserId: true
    },
    messages: {
      id: true,
      eventId: true,
      userId: true,
      text: true,
      replyToMessageId: true,
      isDeleted: true,
      createdAt: true,
      deletedAt: true,
      deletedByUserId: true,
    },
    blockedWords: false, // Probably not needed in Zero state directly, handled by mutator logic
    accounts: false
  },
  manyToMany: {
    // Define many-to-many relationships if any are directly represented in Zero
  },
  casing: 'camelCase',
  debug: false,
});