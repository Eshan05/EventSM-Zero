import {
  boolean,
  timestamp,
  pgTable,
  text,
  varchar,
  primaryKey,
  index,
  pgEnum,
  uuid,
  integer,
  AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import type { AdapterAccountType } from "next-auth/adapters"

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().default(""),
    username: varchar("username", { length: 50 }).notNull().unique(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    emailVerified: timestamp("email_verified", { mode: "date", withTimezone: true })
      .default(new Date())
      .notNull(),
    hashedPassword: text("hashed_password").notNull(),
    role: userRoleEnum("role").notNull().default("user"),
    image: text("avatar_url"), // Will random generate
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => {
    return {
      usernameIdx: index("username_idx").on(table.username),
      emailIdx: index("email_idx").on(table.email),
    };
  }
);

export const accounts = pgTable(
  "account",
  {
    userId: uuid("id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    {
      compoundKey: primaryKey({
        columns: [account.provider, account.providerAccountId],
      }),
    },
  ]
)

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(), // This ID will sync with Zero's message ID
    eventId: uuid("event_id") // FK
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: uuid("user_id") // FK
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }), // If user is deleted, messages are too
    text: text("text").notNull(),
    replyToMessageId: uuid("reply_to_message_id").references(
      (): AnyPgColumn => messages.id,
      { onDelete: "set null" } // If replied-to message is deleted, keep reply but nullify link
    ), // For threaded replies
    isDeleted: boolean("is_deleted").default(false).notNull(),
    deletedByUserId: uuid("deleted_by_user_id").references(() => users.id),
    deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      eventIdIdx: index("event_id_idx").on(table.eventId),
      userIdIdx: index("user_id_idx").on(table.userId),
      createdAtIdx: index("created_at_idx").on(table.createdAt),
      eventUserIdx: index("event_user_idx").on(table.eventId, table.userId),
    };
  }
);

export const blockedWords = pgTable(
  "blocked_words",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    word: varchar("word", { length: 100 }).notNull().unique(),
    addedByUserId: uuid("added_by_user_id") // Admin who added the word
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }), // Prevent deleting admin if they've blocked words
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      wordIdx: index("word_idx").on(table.word),
    };
  }
);

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  messages: many(messages), // A user can have many messages
  blockedWordsAdded: many(blockedWords, { relationName: 'blockedWordsAddedByAdmin' }), // Admin who added blocked words
  messagesDeletedBy: many(messages, { relationName: 'messageDeletion' })
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));


export const messagesRelations = relations(messages, ({ one, many }) => ({
  event: one(events, {
    fields: [messages.eventId],
    references: [events.id],
  }),
  user: one(users, { // A message is sent by one user
    fields: [messages.userId],
    references: [users.id],
  }),
  parentMessage: one(messages, { // For the message this one is replying to
    relationName: 'repliesToParent',
    fields: [messages.replyToMessageId],
    references: [messages.id],
  }),
  replies: many(messages, { // For all messages that reply to this one
    relationName: 'repliesToParent',
  }),
  deletedBy: one(users, {
    relationName: 'messageDeletion', // Use the SAME name as the 'many' side on users
    fields: [messages.deletedByUserId],
    references: [users.id],
  }),
}));

export const blockedWordsRelations = relations(blockedWords, ({ one }) => ({
  addedByUser: one(users, { // A blocked word was added by one admin
    relationName: 'blockedWordsAddedByAdmin',
    fields: [blockedWords.addedByUserId],
    references: [users.id],
  }),
}));

// TODO: Add audit logs both for admin actions and user actions
// TODO: Enable editing messages but also show edit history
// TODO: Allow admins to make polls in the chat and maybe join/leave messages? (Maybe only visible to admins)
// TODO: Add a way for admin to block a specific user from sending messages in the active event
// Users cannot delete their onw messages, only admins can
