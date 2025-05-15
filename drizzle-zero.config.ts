import { drizzleZeroConfig } from 'drizzle-zero';
import * as drizzleSchema from './db/schema.ts';

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
      isActive: true,
      createdAt: false,
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