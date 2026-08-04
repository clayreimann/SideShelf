import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const bookmarks = sqliteTable(
  "bookmarks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    libraryItemId: text("library_item_id").notNull(),
    title: text("title").notNull(),
    time: real("time").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    syncedAt: integer("synced_at", { mode: "timestamp" }),
  },
  (table) => [index("bookmarks_user_library_idx").on(table.userId, table.libraryItemId)]
);

export type BookmarkRow = typeof bookmarks.$inferSelect;

export const pendingBookmarkOps = sqliteTable("pending_bookmark_ops", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  libraryItemId: text("library_item_id").notNull(),
  operationType: text("operation_type", { enum: ["create", "delete", "rename"] }).notNull(),
  bookmarkId: text("bookmark_id"),
  time: real("time").notNull(),
  title: text("title"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export type PendingBookmarkOpRow = typeof pendingBookmarkOps.$inferSelect;
